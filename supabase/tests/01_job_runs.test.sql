begin;
select plan(14);

select has_table('public', 'job_runs', 'job_runs exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.job_runs'::regclass),
  'job_runs has RLS enabled'
);

-- A job (service_role) can log a run.
set local role service_role;
select lives_ok(
  $$ select public.job_run_start('pgtap-probe', '{"batch": 1}') $$,
  'service_role can start a job run'
);
select is(
  (select status::text from public.job_runs where job = 'pgtap-probe'),
  'running',
  'a started run is running'
);
select lives_ok(
  $$ select public.job_run_finish((select id from public.job_runs where job = 'pgtap-probe'), 'succeeded', 42) $$,
  'service_role can finish a job run'
);
select results_eq(
  $$ select status::text, rows, finished_at is not null from public.job_runs where job = 'pgtap-probe' $$,
  $$ values ('succeeded', 42, true) $$,
  'finished run records status, rows and finish time'
);
select throws_ok(
  $$ select public.job_run_finish((select id from public.job_runs where job = 'pgtap-probe'), 'failed') $$,
  'P0002',
  null,
  'a finished run cannot be finished again'
);
reset role;

-- Signed-in users who aren't staff see nothing and can't write or call the functions.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated", "aal": "aal2"}';
select is_empty($$ select * from public.job_runs $$, 'a non-staff user reads no job_runs');
select throws_ok(
  $$ insert into public.job_runs (job) values ('x') $$,
  '42501', null, 'authenticated cannot insert job_runs'
);
select throws_ok($$ select public.job_run_start('x') $$, '42501', null, 'authenticated cannot call job_run_start');
reset role;

-- Staff read job_runs, but only on a two-factor (aal2) session.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'staff-e2e@nutech.edu.pk');
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'moderator');
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "aal": "aal1"}';
select is_empty($$ select * from public.job_runs $$, 'staff without two-factor read no job_runs');
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "aal": "aal2"}';
select isnt_empty($$ select * from public.job_runs $$, 'staff with two-factor read job_runs');
reset role;

-- Signed-out visitors are refused.
set local role anon;
select throws_ok($$ select * from public.job_runs $$, '42501', null, 'anon cannot read job_runs');
select throws_ok($$ select public.job_run_start('x') $$, '42501', null, 'anon cannot call job_run_start');
reset role;

select * from finish();
rollback;
