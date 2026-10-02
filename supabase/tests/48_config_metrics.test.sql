-- Phase 11, slice 4 (PRD 5.26): versioned platform config with schemas, plan prices, the skill
-- dictionary and metrics. A super admin, R trust reviewer, C accounts staff, S a student.
begin;
select plan(45);

insert into auth.users (id, email)
select ('94800000-0000-0000-0000-0000000000' || x.k)::uuid, 'cm' || x.k || '@nutech.edu.pk'
  from (values ('01'), ('02'), ('03'), ('04')) as x(k);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('94800000-0000-0000-0000-0000000000' || case p when 'A' then '01' when 'R' then '02' when 'C' then '03' when 'S' then '04' end)::uuid
$$;
update public.profiles set onboarding_complete = true, username = 'cm_' || right(user_id::text, 2), full_name = 'Config ' || right(user_id::text, 2)
 where user_id::text like '94800000-%';
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  (pg_temp.u('A'), 'super_admin', pg_temp.u('A')), (pg_temp.u('R'), 'trust_reviewer', pg_temp.u('A')), (pg_temp.u('C'), 'accounts', pg_temp.u('A'));

create function pg_temp.as_user(p text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.audit(p_action text, p_target text) returns public.ops_audit_log language sql security definer as $$
  select * from public.ops_audit_log where action = p_action and target_id = p_target order by created_at desc limit 1
$$;
create function pg_temp.ver(p_key text) returns integer language sql security definer as $$
  select max(version) from public.platform_config where key = p_key
$$;
create function pg_temp.cfg(p_key text) returns jsonb language sql security definer as $$ select private.config(p_key) $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Every setting is registered and its current value matches its schema.
select is((select count(distinct key)::integer from public.platform_config c where not exists (select 1 from public.config_keys k where k.key = c.key)), 0,
  'every platform_config key has a config_keys row (add one with any new key)');
select is((select count(*)::integer from public.config_keys k where not extensions.jsonb_matches_schema(k.schema::json, pg_temp.cfg(k.key))), 0,
  'and every current value matches its schema');
select is((select applies from public.config_keys where key = 'ranking.formula'), 'next_nightly', 'ranking changes apply at the next nightly run');

-- ---------------------------------------------------------------------------
-- Reading and saving versions
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.ops_config_keys()$$, '42501', null, 'a student can''t read settings');
select throws_ok($$insert into public.config_keys (key, area, description, applies, schema) values ('x.y', 'x', 'nope', 'now', '{}')$$,
  '42501', null, 'config_keys has no client writes');
select is((select count(*)::integer from public.config_keys), 0, 'and no client reads');
select pg_temp.as_user('C');
select ok(jsonb_array_length(public.ops_config_keys()) >= 29, 'any staff role reads the settings');
select ok((public.ops_config_history('feed.score') -> 'versions' -> 0 ->> 'version')::integer >= 1, 'and a setting''s history');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"base": 0.2}', 'tune', pg_temp.ver('feed.score'))$$,
  '42501', null, 'only a super admin saves settings');
select pg_temp.as_user('A', 'aal1');
select throws_ok($$select public.ops_set_config('feed.score', '{}', 'tune', 1)$$, '42501', null, 'and only with two-factor on');

select pg_temp.as_user('A');
select throws_ok($$select public.ops_set_config('nope.key', '{}', 'tune', 1)$$, 'P0002', null, 'unknown keys are refused');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"base": 0.2}', '', pg_temp.ver('feed.score'))$$,
  '22023', null, 'a reason is required');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"base": 0.2}', 'tune', pg_temp.ver('feed.score') - 1)$$,
  '40001', null, 'saving over a newer version is refused');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"base": "high"}', 'tune', pg_temp.ver('feed.score'))$$,
  '22023', null, 'a value of the wrong type is refused');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"basse": 0.2}', 'tune', pg_temp.ver('feed.score'))$$,
  '22023', null, 'an unknown field is refused');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') - 'base', 'tune', pg_temp.ver('feed.score'))$$,
  '22023', null, 'a missing field is refused');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"base": -1}', 'tune', pg_temp.ver('feed.score'))$$,
  '22023', null, 'a negative number is refused');
select throws_ok($$select public.ops_set_config('feed.score', pg_temp.cfg('feed.score'), 'tune', pg_temp.ver('feed.score'))$$,
  '22023', 'nothing changed', 'an unchanged value is refused');
select is(public.ops_set_config('feed.score', pg_temp.cfg('feed.score') || '{"base": 0.2}', 'Newer posts were buried', pg_temp.ver('feed.score')),
  2, 'a valid change saves version 2');
reset role;
select is((pg_temp.cfg('feed.score') ->> 'base')::numeric, 0.2, 'config() reads the new version');
select is((select value ->> 'base' from public.platform_config where key = 'feed.score' and version = 1), '0.15', 'the old version stays');
select is((pg_temp.audit('config.set', 'feed.score')).before ->> 'version', '1', 'the change is audited with the version before');
select is((pg_temp.audit('config.set', 'feed.score')).after -> 'value' ->> 'base', '0.2', 'and the value after');
select throws_ok($$update public.platform_config set value = '{}' where key = 'feed.score'$$, null, null, 'versions can''t be edited');

-- A ranking weight change shows up only after the next recompute.
select is(private.ranking_run_all(), 'done', 'a nightly run with formula v1');
select is((select count(*)::integer from public.ranking_scores where formula_version <> 1), 0, 'every published score uses formula v1');
set local role authenticated;
select pg_temp.as_user('A');
select is(public.ops_set_config('ranking.formula', jsonb_set(pg_temp.cfg('ranking.formula'), '{caps,skills}', '450'), 'Skills cap too generous', 1),
  2, 'a super admin lowers the skills cap (formula v2)');
reset role;
select is((select count(*)::integer from public.ranking_scores where formula_version = 2), 0, 'published scores don''t change when it is saved');
select is(private.ranking_run_all(now() + interval '1 day'), 'done', 'the next nightly run');
select ok((select count(*) from public.ranking_scores) > 0 and (select count(*)::integer from public.ranking_scores where formula_version <> 2) = 0,
  'publishes every score with formula v2');

-- ---------------------------------------------------------------------------
-- Plan prices
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('C');
select throws_ok($$select public.ops_set_plan_price('student_pro_month', 999, null, 'promo')$$, '42501', null, 'accounts staff don''t change prices');
select pg_temp.as_user('A');
select throws_ok($$select public.ops_set_plan_price((select id from public.plans where price_pkr is not null limit 1), 0, null, 'free')$$, '22023', null,
  'prices stay above zero');
select lives_ok($$select public.ops_set_plan_price(p.id, p.price_pkr + 100, p.price_usd, 'Yearly price review') from public.plans p where p.price_pkr is not null order by p.id limit 1$$,
  'a super admin changes a price');
select is((select jsonb_array_length(public.ops_plan_history(p.id)) from public.plans p where p.price_pkr is not null order by p.id limit 1), 1,
  'the plan''s price history shows it');

-- ---------------------------------------------------------------------------
-- Skill dictionary
-- ---------------------------------------------------------------------------
select pg_temp.as_user('C');
select throws_ok($$select public.ops_edit_skill('add', 'qwik', 'Qwik', 'framework', null, 'New framework')$$, '42501', null, 'only trust reviewers edit skills');
select pg_temp.as_user('R');
select throws_ok($$select public.ops_edit_skill('add', 'Bad Id', 'Bad', 'framework', null, 'New framework')$$, '22023', null, 'ids are lowercase');
select lives_ok($$select public.ops_edit_skill('add', 'qwik', 'Qwik', 'framework', null, 'Requested in feedback')$$, 'a trust reviewer adds a skill');
select throws_ok($$select public.ops_edit_skill('add', 'qwik', 'Qwik', 'framework', null, 'again')$$, '23505', null, 'ids are unique');
select lives_ok($$select public.ops_edit_skill('rename', 'qwik', 'Qwik City', null, null, 'Official name')$$, 'renames it');
select lives_ok($$select public.ops_edit_skill('retire', 'qwik', null, null, null, 'Nobody uses it')$$, 'retires it');
select is((pg_temp.audit('skill.retire', 'qwik')).before ->> 'retired_at', null, 'retiring is audited before and after');
select throws_ok($$select public.ops_edit_skill('retire', 'qwik', null, null, null, 'again')$$, '55000', null, 'once');

-- ---------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.ops_metrics()$$, '42501', null, 'a student can''t read metrics');
select pg_temp.as_user('C');
select ok(public.ops_metrics() ?& array['signups', 'evidence', 'contacts', 'hires', 'mrr', 'weekly_actives', 'backlog', 'refreshed'],
  'staff read every series');
reset role;
select ok(private.refresh_ops_metrics() > 0, 'the hourly refresh writes snapshots');

select * from finish();
rollback;
