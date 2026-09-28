-- Phase 3, slice 5: the micro-survey (PRD 5.28 "Micro-survey"), qualified views and the
-- per-post counters the ranked feed (slice 6) reads. Also platform_config (PRD 5.26):
-- versioned settings read through config(key); the /ops editor comes in phase 11.

-- ---------------------------------------------------------------------------
-- platform_config
-- ---------------------------------------------------------------------------
create table public.platform_config (
  key text not null check (key ~ '^[a-z][a-z0-9_.]{1,80}$'),
  version integer not null check (version >= 1),
  value jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  staff_id uuid references auth.users (id) on delete set null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (key, version)
);
comment on table public.platform_config is
  'Versioned platform settings (PRD 5.26). The newest effective version of a key wins; rows are never edited.';
create index platform_config_key_effective_idx on public.platform_config (key, effective_at desc);

create function private.config_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'platform_config is versioned: add a new version instead' using errcode = '42501';
end;
$$;
revoke all on function private.config_append_only() from public;
create trigger platform_config_no_update before update or delete on public.platform_config
  for each row execute function private.config_append_only();

-- The latest effective value of a key (null if unset).
create function private.config(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.value from public.platform_config c
   where c.key = p_key and c.effective_at <= now()
   order by c.effective_at desc, c.version desc
   limit 1;
$$;
revoke all on function private.config(text) from public;

alter table public.platform_config enable row level security;
revoke all on table public.platform_config from anon, authenticated;
grant select on table public.platform_config to authenticated;
create policy platform_config_staff_read on public.platform_config for select to authenticated
  using ((select private.is_staff()));

insert into public.platform_config (key, version, value, reason) values
  ('survey.shares', 1, '{"informative": 0.25, "interesting": 0.25, "rest": 0.5}', 'PRD 5.28 launch values'),
  ('survey.public_min', 1, '3', 'PRD 5.28: a public part shows from 3 positive answers'),
  ('survey.change_minutes', 1, '10', 'PRD 5.28: an answer can change for 10 minutes'),
  ('survey.min_latency_ms', 1, '800', 'PRD 5.28: answers under 0.8 s are discarded'),
  ('survey.weights', 1, '{"friend_or_teammate": 0.5, "new_account": 0.5, "new_account_days": 3, "straight_liner": 0.3, "straight_liner_min": 20}', 'PRD 5.28 anti-gaming'),
  ('survey.appropriate_flag_min', 1, '3', 'PRD 5.28: 3 Appropriate crosses from non-friends flag the post for /ops');

-- ---------------------------------------------------------------------------
-- Question bank (seeded; editable in /ops in phase 11)
-- ---------------------------------------------------------------------------
create table public.micro_survey_dimensions (
  dimension text primary key check (dimension ~ '^[a-z_]{3,40}$'),
  label text not null,
  public boolean not null default false,
  -- The public line wording, e.g. "find this informative".
  public_phrase text,
  post_types public.post_type[] not null,
  -- Safety signals win ties (PRD 5.28).
  tie_priority smallint not null default 0,
  check (not public or public_phrase is not null),
  check (not post_types && array['announcement', 'poll']::public.post_type[])
);

create table public.micro_survey_questions (
  id smallint generated always as identity primary key,
  dimension text not null references public.micro_survey_dimensions (dimension),
  text text not null check (char_length(text) between 5 and 120),
  active boolean not null default true,
  unique (dimension, text)
);
create index micro_survey_questions_dimension_idx on public.micro_survey_questions (dimension) where active;

insert into public.micro_survey_dimensions (dimension, label, public, public_phrase, post_types, tie_priority) values
  ('informative', 'Informative', true, 'find this informative', '{general,invite,event,shipped}', 0),
  ('interesting', 'Interesting', true, 'find this interesting', '{general,invite,event,shipped}', 0),
  ('relevant', 'Relevant', false, null, '{general,invite,event,shipped}', 0),
  ('credible', 'Credible', false, null, '{general,invite,event,shipped}', 2),
  ('useful', 'Useful', false, null, '{general,shipped}', 0),
  ('clear', 'Clear', false, null, '{general,invite,event}', 0),
  ('original', 'Original', false, null, '{general,shipped}', 0),
  ('worth_sharing', 'Worth sharing', false, null, '{general,invite,event,shipped}', 0),
  ('appropriate', 'Appropriate', false, null, '{general,invite,event,shipped}', 1),
  ('impressive', 'Impressive work', false, null, '{shipped}', 0),
  ('would_join', 'Would join', false, null, '{invite}', 0),
  ('would_attend', 'Would attend', false, null, '{event}', 0);

insert into public.micro_survey_questions (dimension, text) values
  ('informative', 'Did you learn something from this?'),
  ('informative', 'Was this informative?'),
  ('interesting', 'Was this interesting to you?'),
  ('interesting', 'Would you want to see more like this?'),
  ('relevant', 'Is this relevant to you?'),
  ('relevant', 'Does this matter to students like you?'),
  ('credible', 'Does this seem accurate?'),
  ('credible', 'Do you trust this information?'),
  ('useful', 'Could you use this in your own work or studies?'),
  ('useful', 'Is this useful to you?'),
  ('clear', 'Was this clearly explained?'),
  ('clear', 'Is it clear what this is about?'),
  ('original', 'Is this something new to you?'),
  ('original', 'Is this original work or thinking?'),
  ('worth_sharing', 'Should more students see this?'),
  ('worth_sharing', 'Would you tell a friend about this?'),
  ('appropriate', 'Is this appropriate for Skilient?'),
  ('impressive', 'Is this impressive work?'),
  ('impressive', 'Would you be proud to have built this?'),
  ('would_join', 'Would you join a project like this?'),
  ('would_join', 'Does this team sound worth joining?'),
  ('would_attend', 'Would you attend something like this?'),
  ('would_attend', 'Does this event sound worth going to?'),
  ('relevant', 'Is this useful for your degree or career?'),
  ('credible', 'Does this sound like it''s from someone who knows?');

-- ---------------------------------------------------------------------------
-- Views, assignments, responses and counters
-- ---------------------------------------------------------------------------
create table public.post_views (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_views_user_idx on public.post_views (user_id, first_seen_at desc);

create table public.micro_survey_assignments (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id smallint not null references public.micro_survey_questions (id),
  dimension text not null references public.micro_survey_dimensions (dimension),
  assigned_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index micro_survey_assignments_user_idx on public.micro_survey_assignments (user_id);
create index micro_survey_assignments_question_idx on public.micro_survey_assignments (question_id);
create index micro_survey_assignments_dimension_idx on public.micro_survey_assignments (dimension);

create table public.micro_survey_responses (
  post_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id smallint not null references public.micro_survey_questions (id),
  dimension text not null references public.micro_survey_dimensions (dimension),
  answer boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  weight numeric(4, 3) not null check (weight > 0 and weight <= 1),
  created_at timestamptz not null default now(),
  locked_at timestamptz not null,
  updated_at timestamptz,
  primary key (post_id, user_id),
  foreign key (post_id, user_id) references public.micro_survey_assignments (post_id, user_id) on delete cascade
);
create index micro_survey_responses_user_idx on public.micro_survey_responses (user_id, created_at desc);
create index micro_survey_responses_question_idx on public.micro_survey_responses (question_id);
create index micro_survey_responses_dimension_idx on public.micro_survey_responses (dimension);

-- Per post and dimension: raw people who ticked/crossed and the weighted sums.
create table public.post_survey_counts (
  post_id uuid not null references public.posts (id) on delete cascade,
  dimension text not null references public.micro_survey_dimensions (dimension),
  assigned integer not null default 0,
  ticks integer not null default 0,
  crosses integer not null default 0,
  weighted_ticks numeric not null default 0,
  weighted_crosses numeric not null default 0,
  primary key (post_id, dimension)
);
create index post_survey_counts_dimension_idx on public.post_survey_counts (dimension);

-- The feed's per-post counters (slice 6 reads them; reports arrive in slice 9).
create table public.post_stats (
  post_id uuid primary key references public.posts (id) on delete cascade,
  views integer not null default 0,
  hides integer not null default 0,
  answers integer not null default 0,
  positives integer not null default 0,
  commenters integer not null default 0,
  commenter_universities integer not null default 0,
  appropriate_flags integer not null default 0,
  reports integer not null default 0,
  updated_at timestamptz not null default now()
);

create function private.bump_stat(p_post uuid, p_column text, p_delta integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  execute format(
    'insert into public.post_stats (post_id, %1$I) values ($1, greatest($2, 0))
     on conflict (post_id) do update set %1$I = greatest(public.post_stats.%1$I + $2, 0), updated_at = now()',
    p_column)
  using p_post, p_delta;
end;
$$;
revoke all on function private.bump_stat(uuid, text, integer) from public;

create function private.stats_on_view()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_stat(new.post_id, 'views', 1);
  return null;
end;
$$;
create trigger post_views_stats after insert on public.post_views for each row execute function private.stats_on_view();

create function private.stats_on_hide()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.bump_stat(new.post_id, 'hides', 1);
  else
    perform private.bump_stat(old.post_id, 'hides', -1);
  end if;
  return null;
end;
$$;
create trigger post_hides_stats after insert or delete on public.post_hides for each row execute function private.stats_on_hide();

-- Distinct commenters (not the author, comments of 10+ characters) and their universities.
create function private.stats_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  insert into public.post_stats (post_id, commenters, commenter_universities)
  select v_post,
         count(distinct c.author_id),
         count(distinct pr.university_id)
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    join public.profiles pr on pr.user_id = c.author_id
   where c.post_id = v_post and c.deleted_at is null and c.author_id <> p.author_id and char_length(c.body) >= 10
  on conflict (post_id) do update
    set commenters = excluded.commenters, commenter_universities = excluded.commenter_universities, updated_at = now();
  return null;
end;
$$;
create trigger post_comments_stats after insert or update of deleted_at on public.post_comments
  for each row execute function private.stats_on_comment();

create function private.stats_on_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.post_survey_counts (post_id, dimension, assigned) values (new.post_id, new.dimension, 1)
  on conflict (post_id, dimension) do update set assigned = public.post_survey_counts.assigned + 1;
  return null;
end;
$$;
create trigger micro_survey_assignments_stats after insert on public.micro_survey_assignments
  for each row execute function private.stats_on_assignment();

-- Keeps the counts in step with inserts and changed answers; flags a post for /ops once
-- enough non-friends cross Appropriate.
create function private.stats_on_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_flags integer;
begin
  if tg_op = 'UPDATE' then
    update public.post_survey_counts
       set ticks = ticks - (case when old.answer then 1 else 0 end),
           crosses = crosses - (case when old.answer then 0 else 1 end),
           weighted_ticks = weighted_ticks - (case when old.answer then old.weight else 0 end),
           weighted_crosses = weighted_crosses - (case when old.answer then 0 else old.weight end)
     where post_id = old.post_id and dimension = old.dimension;
    perform private.bump_stat(old.post_id, 'positives', case when old.answer then -1 else 0 end);
  else
    perform private.bump_stat(new.post_id, 'answers', 1);
  end if;
  update public.post_survey_counts
     set ticks = ticks + (case when new.answer then 1 else 0 end),
         crosses = crosses + (case when new.answer then 0 else 1 end),
         weighted_ticks = weighted_ticks + (case when new.answer then new.weight else 0 end),
         weighted_crosses = weighted_crosses + (case when new.answer then 0 else new.weight end)
   where post_id = new.post_id and dimension = new.dimension;
  perform private.bump_stat(new.post_id, 'positives', case when new.answer then 1 else 0 end);

  if new.dimension = 'appropriate' then
    select p.author_id into v_author from public.posts p where p.id = new.post_id;
    select count(*) into v_flags
      from public.micro_survey_responses r
     where r.post_id = new.post_id and r.dimension = 'appropriate' and not r.answer
       and not private.are_friends(r.user_id, v_author);
    update public.post_stats set appropriate_flags = v_flags, updated_at = now() where post_id = new.post_id;
  end if;
  return null;
end;
$$;
create trigger micro_survey_responses_stats after insert or update of answer on public.micro_survey_responses
  for each row execute function private.stats_on_response();

revoke all on function private.stats_on_view(), private.stats_on_hide(), private.stats_on_comment(),
  private.stats_on_assignment(), private.stats_on_response() from public;

-- Every post gets its counter row when it's created.
create function private.stats_on_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.post_stats (post_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
revoke all on function private.stats_on_post() from public;
create trigger posts_stats after insert on public.posts for each row execute function private.stats_on_post();

-- Backfill counters for posts made before this slice.
insert into public.post_stats (post_id) select id from public.posts on conflict do nothing;
update public.post_stats s set hides = (select count(*) from public.post_hides h where h.post_id = s.post_id);

-- ---------------------------------------------------------------------------
-- RLS: nobody reads other people's views or answers; counters only through functions
-- ---------------------------------------------------------------------------
alter table public.micro_survey_dimensions enable row level security;
alter table public.micro_survey_questions enable row level security;
alter table public.post_views enable row level security;
alter table public.micro_survey_assignments enable row level security;
alter table public.micro_survey_responses enable row level security;
alter table public.post_survey_counts enable row level security;
alter table public.post_stats enable row level security;
revoke all on table public.micro_survey_dimensions, public.micro_survey_questions, public.post_views,
  public.micro_survey_assignments, public.micro_survey_responses, public.post_survey_counts, public.post_stats
  from anon, authenticated;
grant select on table public.micro_survey_dimensions, public.micro_survey_questions, public.post_views,
  public.micro_survey_assignments, public.micro_survey_responses to authenticated;

create policy micro_survey_dimensions_read on public.micro_survey_dimensions for select to authenticated using (true);
create policy micro_survey_questions_read on public.micro_survey_questions for select to authenticated using (active);
create policy post_views_read_own on public.post_views for select to authenticated using (user_id = (select auth.uid()));
create policy micro_survey_assignments_read_own on public.micro_survey_assignments for select to authenticated
  using (user_id = (select auth.uid()));
create policy micro_survey_responses_read_own on public.micro_survey_responses for select to authenticated
  using (user_id = (select auth.uid()));
-- post_survey_counts and post_stats: no grants at all (authors see insights through a function).

-- ---------------------------------------------------------------------------
-- Qualified views (the client batches posts on screen >= 60% for >= 1.5 s)
-- ---------------------------------------------------------------------------
create function private.record_views(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into public.post_views (post_id, user_id)
  select distinct x.id, (select auth.uid())
    from unnest(p_ids[1:100]) as x(id)
   where private.can_view_post(x.id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assignment: the question is fixed the first time a post is shown to a reader
-- ---------------------------------------------------------------------------
-- The dimension furthest below its target share on this post (by readers assigned so far),
-- ties to the safety signals (Credible, then Appropriate), then random; the wording is random.
create function private.assign_survey_question(p_post uuid)
returns smallint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_post public.posts;
  v_shares jsonb := coalesce(private.config('survey.shares'), '{"informative": 0.25, "interesting": 0.25, "rest": 0.5}');
  v_dimension text;
  v_question smallint;
  v_rest_count integer;
  v_total integer;
begin
  select question_id into v_question from public.micro_survey_assignments where post_id = p_post and user_id = v_me;
  if found then
    return v_question;
  end if;
  select * into v_post from public.posts where id = p_post;
  if not found or v_post.author_id = v_me or v_post.type not in ('general', 'invite', 'event', 'shipped') then
    return null;
  end if;

  select count(*) into v_rest_count from public.micro_survey_dimensions d
   where v_post.type = any (d.post_types) and d.dimension not in ('informative', 'interesting');
  select coalesce(sum(c.assigned), 0) into v_total from public.post_survey_counts c where c.post_id = p_post;

  select d.dimension into v_dimension
    from public.micro_survey_dimensions d
    left join public.post_survey_counts c on c.post_id = p_post and c.dimension = d.dimension
   where v_post.type = any (d.post_types)
     and exists (select 1 from public.micro_survey_questions q where q.dimension = d.dimension and q.active)
   order by
     (case d.dimension
        when 'informative' then (v_shares->>'informative')::numeric
        when 'interesting' then (v_shares->>'interesting')::numeric
        else (v_shares->>'rest')::numeric / greatest(v_rest_count, 1)
      end) * (v_total + 1) - coalesce(c.assigned, 0) desc,
     d.tie_priority desc,
     random()
   limit 1;
  if v_dimension is null then
    return null;
  end if;
  select q.id into v_question from public.micro_survey_questions q where q.dimension = v_dimension and q.active order by random() limit 1;

  insert into public.micro_survey_assignments (post_id, user_id, question_id, dimension)
  values (p_post, v_me, v_question, v_dimension)
  on conflict (post_id, user_id) do nothing;
  -- A parallel request may have won: read back whatever is stored.
  select question_id into v_question from public.micro_survey_assignments where post_id = p_post and user_id = v_me;
  return v_question;
end;
$$;
revoke all on function private.assign_survey_question(uuid) from public;

-- For a page of posts: assigns where needed and returns the strip for each post the caller
-- can see, plus the public line (raw people, only parts with >= 3 ticks).
create function private.survey_for_posts(p_ids uuid[])
returns table (post_id uuid, question_id smallint, question text, dimension text, my_answer boolean,
               answered_at timestamptz, can_change boolean, public_line jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_min integer := coalesce((private.config('survey.public_min'))::integer, 3);
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_ids[1:50], '{}') loop
    if private.can_view_post(v_id) then
      perform private.assign_survey_question(v_id);
    end if;
  end loop;
  return query
  select p.id, a.question_id, q.text, a.dimension, r.answer, r.created_at,
         r.post_id is not null and now() < r.locked_at,
         coalesce((select jsonb_object_agg(d.dimension, jsonb_build_object('count', c.ticks, 'phrase', d.public_phrase))
                     from public.post_survey_counts c join public.micro_survey_dimensions d on d.dimension = c.dimension
                    where c.post_id = p.id and d.public and c.ticks >= v_min), '{}'::jsonb)
    from unnest(p_ids[1:50]) as ids(id)
    join public.posts p on p.id = ids.id
    left join public.micro_survey_assignments a on a.post_id = p.id and a.user_id = (select auth.uid())
    left join public.micro_survey_questions q on q.id = a.question_id
    left join public.micro_survey_responses r on r.post_id = p.id and r.user_id = (select auth.uid())
   where private.can_view_post(p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Answering
-- ---------------------------------------------------------------------------
create function private.answer_survey(p_post uuid, p_answer boolean, p_latency_ms integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_a public.micro_survey_assignments;
  v_r public.micro_survey_responses;
  v_author uuid;
  v_weights jsonb := coalesce(private.config('survey.weights'), '{}'::jsonb);
  v_weight numeric := 1;
  v_prior integer;
  v_variation boolean;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_answer is null then
    raise exception 'answer yes or no' using errcode = '22023';
  end if;
  select * into v_a from public.micro_survey_assignments where post_id = p_post and user_id = v_me;
  if not found or not private.can_view_post(p_post) then
    raise exception 'there''s no question for you on this post' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.post_views v where v.post_id = p_post and v.user_id = v_me) then
    raise exception 'take a moment to read the post first' using errcode = '55000';
  end if;
  if coalesce(p_latency_ms, 0) < coalesce((private.config('survey.min_latency_ms'))::integer, 800) then
    raise exception 'take a moment to read the post first' using errcode = '55000';
  end if;

  select * into v_r from public.micro_survey_responses where post_id = p_post and user_id = v_me for update;
  if found then
    if now() >= v_r.locked_at then
      raise exception 'your answer is final' using errcode = '23505';
    end if;
    update public.micro_survey_responses set answer = p_answer, updated_at = now() where post_id = p_post and user_id = v_me;
    return;
  end if;

  -- Anti-gaming weights (PRD 5.28), multiplied together.
  select p.author_id into v_author from public.posts p where p.id = p_post;
  if private.are_friends(v_me, v_author) or exists (
       select 1 from public.venture_members m1 join public.venture_members m2 on m2.venture_id = m1.venture_id
        where m1.user_id = v_me and m2.user_id = v_author) then
    v_weight := v_weight * coalesce((v_weights->>'friend_or_teammate')::numeric, 0.5);
  end if;
  if exists (select 1 from auth.users u where u.id = v_me
              and u.created_at > now() - make_interval(days => coalesce((v_weights->>'new_account_days')::integer, 3))) then
    v_weight := v_weight * coalesce((v_weights->>'new_account')::numeric, 0.5);
  end if;
  select count(*), coalesce(bool_or(r.answer <> p_answer), false) into v_prior, v_variation
    from public.micro_survey_responses r where r.user_id = v_me;
  if v_prior >= coalesce((v_weights->>'straight_liner_min')::integer, 20) and not v_variation then
    v_weight := v_weight * coalesce((v_weights->>'straight_liner')::numeric, 0.3);
  end if;

  insert into public.micro_survey_responses (post_id, user_id, question_id, dimension, answer, latency_ms, weight, locked_at)
  values (p_post, v_me, v_a.question_id, v_a.dimension, p_answer, p_latency_ms, round(v_weight, 3),
          now() + make_interval(mins => coalesce((private.config('survey.change_minutes'))::integer, 10)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Insights (paid, PRD 5.28): the author's full breakdown. The entitlement registry
-- arrives with billing (phase 10); until then nobody holds insights.post_survey.
-- ---------------------------------------------------------------------------
create function private.has_entitlement(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Phase 10 replaces this body with the entitlement registry (PRD 4b).
  select false and p_user is not null and p_key is not null;
$$;
revoke all on function private.has_entitlement(uuid, text) from public;

create function private.post_insights(p_post uuid)
returns table (dimension text, label text, ticks integer, crosses integer, weighted_rate numeric, views integer, commenters integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.posts p where p.id = p_post and p.author_id = (select auth.uid())) then
    raise exception 'insights are for the post''s author' using errcode = '42501';
  end if;
  if not private.has_entitlement((select auth.uid()), 'insights.post_survey') then
    raise exception 'post insights come with Student Pro' using errcode = '42501';
  end if;
  return query
  select c.dimension, d.label, c.ticks, c.crosses,
         case when c.weighted_ticks + c.weighted_crosses > 0 then round(c.weighted_ticks / (c.weighted_ticks + c.weighted_crosses), 3) end,
         s.views, s.commenters
    from public.post_survey_counts c
    join public.micro_survey_dimensions d on d.dimension = c.dimension
    left join public.post_stats s on s.post_id = c.post_id
   where c.post_id = p_post
   order by d.public desc, d.dimension;
end;
$$;

revoke all on function private.record_views(uuid[]), private.survey_for_posts(uuid[]), private.answer_survey(uuid, boolean, integer),
  private.post_insights(uuid) from public;
grant execute on function private.record_views(uuid[]), private.survey_for_posts(uuid[]), private.answer_survey(uuid, boolean, integer),
  private.post_insights(uuid) to authenticated;

create function public.record_views(p_ids uuid[]) returns integer
  language sql volatile security invoker set search_path = '' as $$ select private.record_views(p_ids) $$;
create function public.survey_for_posts(p_ids uuid[])
returns table (post_id uuid, question_id smallint, question text, dimension text, my_answer boolean,
               answered_at timestamptz, can_change boolean, public_line jsonb)
  language sql volatile security invoker set search_path = '' as $$ select * from private.survey_for_posts(p_ids) $$;
create function public.answer_survey(p_post uuid, p_answer boolean, p_latency_ms integer) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.answer_survey(p_post, p_answer, p_latency_ms) $$;
create function public.post_insights(p_post uuid)
returns table (dimension text, label text, ticks integer, crosses integer, weighted_rate numeric, views integer, commenters integer)
  language sql stable security invoker set search_path = '' as $$ select * from private.post_insights(p_post) $$;

revoke all on function public.record_views(uuid[]), public.survey_for_posts(uuid[]), public.answer_survey(uuid, boolean, integer),
  public.post_insights(uuid) from public, anon;
grant execute on function public.record_views(uuid[]), public.survey_for_posts(uuid[]), public.answer_survey(uuid, boolean, integer),
  public.post_insights(uuid) to authenticated;
