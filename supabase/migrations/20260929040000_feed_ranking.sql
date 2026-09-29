-- Phase 3, slice 6: the ranked feed (PRD 5.28 "Feed algorithm").
-- A 5-minute job moves posts through the distribution stages; feed_page scores the
-- candidates for one reader, applies diversity and exploration, and stores the ordered
-- ids in feed_sessions for 10 minutes so paging never repeats or skips.
-- Every weight and threshold is in platform_config (`feed.*`).

insert into public.platform_config (key, version, value, reason) values
  ('feed.score', 1, '{"base": 0.15, "gravity": 1.5, "bayes_k": 10, "platform_mean": 0.6, "credible_penalty_max": 0.8, "credible_penalty_factor": 2, "conversation": 0.5, "friend_commenter": 0.5, "min_comment_chars": 10}', 'PRD 5.28 launch values'),
  ('feed.relevance', 1, '{"friend": 1.4, "follows_venture": 1.4, "same_program": 1.2, "same_batch": 1.1, "skills_max": 1.3, "skills_step": 0.1, "cap": 2.0}', 'PRD 5.28; program = department + graduation year (decisions.md 2026-09-28)'),
  ('feed.diversity', 1, '{"seen": 0.3, "same_author_page": 0.5, "page_size": 20}', 'PRD 5.28'),
  ('feed.stages', 1, '{"seed_hours": 2, "seed_views": 30, "full_answers": 5, "full_positive": 0.4, "full_commenters": 3, "boost_answers": 10, "boost_positive": 0.5, "boost_commenters": 5, "boost_universities": 2, "demote_answers": 10, "demote_credible_negative": 0.3, "demote_hide_rate": 0.3, "demote_min_views": 10, "held_reports": 3}', 'PRD 5.28 trigger table'),
  ('feed.placement', 1, '{"limited_outside_seed": 0.4, "global_boost": 1.5, "demoted": 0.3, "shipped_boost": 1.5, "shipped_boost_hours": 24}', 'PRD 5.28'),
  ('feed.window', 1, '{"max_age_days": 7, "shipped_age_days": 14, "exploration_every": 5, "exploration_max_hours": 2, "session_minutes": 10, "candidates": 300}', 'PRD 5.28');

-- ---------------------------------------------------------------------------
-- Stages
-- ---------------------------------------------------------------------------
-- Distinct non-friend commenters (10+ characters, not the author).
create function private.nonfriend_commenters(p_post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct c.author_id)::integer
    from public.post_comments c join public.posts p on p.id = c.post_id
   where c.post_id = p_post and c.deleted_at is null and c.author_id <> p.author_id
     and char_length(c.body) >= coalesce((private.config('feed.score')->>'min_comment_chars')::integer, 10)
     and not private.are_friends(c.author_id, p.author_id);
$$;
revoke all on function private.nonfriend_commenters(uuid) from public;

-- The stage a post should be in now (PRD 5.28 trigger table). Full is sticky: a post that
-- reached Full (or Global boost) doesn't drop back to Limited.
create function private.compute_stage(p_post uuid)
returns public.post_stage
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.posts;
  s public.post_stats;
  c jsonb := coalesce(private.config('feed.stages'), '{}'::jsonb);
  v_cred_answers integer;
  v_cred_crosses integer;
  v_nonfriends integer;
  v_positive_rate numeric;
begin
  select * into p from public.posts where id = p_post;
  select * into s from public.post_stats where post_id = p_post;
  if p is null then
    return null;
  end if;
  if coalesce(s.reports, 0) >= coalesce((c->>'held_reports')::integer, 3) then
    return 'held';
  end if;
  select coalesce(sum(ticks + crosses), 0), coalesce(sum(crosses), 0) into v_cred_answers, v_cred_crosses
    from public.post_survey_counts where post_id = p_post and dimension = 'credible';
  if (v_cred_answers >= coalesce((c->>'demote_answers')::integer, 10)
        and v_cred_crosses::numeric / v_cred_answers >= coalesce((c->>'demote_credible_negative')::numeric, 0.3))
     or (coalesce(s.views, 0) >= coalesce((c->>'demote_min_views')::integer, 10)
        and coalesce(s.hides, 0)::numeric / s.views >= coalesce((c->>'demote_hide_rate')::numeric, 0.3)) then
    return 'demoted';
  end if;

  v_positive_rate := case when coalesce(s.answers, 0) > 0 then s.positives::numeric / s.answers else 0 end;
  if p.audience = 'global'
     and ((coalesce(s.answers, 0) >= coalesce((c->>'boost_answers')::integer, 10) and v_positive_rate >= coalesce((c->>'boost_positive')::numeric, 0.5))
          or (coalesce(s.commenters, 0) >= coalesce((c->>'boost_commenters')::integer, 5)
              and coalesce(s.commenter_universities, 0) >= coalesce((c->>'boost_universities')::integer, 2))) then
    return 'global_boost';
  end if;
  if p.stage in ('full', 'global_boost') or p.type = 'shipped' then
    return 'full';
  end if;
  v_nonfriends := private.nonfriend_commenters(p_post);
  if (coalesce(s.answers, 0) >= coalesce((c->>'full_answers')::integer, 5) and v_positive_rate >= coalesce((c->>'full_positive')::numeric, 0.4))
     or v_nonfriends >= coalesce((c->>'full_commenters')::integer, 3) then
    return 'full';
  end if;
  if p.created_at > now() - make_interval(hours => coalesce((c->>'seed_hours')::integer, 2))
     and coalesce(s.views, 0) < coalesce((c->>'seed_views')::integer, 30) then
    return 'seed';
  end if;
  return 'limited';
end;
$$;
revoke all on function private.compute_stage(uuid) from public;

create function private.feed_stage_job()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_changed integer := 0;
  r record;
  v_new public.post_stage;
begin
  v_run := public.job_run_start('feed-stage');
  begin
    for r in
      select p.id, p.stage from public.posts p
       where p.created_at > now() - make_interval(days => coalesce((private.config('feed.window')->>'shipped_age_days')::integer, 14))
    loop
      v_new := private.compute_stage(r.id);
      if v_new is not null and v_new is distinct from r.stage then
        update public.posts set stage = v_new, stage_changed_at = now() where id = r.id;
        v_changed := v_changed + 1;
      end if;
    end loop;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', v_changed, sqlerrm);
    return v_changed;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_changed);
  return v_changed;
end;
$$;
revoke all on function private.feed_stage_job() from public;
select cron.schedule('feed-stage', '*/5 * * * *', $$select private.feed_stage_job()$$);

-- Reports move a post to Held at once (slice 9 writes post_stats.reports).
create function private.held_on_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reports >= coalesce((private.config('feed.stages')->>'held_reports')::integer, 3)
     and coalesce(old.reports, 0) < new.reports then
    update public.posts set stage = 'held', stage_changed_at = now() where id = new.post_id and stage <> 'held';
  end if;
  return null;
end;
$$;
revoke all on function private.held_on_reports() from public;
create trigger post_stats_held after update of reports on public.post_stats
  for each row execute function private.held_on_reports();

-- ---------------------------------------------------------------------------
-- Seed audience and scoring
-- ---------------------------------------------------------------------------
-- The seed audience: the author's friends, same program (department + graduation year),
-- followers of a linked venture, and for Global posts the author's university.
create function private.in_seed_audience(p_post uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.posts p
      join public.profiles a on a.user_id = p.author_id
      join public.profiles v on v.user_id = p_viewer
     where p.id = p_post
       and (
         p.author_id = p_viewer
         or private.are_friends(p.author_id, p_viewer)
         or (a.department is not null and a.department = v.department and a.graduation_year = v.graduation_year
             and a.university_id = v.university_id)
         or (p.venture_id is not null and exists (
               select 1 from public.venture_follows f where f.venture_id = p.venture_id and f.user_id = p_viewer))
         or (p.audience = 'global' and a.university_id = v.university_id)
       )
  );
$$;
revoke all on function private.in_seed_audience(uuid, uuid) from public;

-- Score for one post shown to one reader (PRD 5.28):
--   (base + Q) × (1 + E) × R × D ÷ (age_hours + 2)^G, then the stage placement.
-- Diversity within a page is applied by feed_page. Kept separate so fixtures can check it.
create function private.feed_score(p_post uuid, p_viewer uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.posts;
  sc jsonb := coalesce(private.config('feed.score'), '{}'::jsonb);
  rc jsonb := coalesce(private.config('feed.relevance'), '{}'::jsonb);
  dc jsonb := coalesce(private.config('feed.diversity'), '{}'::jsonb);
  pc jsonb := coalesce(private.config('feed.placement'), '{}'::jsonb);
  v_k numeric := coalesce((sc->>'bayes_k')::numeric, 10);
  v_mean numeric := coalesce((sc->>'platform_mean')::numeric, 0.6);
  v_pos numeric;
  v_total numeric;
  v_cred_rate numeric;
  q numeric;
  e numeric;
  r numeric := 1;
  d numeric := 1;
  v_commenters numeric;
  v_overlap integer;
  a public.profiles;
  v public.profiles;
  v_age numeric;
  v_score numeric;
begin
  select * into p from public.posts where id = p_post;
  if not found then
    return 0;
  end if;
  if exists (select 1 from public.user_mutes m where m.user_id = p_viewer and m.muted_id = p.author_id) then
    return 0;
  end if;
  select * into a from public.profiles where user_id = p.author_id;
  select * into v from public.profiles where user_id = p_viewer;

  -- Q: Bayesian average of weighted positives on Informative and Interesting, reduced by
  -- the Credible negative rate.
  select coalesce(sum(weighted_ticks), 0), coalesce(sum(weighted_ticks + weighted_crosses), 0) into v_pos, v_total
    from public.post_survey_counts where post_id = p_post and dimension in ('informative', 'interesting');
  select case when sum(ticks + crosses) > 0 then sum(crosses)::numeric / sum(ticks + crosses) else 0 end into v_cred_rate
    from public.post_survey_counts where post_id = p_post and dimension = 'credible';
  q := (v_pos + v_k * v_mean) / (v_total + v_k)
       * (1 - least(coalesce((sc->>'credible_penalty_max')::numeric, 0.8),
                    coalesce((sc->>'credible_penalty_factor')::numeric, 2) * coalesce(v_cred_rate, 0)));

  -- E: 0.5 × ln(1 + distinct commenters); friends of the author count half; short comments
  -- and the author don't count.
  select coalesce(sum(case when private.are_friends(x.author_id, p.author_id) then coalesce((sc->>'friend_commenter')::numeric, 0.5) else 1 end), 0)
    into v_commenters
    from (select distinct c.author_id from public.post_comments c
           where c.post_id = p_post and c.deleted_at is null and c.author_id <> p.author_id
             and char_length(c.body) >= coalesce((sc->>'min_comment_chars')::integer, 10)) x;
  e := coalesce((sc->>'conversation')::numeric, 0.5) * ln(1 + v_commenters);

  -- R: relevance to this reader, multiplied and capped.
  if private.are_friends(p.author_id, p_viewer) then
    r := r * coalesce((rc->>'friend')::numeric, 1.4);
  end if;
  if p.venture_id is not null and exists (select 1 from public.venture_follows f where f.venture_id = p.venture_id and f.user_id = p_viewer) then
    r := r * coalesce((rc->>'follows_venture')::numeric, 1.4);
  end if;
  if a.department is not null and a.department = v.department and a.graduation_year = v.graduation_year then
    r := r * coalesce((rc->>'same_program')::numeric, 1.2);
  end if;
  if a.graduation_year is not null and a.graduation_year = v.graduation_year then
    r := r * coalesce((rc->>'same_batch')::numeric, 1.1);
  end if;
  select count(*) into v_overlap
    from public.user_skills sa join public.user_skills sv on sv.skill_id = sa.skill_id
   where sa.user_id = p.author_id and sv.user_id = p_viewer and sa.level >= 1 and sv.level >= 1;
  r := r * least(coalesce((rc->>'skills_max')::numeric, 1.3), 1 + coalesce((rc->>'skills_step')::numeric, 0.1) * v_overlap);
  r := least(r, coalesce((rc->>'cap')::numeric, 2.0));

  -- D: already seen.
  if exists (select 1 from public.post_views pv where pv.post_id = p_post and pv.user_id = p_viewer) then
    d := d * coalesce((dc->>'seen')::numeric, 0.3);
  end if;

  v_age := greatest(extract(epoch from (now() - p.created_at)) / 3600, 0);
  v_score := (coalesce((sc->>'base')::numeric, 0.15) + q) * (1 + e) * r * d
             / power(v_age + 2, coalesce((sc->>'gravity')::numeric, 1.5));

  -- Stage placement.
  if p.stage = 'limited' and not private.in_seed_audience(p_post, p_viewer) then
    v_score := v_score * coalesce((pc->>'limited_outside_seed')::numeric, 0.4);
  elsif p.stage = 'global_boost' then
    v_score := v_score * coalesce((pc->>'global_boost')::numeric, 1.5);
  elsif p.stage = 'demoted' then
    v_score := v_score * coalesce((pc->>'demoted')::numeric, 0.3);
  end if;
  if p.type = 'shipped' and p.created_at > now() - make_interval(hours => coalesce((pc->>'shipped_boost_hours')::integer, 24)) then
    v_score := v_score * coalesce((pc->>'shipped_boost')::numeric, 1.5);
  end if;
  return v_score;
end;
$$;
revoke all on function private.feed_score(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Sessions and pages
-- ---------------------------------------------------------------------------
create table public.feed_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  audience public.post_audience not null,
  filter text not null check (filter in ('all', 'ventures', 'events', 'announcements', 'shipped')),
  post_ids uuid[] not null,
  created_at timestamptz not null default now()
);
comment on table public.feed_sessions is
  'A reader''s ordered feed for 10 minutes (PRD 5.28), so paging never repeats or skips. One per open feed (each tab keeps its own).';
create index feed_sessions_user_idx on public.feed_sessions (user_id, created_at desc);
create index feed_sessions_created_idx on public.feed_sessions (created_at);
alter table public.feed_sessions enable row level security;
revoke all on table public.feed_sessions from anon, authenticated;
-- No grants: only feed_page reads and writes sessions.

-- Builds the ordered list for a reader: ranked candidates with diversity (no author twice
-- in a row; a second post by the same author on a page counts half) and 1 exploration
-- slot in every 5 for a Seed post under 2 hours old.
create function private.build_feed(p_viewer uuid, p_audience public.post_audience, p_filter text, p_exclude uuid[])
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  wc jsonb := coalesce(private.config('feed.window'), '{}'::jsonb);
  dc jsonb := coalesce(private.config('feed.diversity'), '{}'::jsonb);
  v_uni uuid;
  v_page integer := coalesce((dc->>'page_size')::integer, 20);
  v_same numeric := coalesce((dc->>'same_author_page')::numeric, 0.5);
  v_every integer := coalesce((wc->>'exploration_every')::integer, 5);
  v_out uuid[] := '{}';
  v_last_author uuid;
  v_page_authors jsonb := '{}'::jsonb;
  v_pick record;
  v_explore uuid;
  v_n integer;
  i integer := 0;
begin
  select university_id into v_uni from public.profiles where user_id = p_viewer;

  if to_regclass('pg_temp.feed_candidates') is null then
    create temporary table feed_candidates (id uuid primary key, author_id uuid, score numeric, stage public.post_stage, created_at timestamptz) on commit drop;
  else
    truncate pg_temp.feed_candidates;
  end if;
  insert into pg_temp.feed_candidates (id, author_id, score, stage, created_at)
  select p.id, p.author_id, private.feed_score(p.id, p_viewer), p.stage, p.created_at
    from public.posts p
   where private.can_view_post(p.id)
     and p.stage <> 'held'
     and not (p.id = any (coalesce(p_exclude, '{}')))
     and (p.pinned_until is null or p.pinned_until <= now())
     and p.created_at > now() - make_interval(days => case when p.type = 'shipped'
                                                           then coalesce((wc->>'shipped_age_days')::integer, 14)
                                                           else coalesce((wc->>'max_age_days')::integer, 7) end)
     and case p_audience when 'university' then p.university_id = v_uni else p.audience = 'global' end
     and case p_filter
           when 'ventures' then p.type = 'invite'
           when 'events' then p.type = 'event'
           when 'announcements' then p.type = 'announcement'
           when 'shipped' then p.type = 'shipped'
           else true
         end
     and not exists (select 1 from public.post_hides h where h.user_id = p_viewer and h.post_id = p.id)
     and not exists (select 1 from public.user_mutes m where m.user_id = p_viewer and m.muted_id = p.author_id)
     -- Seed posts reach only their seed audience (plus exploration slots, below).
     and (p.stage <> 'seed' or private.in_seed_audience(p.id, p_viewer))
   order by 3 desc
   limit coalesce((wc->>'candidates')::integer, 300);

  select count(*) into v_n from pg_temp.feed_candidates;
  loop
    i := i + 1;
    -- Exploration: every 5th slot, a Seed post under 2 hours old from outside the list.
    if i % v_every = 0 then
      select p.id into v_explore
        from public.posts p
       where p.stage = 'seed'
         and p.created_at > now() - make_interval(hours => coalesce((wc->>'exploration_max_hours')::integer, 2))
         and p.author_id <> p_viewer
         and not (p.id = any (v_out)) and not (p.id = any (coalesce(p_exclude, '{}')))
         and not exists (select 1 from pg_temp.feed_candidates fc where fc.id = p.id)
         and private.can_view_post(p.id)
         and case p_audience when 'university' then p.university_id = v_uni else p.audience = 'global' end
         and (p_filter = 'all' or p.type = case p_filter when 'ventures' then 'invite' when 'events' then 'event'
                                                          when 'announcements' then 'announcement' else 'shipped' end::public.post_type)
         and not exists (select 1 from public.post_hides h where h.user_id = p_viewer and h.post_id = p.id)
         and not exists (select 1 from public.user_mutes m where m.user_id = p_viewer and m.muted_id = p.author_id)
         and not exists (select 1 from public.post_views pv where pv.post_id = p.id and pv.user_id = p_viewer)
       order by random()
       limit 1;
      if v_explore is not null then
        v_out := v_out || v_explore;
        v_explore := null;
        continue;
      end if;
    end if;
    exit when v_n = 0;
    -- Best adjusted score, avoiding the same author twice in a row when possible.
    select fc.id, fc.author_id into v_pick
      from pg_temp.feed_candidates fc
     order by (fc.author_id = v_last_author) asc,
              fc.score * power(v_same, coalesce((v_page_authors->>fc.author_id::text)::integer, 0)) desc,
              fc.created_at desc
     limit 1;
    exit when v_pick.id is null;
    v_out := v_out || v_pick.id;
    delete from pg_temp.feed_candidates where id = v_pick.id;
    v_n := v_n - 1;
    v_last_author := v_pick.author_id;
    if array_length(v_out, 1) % v_page = 0 then
      v_page_authors := '{}'::jsonb;
    else
      v_page_authors := jsonb_set(v_page_authors, array[v_pick.author_id::text],
                                  to_jsonb(coalesce((v_page_authors->>v_pick.author_id::text)::integer, 0) + 1));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function private.build_feed(uuid, public.post_audience, text, uuid[]) from public;

-- One page of the ranked feed. p_cursor null starts a fresh session (first load or the
-- "new posts" pill); otherwise "<session_id>:<offset>" continues that session. Each open
-- feed keeps its own session, so two tabs never disturb each other. A session older than
-- 10 minutes is re-ranked without the posts already served, keeping their positions, so
-- nothing repeats and the cursor stays valid.
create function private.feed_page(p_audience public.post_audience, p_filter text, p_cursor text, p_limit integer default 20)
returns table (post_id uuid, rank integer, next_cursor text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_filter text := coalesce(nullif(p_filter, ''), 'all');
  v_session public.feed_sessions;
  v_minutes integer := coalesce((private.config('feed.window')->>'session_minutes')::integer, 10);
  v_sid uuid;
  v_offset integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_ids uuid[];
  v_served uuid[];
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_filter not in ('all', 'ventures', 'events', 'announcements', 'shipped') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  if p_cursor is not null then
    begin
      v_sid := split_part(p_cursor, ':', 1)::uuid;
      v_offset := greatest(split_part(p_cursor, ':', 2)::integer, 0);
    exception when others then
      raise exception 'bad cursor' using errcode = '22023';
    end;
    select * into v_session from public.feed_sessions
     where session_id = v_sid and user_id = v_me and audience = p_audience and filter = v_filter;
  end if;

  if v_session.session_id is not null and v_session.created_at > now() - make_interval(mins => v_minutes) then
    v_ids := v_session.post_ids;
  else
    v_served := case when v_session.session_id is not null then v_session.post_ids[1:v_offset] else '{}' end;
    if v_session.session_id is null then
      v_offset := 0;
    end if;
    v_ids := v_served || private.build_feed(v_me, p_audience, v_filter, v_served);
    insert into public.feed_sessions (user_id, audience, filter, post_ids)
    values (v_me, p_audience, v_filter, v_ids)
    returning session_id into v_sid;
    -- Keep a reader's sessions bounded.
    delete from public.feed_sessions f
     where f.user_id = v_me and f.session_id not in (
       select f2.session_id from public.feed_sessions f2 where f2.user_id = v_me order by f2.created_at desc limit 10);
  end if;

  return query
  select x.id, (v_offset + x.ord)::integer,
         case when v_offset + v_limit < coalesce(cardinality(v_ids), 0) then v_sid::text || ':' || (v_offset + v_limit)::text end
    from unnest(v_ids[v_offset + 1 : v_offset + v_limit]) with ordinality as x(id, ord)
   where private.can_view_post(x.id)
   order by x.ord;
end;
$$;

-- The pinned announcement (at most one), above the ranked feed and unscored.
create function private.pinned_announcement()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.posts p
   where p.pinned_until > now() and private.can_view_post(p.id)
     and not exists (select 1 from public.post_hides h where h.user_id = (select auth.uid()) and h.post_id = p.id)
   order by p.created_at desc limit 1;
$$;

-- Venture updates for followers: unscored cards after the ranked posts (decisions.md
-- 2026-09-28), last 7 days, newest first.
create function private.followed_venture_updates(p_limit integer default 10)
returns table (id uuid, venture_id uuid, venture_title text, body text, created_at timestamptz,
               author_name text, author_username text, images jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, v.id, v.title, u.body, u.created_at, pr.full_name,
         case when private.can_view_profile(u.author_id) then pr.username end,
         coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height) order by m.position)
                     from public.venture_update_media m where m.update_id = u.id), '[]'::jsonb)
    from public.venture_follows f
    join public.ventures v on v.id = f.venture_id
    join public.venture_updates u on u.venture_id = v.id
    join public.profiles pr on pr.user_id = u.author_id
   where f.user_id = (select auth.uid())
     and u.created_at > now() - interval '7 days'
     and private.can_view_venture(v.id)
     and not private.is_blocked_with(u.author_id)
   order by u.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

revoke all on function private.feed_page(public.post_audience, text, text, integer), private.pinned_announcement(),
  private.followed_venture_updates(integer) from public;
grant execute on function private.feed_page(public.post_audience, text, text, integer), private.pinned_announcement(),
  private.followed_venture_updates(integer) to authenticated;

create function public.feed_page(p_audience public.post_audience, p_filter text default 'all', p_cursor text default null, p_limit integer default 20)
returns table (post_id uuid, rank integer, next_cursor text)
  language sql volatile security invoker set search_path = ''
  as $$ select * from private.feed_page(p_audience, p_filter, p_cursor, p_limit) $$;
create function public.pinned_announcement() returns uuid
  language sql stable security invoker set search_path = '' as $$ select private.pinned_announcement() $$;
create function public.followed_venture_updates(p_limit integer default 10)
returns table (id uuid, venture_id uuid, venture_title text, body text, created_at timestamptz,
               author_name text, author_username text, images jsonb)
  language sql stable security invoker set search_path = '' as $$ select * from private.followed_venture_updates(p_limit) $$;

revoke all on function public.feed_page(public.post_audience, text, text, integer), public.pinned_announcement(),
  public.followed_venture_updates(integer) from public, anon;
grant execute on function public.feed_page(public.post_audience, text, text, integer), public.pinned_announcement(),
  public.followed_venture_updates(integer) to authenticated;

-- Stale sessions go nightly.
select cron.schedule('purge-feed-sessions', '53 3 * * *', $$delete from public.feed_sessions where created_at < now() - interval '1 day'$$);
