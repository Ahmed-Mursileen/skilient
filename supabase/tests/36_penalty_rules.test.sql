-- Clear bio and photo and Unlist cost no points by themselves; a severity adds a Warn alongside;
-- Remove and Warn still need one (decisions.md 2026-09-30).
begin;
select plan(6);
insert into auth.users (id, email) values
  ('93600000-0000-0000-0000-00000000000a', 'own@nutech.edu.pk'),
  ('93600000-0000-0000-0000-00000000000b', 'rep@nutech.edu.pk'),
  ('93600000-0000-0000-0000-00000000000c', 'mod@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'pr_' || right(user_id::text, 2), bio = 'A bio'
 where user_id::text like '93600000-%';
insert into public.staff_roles (user_id, role, granted_by) values ('93600000-0000-0000-0000-00000000000c', 'moderator', '93600000-0000-0000-0000-00000000000c');
create function pg_temp.as_user(p text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true); end; $$;
create function pg_temp.pen(p text) returns integer language sql security definer as $$ select count(*)::integer from public.ranking_adjustments where user_id = p::uuid $$;
create function pg_temp.warns(p text) returns integer language sql security definer as $$ select count(*)::integer from public.sanctions where user_id = p::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;
select pg_temp.as_user('93600000-0000-0000-0000-00000000000b');
select public.submit_report('profile', '93600000-0000-0000-0000-00000000000a', 'impersonation');
select pg_temp.as_user('93600000-0000-0000-0000-00000000000c');
create temp table c as select id from public.ops_queue() limit 1;
grant select on c to authenticated;
select public.claim_case((select id from c), true);
select throws_ok($$ select public.resolve_case((select id from c), 'warn', 'Impersonating', null) $$, '22023', null, 'Warn needs a severity');
select lives_ok($$ select public.resolve_case((select id from c), 'clear_profile', 'Fake photo') $$, 'Clear needs none');
select is(pg_temp.pen('93600000-0000-0000-0000-00000000000a'), 0, 'and costs no points');
select is(pg_temp.warns('93600000-0000-0000-0000-00000000000a'), 0, 'or a warning');
select is((select resolved_by from public.report_cases where owner_id = '93600000-0000-0000-0000-00000000000a'), '93600000-0000-0000-0000-00000000000c'::uuid, 'the deciding moderator is recorded');
select is((select count(*)::integer from public.ops_audit_log where staff_id = '93600000-0000-0000-0000-00000000000c' and action = 'report.clear_profile'), 1, 'and audited');
select * from finish();
rollback;
