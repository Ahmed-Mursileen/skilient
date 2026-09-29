-- Leaderboards, the score page and tier badges (PRD 5.17; decisions.md 2026-09-30 "Leaderboard").
-- Published scores are set directly here, as the nightly run leaves them. At NUTECH: V (the
-- viewer), A, B (tied with A), C, D (opted out), E (not ranked), F (blocked by V); at FAST: G.
begin;
select plan(34);

insert into auth.users (id, email)
select ('93500000-0000-0000-0000-0000000000' || x.k)::uuid, 'lb' || x.k || '@' || x.domain
  from (values ('0a', 'nutech.edu.pk'), ('0b', 'nutech.edu.pk'), ('0c', 'nutech.edu.pk'), ('0d', 'nutech.edu.pk'),
               ('0e', 'nutech.edu.pk'), ('0f', 'nutech.edu.pk'), ('10', 'nu.edu.pk'), ('11', 'nutech.edu.pk')) as x(k, domain);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('93500000-0000-0000-0000-0000000000' || case p when 'A' then '0a' when 'B' then '0b' when 'C' then '0c'
    when 'D' then '0d' when 'E' then '0e' when 'F' then '0f' when 'G' then '10' when 'V' then '11' end)::uuid
$$;
update public.profiles
   set onboarding_complete = true, username = 'lb_' || right(user_id::text, 2), visibility = 'university',
       full_name = 'Student ' || upper(right(user_id::text, 2)),
       department = case when right(user_id::text, 2) in ('0a', '0c', '11') then 'Computer Science' else 'Software Engineering' end,
       graduation_year = case when right(user_id::text, 2) in ('0a', '11') then 2027 else 2026 end,
       avatar_path = user_id::text || '/avatar.webp'
 where user_id::text like '93500000-%';
update public.profiles set leaderboard_opt_out = true where user_id = pg_temp.u('D');
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('V'), pg_temp.u('F'));

insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked, tier, tier_met,
                                   percentile, computed_at, published_at)
select pg_temp.u(x.p), 1, jsonb_build_object('facts', x.facts), x.total, 0, 0, x.total, x.ranked, x.tier::public.ranking_tier,
       x.tier::public.ranking_tier, case when x.ranked then 0.5 end, now(), now()
  from (values
    ('A', 600, true, 'shine', '{"peer_verified_entries": 3, "active_ventures": 2, "counting_endorsements": 4, "completed_ventures": 1, "max_level": 3}'::jsonb),
    ('B', 600, true, 'shine', '{}'::jsonb),
    ('C', 300, true, 'flare', '{}'::jsonb),
    ('D', 900, true, 'shine', '{}'::jsonb),
    ('E', 50, false, null, '{"peer_verified_entries": 0}'::jsonb),
    ('F', 700, true, 'shine', '{}'::jsonb),
    ('G', 800, true, 'shine', '{}'::jsonb),
    ('V', 120, true, 'spark', '{"peer_verified_entries": 1, "active_ventures": 1, "counting_endorsements": 1, "completed_ventures": 0, "max_level": 2}'::jsonb)
  ) as x(p, total, ranked, tier, facts);
-- Last week (a snapshot three days ago): C was ahead of A; B wasn't ranked yet.
insert into public.ranking_snapshots (user_id, week, formula_version, components, total, ranked, tier)
select pg_temp.u(x.p), (now() at time zone 'Asia/Karachi')::date - 3, 1, '{}'::jsonb, x.total, true, 'spark'
  from (values ('A', 200), ('C', 250), ('F', 100), ('G', 100), ('V', 100)) as x(p, total);

create function pg_temp.as_user(p text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;
select pg_temp.as_user('V');

-- ---------------------------------------------------------------------------
-- University board
-- ---------------------------------------------------------------------------
select is((select array_agg(rank order by place) from public.leaderboard()), array[2, 2, 4, 5]::bigint[],
  'ties share a rank (2, 2, 4); the blocked student''s row is hidden, its rank kept');
select is((select count(*)::integer from public.leaderboard() where username = 'lb_0d'), 0, 'opted-out students are on no board');
select is((select count(*)::integer from public.leaderboard() where username = 'lb_0e'), 0, 'unranked students aren''t on it');
select is((select count(*)::integer from public.leaderboard() where username = 'lb_10'), 0, 'the university board is your university only');
select is((select weekly_change from public.leaderboard() where username = 'lb_0c'), -3::bigint,
  'weekly change: C was 1st on last week''s board and is 4th now');
select is((select weekly_change from public.leaderboard() where username = 'lb_0a'), 0::bigint, 'A was 2nd and still is');
select is((select weekly_change from public.leaderboard() where username = 'lb_0b'), null::bigint, 'new this week: no change to show');
select is((select is_me from public.leaderboard() where username = 'lb_11'), true, 'your own row is marked');
select ok((select bool_and(avatar_path is not null) from public.leaderboard()), 'photos show where the profile is visible');
select ok(not exists (select 1 from information_schema.parameters
                       where specific_schema = 'public' and specific_name like 'leaderboard\_%' and parameter_name in ('total', 'points')),
  'the board never returns points');

-- Filters reach only your own university.
select is((select array_agg(username order by place) from public.leaderboard('university', 'Computer Science')),
  array['lb_0a', 'lb_0c', 'lb_11'], 'department filter');
select is((select array_agg(username order by place) from public.leaderboard('university', null, 2027::smallint)),
  array['lb_0a', 'lb_11'], 'batch filter');
select is((select array_agg(rank order by place) from public.leaderboard('university', 'Computer Science')), array[1, 2, 3]::bigint[],
  'ranks are within the filtered board');
select is((select count(*)::integer from public.leaderboard('university', null, null, 2)), 3, 'paging after a place');
select throws_ok($$ select * from public.leaderboard('everyone') $$, '22023', null, 'only university or global');

-- Global board.
select is((select array_agg(username order by place) from public.leaderboard('global')),
  array['lb_10', 'lb_0a', 'lb_0b', 'lb_0c', 'lb_11'], 'global: every university, blocked and opted-out left out');
select is((select avatar_path from public.leaderboard('global') where username = 'lb_10'), null,
  'a photo stays hidden where the profile isn''t visible to you');

-- Your own place.
select is(public.leaderboard_me()->'rank', '5'::jsonb, 'your rank on the university board');
select is(public.leaderboard_me()->'size', '5'::jsonb, 'out of everyone on it (blocked people count, hidden ones don''t show)');
select is(public.leaderboard_me('global')->'rank', '6'::jsonb, 'and on the global board');
select is(public.leaderboard_filters()->'departments', '["Computer Science", "Software Engineering"]'::jsonb, 'departments to filter by');

-- ---------------------------------------------------------------------------
-- Tier badges
-- ---------------------------------------------------------------------------
select is((select array_agg(tier::text order by user_id) from public.tiers_for(array[pg_temp.u('A'), pg_temp.u('D'), pg_temp.u('E'), pg_temp.u('F')])),
  array['shine', 'shine'], 'tiers show for ranked students, opted-out ones included; none for the unranked or the blocked');
select throws_ok($$ select * from public.tiers_for(array(select gen_random_uuid() from generate_series(1, 201))) $$, '22023', null,
  'at most 200 at a time');

-- ---------------------------------------------------------------------------
-- Opting out
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.set_leaderboard_opt_out(true) $$, 'V opts out');
select is((select count(*)::integer from public.leaderboard() where username = 'lb_11'), 0, 'and leaves the board');
select is(public.leaderboard_me()->'opted_out', 'true'::jsonb, 'the pinned place says so');
select is((select count(*)::integer from public.tiers_for(array[pg_temp.u('V')])), 1, 'the tier still shows');
select public.set_leaderboard_opt_out(false);
reset role;
select is((select leaderboard_opt_out from public.profiles where user_id = pg_temp.u('A')), false, 'it only ever changes your own profile');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- The score page and the next tier
-- ---------------------------------------------------------------------------
select is(public.my_score()->'total', '120.00'::jsonb, 'the owner sees their points');
select is(public.my_score()->'next'->>'next', 'flare', 'next tier after Spark');
select is((select array_agg(x->>'key' order by x->>'key') from jsonb_array_elements(public.my_score()->'next'->'needs') x),
  array['active_ventures', 'counting_endorsements', 'points'], 'Flare needs 130 more points, a second venture and 2 more endorsements');
select pg_temp.as_user('E');
select is(public.my_score()->'next'->'needs'->0->>'key', 'peer_verified_entries', 'an unranked student needs a confirmed contribution');
select is((select count(*)::integer from public.ranking_scores), 1, 'and reads only their own score row');

set local role anon;
select throws_ok($$ select * from public.leaderboard() $$, '42501', null, 'signed-out visitors see no board');
reset role;

select * from finish();
rollback;
