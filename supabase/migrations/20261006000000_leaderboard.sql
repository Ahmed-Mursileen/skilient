-- Phase 4 slice 6: leaderboards, the score page and tier badges (PRD 5.17; decisions.md
-- 2026-09-30 "Leaderboard").
--
-- Everything reads the published scores from the nightly run (ranking_scores), so ranks and
-- tiers don't move between runs. Others see rank, tier and weekly change, never points; the
-- owner sees every component with its evidence on /me/score. Students may opt out of the
-- boards; their tier still shows on their profile and cards.

alter table public.profiles add column leaderboard_opt_out boolean not null default false;
comment on column public.profiles.leaderboard_opt_out is
  'Hidden from every leaderboard (PRD 5.17). The tier still shows on the profile, cards and to recruiters.';

create function private.set_leaderboard_opt_out(p_out boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  update public.profiles set leaderboard_opt_out = coalesce(p_out, false) where user_id = v_me;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return coalesce(p_out, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tier badges: the tier of each person on a page of cards
-- ---------------------------------------------------------------------------
create function private.tiers_for(p_users uuid[])
returns table (user_id uuid, tier public.ranking_tier)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if cardinality(p_users) > 200 then
    raise exception 'at most 200 people at a time' using errcode = '22023';
  end if;
  return query
  select s.user_id, s.tier
    from public.ranking_scores s
   where s.user_id = any (p_users) and s.ranked and s.tier is not null
     and not private.is_blocked_with(s.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
-- The PKT date of the last Sunday snapshot before today: weekly change is measured from it.
create function private.last_snapshot_week()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(week) from public.ranking_snapshots where week < (now() at time zone 'Asia/Karachi')::date;
$$;

-- Everyone on a board, ranked (ties share a rank: 1, 2, 2, 4), with their rank in the same
-- population at the last snapshot. University scope is the caller's university, optionally one
-- department and one batch; global has no filters. Opted-out and unranked students are left out.
create function private.board(p_scope text, p_department text, p_batch smallint)
returns table (user_id uuid, total numeric, tier public.ranking_tier, rank bigint, previous_rank bigint, place bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_university uuid := private.current_university_id();
  v_week date := private.last_snapshot_week();
begin
  if p_scope not in ('university', 'global') then
    raise exception 'choose university or global' using errcode = '22023';
  end if;
  return query
  with pop as (
    select s.user_id, s.total, s.tier, p.full_name
      from public.ranking_scores s
      join public.profiles p on p.user_id = s.user_id
     where s.ranked and not p.leaderboard_opt_out and p.role = 'student' and p.onboarding_complete
       and (p_scope = 'global'
            or (p.university_id = v_university
                and (p_department is null or p.department = p_department)
                and (p_batch is null or p.graduation_year = p_batch)))
  ), now_ranked as (
    select pop.*, rank() over (order by pop.total desc) as r,
           row_number() over (order by pop.total desc, pop.full_name, pop.user_id) as pos
      from pop
  ), prior as (
    select n.user_id, rank() over (order by n.total desc) as r
      from public.ranking_snapshots n
      join pop on pop.user_id = n.user_id
     where n.week = v_week and n.ranked
  )
  select nr.user_id, nr.total, nr.tier, nr.r, b.r, nr.pos
    from now_ranked nr
    left join prior b on b.user_id = nr.user_id;
end;
$$;
revoke all on function private.board(text, text, smallint) from public;

-- One page of a board (50 rows after a position). Blocked people are left out (their rows
-- are skipped, so ranks keep their gaps). Points are never returned.
create function private.leaderboard(p_scope text default 'university', p_department text default null, p_batch smallint default null,
                                    p_after integer default 0)
returns table (place bigint, rank bigint, weekly_change bigint, username text, full_name text, university_name text,
               avatar_path text, tier public.ranking_tier, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  return query
  select b.place, b.rank, b.previous_rank - b.rank, p.username, p.full_name, u.name,
         case when private.can_view_profile(b.user_id) then p.avatar_path end,
         b.tier, b.user_id = v_me
    from private.board(p_scope, nullif(btrim(coalesce(p_department, '')), ''), p_batch) b
    join public.profiles p on p.user_id = b.user_id
    left join public.universities u on u.id = p.university_id
   where b.place > greatest(coalesce(p_after, 0), 0)
     and (b.user_id = v_me or not private.is_blocked_with(b.user_id))
   order by b.place
   limit 50;
end;
$$;

-- The caller's own place on a board, pinned above it.
create function private.leaderboard_me(p_scope text default 'university', p_department text default null, p_batch smallint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  s public.ranking_scores;
  p public.profiles;
  v_size bigint;
  v_rank bigint;
  v_place bigint;
  v_previous bigint;
begin
  select * into p from public.profiles where user_id = v_me;
  select * into s from public.ranking_scores where user_id = v_me;
  -- One pass over the board: its size and the caller's row.
  select count(*), max(x.rank) filter (where x.user_id = v_me), max(x.place) filter (where x.user_id = v_me),
         max(x.previous_rank) filter (where x.user_id = v_me)
    into v_size, v_rank, v_place, v_previous
    from private.board(p_scope, nullif(btrim(coalesce(p_department, '')), ''), p_batch) x;
  return jsonb_build_object(
    'opted_out', p.leaderboard_opt_out,
    'ranked', coalesce(s.ranked, false),
    'scored', s.user_id is not null,
    'total', s.total,
    'tier', s.tier,
    'held', coalesce(s.held, false),
    'rank', v_rank,
    'place', v_place,
    'weekly_change', v_previous - v_rank,
    'size', v_size);
end;
$$;

-- Departments and batches in the caller's university, for the board's filters.
create function private.leaderboard_filters()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'departments', coalesce((select jsonb_agg(d order by d) from (
        select distinct p.department as d from public.profiles p
         where p.university_id = private.current_university_id() and p.department is not null and p.role = 'student') x), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(y order by y desc) from (
        select distinct p.graduation_year as y from public.profiles p
         where p.university_id = private.current_university_id() and p.graduation_year is not null and p.role = 'student') x), '[]'::jsonb))
  where (select auth.uid()) is not null;
$$;

-- ---------------------------------------------------------------------------
-- The score page
-- ---------------------------------------------------------------------------
-- What the next tier needs that the student doesn't have yet (PRD 5.17), from the published
-- score: points and each milestone of that tier and the ones below it.
create function private.next_tier_requirements(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := (select value from private.ranking_formula());
  t jsonb := f->'tiers';
  s public.ranking_scores;
  x jsonb;
  v_pct numeric;
  v_next text;
  v_needs jsonb := '[]'::jsonb;
  v_order text[] := array['raw', 'spark', 'flare', 'shine', 'radiant', 'luminary'];
  v_i integer;
begin
  select * into s from public.ranking_scores where user_id = p_user;
  x := coalesce(s.components->'facts', '{}'::jsonb);
  v_pct := coalesce(s.percentile, 0)::numeric;
  if s.user_id is null or not s.ranked then
    return jsonb_build_object('current', null, 'next', 'raw', 'needs', jsonb_build_array(
      jsonb_build_object('key', 'peer_verified_entries', 'have', coalesce((x->>'peer_verified_entries')::integer, 0), 'need', 1)));
  end if;
  v_i := array_position(v_order, coalesce(s.tier::text, 'raw'));
  if v_i = cardinality(v_order) then
    return jsonb_build_object('current', s.tier, 'next', null, 'needs', '[]'::jsonb);
  end if;
  v_next := v_order[v_i + 1];
  -- Points, then every milestone up to the next tier that isn't met yet.
  if s.total < (t->>v_next)::numeric then
    v_needs := v_needs || jsonb_build_object('key', 'points', 'have', s.total, 'need', (t->>v_next)::numeric);
  end if;
  if coalesce((x->>'peer_verified_entries')::integer, 0) < 1 then
    v_needs := v_needs || jsonb_build_object('key', 'peer_verified_entries', 'have', coalesce((x->>'peer_verified_entries')::integer, 0), 'need', 1);
  end if;
  if array_position(v_order, v_next) >= 3 then
    if coalesce((x->>'active_ventures')::integer, 0) < (t->>'flare_ventures')::integer then
      v_needs := v_needs || jsonb_build_object('key', 'active_ventures', 'have', coalesce((x->>'active_ventures')::integer, 0), 'need', (t->>'flare_ventures')::integer);
    end if;
    if coalesce((x->>'counting_endorsements')::integer, 0) < (t->>'flare_endorsements')::integer then
      v_needs := v_needs || jsonb_build_object('key', 'counting_endorsements', 'have', coalesce((x->>'counting_endorsements')::integer, 0), 'need', (t->>'flare_endorsements')::integer);
    end if;
  end if;
  if array_position(v_order, v_next) >= 4 then
    if coalesce((x->>'completed_ventures')::integer, 0) < (t->>'shine_completed')::integer then
      v_needs := v_needs || jsonb_build_object('key', 'completed_ventures', 'have', coalesce((x->>'completed_ventures')::integer, 0), 'need', (t->>'shine_completed')::integer);
    end if;
    if coalesce((x->>'max_level')::integer, 0) < (t->>'shine_level')::integer then
      v_needs := v_needs || jsonb_build_object('key', 'max_level', 'have', coalesce((x->>'max_level')::integer, 0), 'need', (t->>'shine_level')::integer);
    end if;
  end if;
  if v_next = 'radiant' and v_pct < 1 - (t->>'radiant_top')::numeric then
    v_needs := v_needs || jsonb_build_object('key', 'top_share', 'have', round((1 - v_pct) * 100, 1), 'need', (t->>'radiant_top')::numeric * 100);
  end if;
  if v_next = 'luminary' then
    if v_pct < 1 - (t->>'luminary_top')::numeric then
      v_needs := v_needs || jsonb_build_object('key', 'top_share', 'have', round((1 - v_pct) * 100, 1), 'need', (t->>'luminary_top')::numeric * 100);
    end if;
    if not (coalesce((x->>'teacher_endorsement')::boolean, false) or coalesce((x->>'hire')::boolean, false)) then
      v_needs := v_needs || jsonb_build_object('key', 'teacher_or_hire', 'have', 0, 'need', 1);
    end if;
  end if;
  return jsonb_build_object('current', s.tier, 'next', v_next, 'needs', v_needs);
end;
$$;
revoke all on function private.next_tier_requirements(uuid) from public;

-- Everything /me/score shows the owner: the published components with the names behind their
-- evidence ids, the change since the last snapshot, decay, exam pause, a held gain and what
-- the next tier needs.
create function private.my_score()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  s public.ranking_scores;
  c jsonb;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
begin
  select * into s from public.ranking_scores where user_id = v_me;
  if not found then
    return jsonb_build_object('scored', false, 'next', private.next_tier_requirements(v_me));
  end if;
  c := s.components;
  return jsonb_build_object(
    'scored', true,
    'formula_version', s.formula_version,
    'components', c,
    'total', s.total, 'proof', s.proof, 'momentum', s.momentum, 'adjustments', s.adjustments,
    'ranked', s.ranked, 'tier', s.tier, 'tier_met', s.tier_met, 'percentile', s.percentile, 'below_since', s.below_since,
    'held', s.held, 'held_total', s.held_total, 'published_at', s.published_at,
    'last_week', (select jsonb_build_object('week', n.week, 'total', n.total, 'components', n.components, 'tier', n.tier)
                    from public.ranking_snapshots n where n.user_id = v_me and n.week < v_today order by n.week desc limit 1),
    'exam', (select jsonb_build_object('starts_on', e.starts_on, 'ends_on', e.ends_on)
               from public.exam_periods e join public.profiles p on p.university_id = e.university_id
              where p.user_id = v_me and v_today between e.starts_on and e.ends_on limit 1),
    'next', private.next_tier_requirements(v_me),
    'names', jsonb_build_object(
      'ventures', coalesce((select jsonb_object_agg(v.id, v.title) from public.ventures v
                             where v.id in (select (x->>'venture_id')::uuid from jsonb_array_elements(c->'work'->'ventures') x)), '{}'::jsonb),
      'skills', coalesce((select jsonb_object_agg(k.id, k.name) from public.skills k
                           where k.id in (select x->>'skill_id' from jsonb_array_elements(c->'skills'->'items') x
                                          union select x->>'skill_id' from jsonb_array_elements(c->'endorsements'->'items') x)), '{}'::jsonb),
      'people', coalesce((select jsonb_object_agg(p.user_id, jsonb_build_object('name', p.full_name, 'username', p.username))
                           from public.profiles p
                          where p.user_id in (select (x->>'endorser_id')::uuid from jsonb_array_elements(c->'endorsements'->'items') x)), '{}'::jsonb),
      'credentials', coalesce((select jsonb_object_agg(k.id, k.title) from public.credentials k
                                where k.user_id = v_me and k.id in (select (x->>'id')::uuid from jsonb_array_elements(c->'credentials'->'items') x)), '{}'::jsonb),
      'posts', coalesce((select jsonb_object_agg(p.id, left(p.body, 80)) from public.posts p
                          where p.author_id = v_me and p.id in (select (x->>'post_id')::uuid from jsonb_array_elements(c->'momentum'->'content'->'posts') x)), '{}'::jsonb)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Wrappers
-- ---------------------------------------------------------------------------
revoke all on function private.set_leaderboard_opt_out(boolean), private.tiers_for(uuid[]), private.last_snapshot_week(),
  private.leaderboard(text, text, smallint, integer), private.leaderboard_me(text, text, smallint), private.leaderboard_filters(),
  private.my_score() from public;
grant execute on function private.set_leaderboard_opt_out(boolean), private.tiers_for(uuid[]), private.last_snapshot_week(),
  private.leaderboard(text, text, smallint, integer), private.leaderboard_me(text, text, smallint), private.leaderboard_filters(),
  private.my_score() to authenticated;

create function public.set_leaderboard_opt_out(p_out boolean) returns boolean
  language sql security invoker set search_path = '' as $$ select private.set_leaderboard_opt_out(p_out) $$;
create function public.tiers_for(p_users uuid[]) returns table (user_id uuid, tier public.ranking_tier)
  language sql stable security invoker set search_path = '' as $$ select * from private.tiers_for(p_users) $$;
create function public.leaderboard(p_scope text default 'university', p_department text default null, p_batch smallint default null,
                                   p_after integer default 0)
returns table (place bigint, rank bigint, weekly_change bigint, username text, full_name text, university_name text,
               avatar_path text, tier public.ranking_tier, is_me boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.leaderboard(p_scope, p_department, p_batch, p_after) $$;
create function public.leaderboard_me(p_scope text default 'university', p_department text default null, p_batch smallint default null)
returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.leaderboard_me(p_scope, p_department, p_batch) $$;
create function public.leaderboard_filters() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.leaderboard_filters() $$;
create function public.my_score() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.my_score() $$;

revoke all on function public.set_leaderboard_opt_out(boolean), public.tiers_for(uuid[]),
  public.leaderboard(text, text, smallint, integer), public.leaderboard_me(text, text, smallint), public.leaderboard_filters(),
  public.my_score() from public, anon;
grant execute on function public.set_leaderboard_opt_out(boolean), public.tiers_for(uuid[]),
  public.leaderboard(text, text, smallint, integer), public.leaderboard_me(text, text, smallint), public.leaderboard_filters(),
  public.my_score() to authenticated;
