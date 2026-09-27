-- Signup gate (PRD 5.2, 5.27): the before-user-created hook and handle_new_user().
-- Personal and non-university emails (including Google accounts) are refused; a new
-- account gets its profile, onboarding state, agreement acceptance and signup event.
begin;
select plan(26);

create function pg_temp.hook(p_email text, p_provider text default 'email', p_meta jsonb default '{}')
returns jsonb language sql as $$
  select public.hook_before_user_created(jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created'),
    'user', jsonb_build_object(
      'email', p_email,
      'app_metadata', jsonb_build_object('provider', p_provider),
      'user_metadata', p_meta
    )
  ));
$$;

create function pg_temp.uni(p_name text) returns uuid language sql as $$
  select id from public.universities where name = p_name;
$$;

-- Hook: who may sign up.
select is(pg_temp.hook('ali@nutech.edu.pk'), '{}'::jsonb, 'a NUTECH student email is allowed');
select is(pg_temp.hook('Ali@NUTECH.edu.pk'), '{}'::jsonb, 'domain matching ignores case');
select is(
  pg_temp.hook('ali@gmail.com') -> 'error' ->> 'message', 'Use your university email.',
  'a personal email is refused'
);
select is(
  pg_temp.hook('ali@example.org') -> 'error' ->> 'message', 'Your university isn''t on Skilient yet.',
  'an unknown domain is refused'
);
select is(
  pg_temp.hook('ali@sub.nutech.edu.pk') -> 'error' ->> 'message', 'Your university isn''t on Skilient yet.',
  'only listed domains match (no subdomain wildcard)'
);
select is(
  (pg_temp.hook('ali@gmail.com', 'google') -> 'error' ->> 'http_code')::int, 403,
  'a personal Google account is refused with 403'
);
select is(
  pg_temp.hook('ali@gmail.com', 'google') -> 'error' ->> 'message', 'Use your university Google account.',
  'a personal Google account gets the Google message'
);
select is(
  pg_temp.hook('ceo@acme-corp.com', 'google') -> 'error' ->> 'message', 'Use your university Google account.',
  'a non-university Google Workspace account is refused'
);
select is(pg_temp.hook('ali@nutech.edu.pk', 'google'), '{}'::jsonb, 'a university Google account is allowed');
select is(
  pg_temp.hook('ali@nutech.edu.pk', 'email', jsonb_build_object('role', 'recruiter')) -> 'error' ->> 'message',
  'This kind of account can''t sign up here yet.',
  'roles other than student are refused in phase 1'
);
select is(
  pg_temp.hook('ali@nutech.edu.pk', 'email',
    jsonb_build_object('university_id', pg_temp.uni('Preston University Kohat'))) -> 'error' ->> 'message',
  'That university doesn''t use this email domain.',
  'a university that does not own the domain is refused'
);
select is(
  pg_temp.hook('ali@nutech.edu.pk', 'email', '{"university_id": "not-a-uuid"}'::jsonb) -> 'error' ->> 'http_code',
  '400',
  'malformed metadata is refused'
);
select is(
  pg_temp.hook('ali@preston.edu.pk', 'email',
    jsonb_build_object('university_id', pg_temp.uni('Preston University Kohat'))),
  '{}'::jsonb,
  'a shared domain accepts either owning university'
);

-- Only the Auth server may call the hook.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok($$ select pg_temp.hook('a@nutech.edu.pk') $$, '42501', null, 'users cannot call the hook');
reset role;

-- handle_new_user(): what a new account gets.
insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000001', 'sara@nutech.edu.pk',
        '{"full_name": "Sara Khan", "agreement_version": "1", "role": "student"}');

select results_eq(
  $$ select role::text, university_id, full_name, onboarding_complete, visibility::text
       from public.profiles where user_id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('student', pg_temp.uni('National University of Technology (NUTECH)'), 'Sara Khan', false, 'university') $$,
  'the profile gets the university from the email domain, private defaults and onboarding pending'
);
select is(
  (select step from public.onboarding_state where user_id = '10000000-0000-0000-0000-000000000001'),
  1::smallint, 'onboarding starts at step 1'
);
select is(
  (select version from public.agreement_acceptances where user_id = '10000000-0000-0000-0000-000000000001'),
  1, 'accepting the agreement at signup is recorded'
);
select is(
  (select kind from public.security_events where user_id = '10000000-0000-0000-0000-000000000001'),
  'signup', 'a signup event is logged'
);
select is(
  (select full_name from public.profiles_public_card where user_id = '10000000-0000-0000-0000-000000000001'),
  'Sara Khan', 'the public card is created'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000002', 'x@preston.edu.pk', '{}');
select is(
  (select university_id from public.profiles where user_id = '10000000-0000-0000-0000-000000000002'),
  null, 'a shared domain without a choice leaves the university to onboarding'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000003', 'y@preston.edu.pk',
        jsonb_build_object('university_id', pg_temp.uni('Preston University Karachi')));
select is(
  (select university_id from public.profiles where user_id = '10000000-0000-0000-0000-000000000003'),
  pg_temp.uni('Preston University Karachi'), 'the signup choice is used when it owns the domain'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000004', 'z@nutech.edu.pk', '{"agreement_version": "99"}');
select is_empty(
  $$ select 1 from public.agreement_acceptances where user_id = '10000000-0000-0000-0000-000000000004' $$,
  'a stale or unknown agreement version is not recorded'
);

-- Defence in depth: even without the hook, a non-university email can't get an account.
select throws_ok(
  $$ insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000009', 'z@gmail.com') $$,
  '42501', null, 'the trigger refuses a personal email'
);

-- A student account keeps a university email (PRD 5.27).
select throws_ok(
  $$ update auth.users set email_change = 'sara@gmail.com' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'an email change to a personal address is refused'
);
select throws_ok(
  $$ update auth.users set email = 'sara@nu.edu.pk' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'an email change to another university is refused'
);
select lives_ok(
  $$ update auth.users set last_sign_in_at = now() where id = '10000000-0000-0000-0000-000000000001' $$,
  'ordinary account updates still work'
);

select * from finish();
rollback;
