begin;
select plan(12);

select has_table('public', 'job_runs', 'job_runs exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.job_runs'::regclass),
  'job_runs has RLS enabled'
);

-- A job (service_role) can log a run.
set local role service_role;
select lives_ok(
  $$ select public.job_run_start('feed-stage', '{"batch": 1}') $$,
  'service_role can start a job run'
);
select is(
  (select status::text from public.job_runs where job = 'feed-stage'),
  'running',
  'a started run is running'
);
select lives_ok(
  $$ select public.job_run_finish((select id from public.job_runs where job = 'feed-stage'), 'succeeded', 42) $$,
  'service_role can finish a job run'
);
select results_eq(
  $$ select status::text, rows, finished_at is not null from public.job_runs where job = 'feed-stage' $$,
  $$ values ('succeeded', 42, true) $$,
  'finished run records status, rows and finish time'
);
select throws_ok(
  $$ select public.job_run_finish((select id from public.job_runs where job = 'feed-stage'), 'failed') $$,
  'P0002',
  null,
  'a finished run cannot be finished again'
);
reset role;

-- Signed-in users are refused: no reads, no writes, no function calls.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok($$ select * from public.job_runs $$, '42501', null, 'authenticated cannot read job_runs');
select throws_ok(
  $$ insert into public.job_runs (job) values ('x') $$,
  '42501', null, 'authenticated cannot insert job_runs'
);
select throws_ok($$ select public.job_run_start('x') $$, '42501', null, 'authenticated cannot call job_run_start');
reset role;

-- Signed-out visitors are refused.
set local role anon;
select throws_ok($$ select * from public.job_runs $$, '42501', null, 'anon cannot read job_runs');
select throws_ok($$ select public.job_run_start('x') $$, '42501', null, 'anon cannot call job_run_start');
reset role;

select * from finish();
rollback;
