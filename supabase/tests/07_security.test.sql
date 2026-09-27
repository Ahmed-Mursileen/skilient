-- Sign-in throttling, security events, new-device alerts and "This wasn't me",
-- rate limits and staff checks (PRD 8, 10 "Accounts and sign-in").
begin;
select plan(31);

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('40000000-0000-0000-0000-00000000000b', 'b@nu.edu.pk');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;

-- Calls signin_failed() p_times and returns the last result.
create function pg_temp.fail(p_email text, p_ip text, p_times int) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  for i in 1 .. p_times loop
    v := public.signin_failed(p_email, p_ip);
  end loop;
  return v;
end;
$$;
grant execute on function pg_temp.fail(text, text, int) to anon;

-- Failed sign-ins: Turnstile after 5, lock after 10, owner emailed once (PRD 10).
set local role anon;
select is((public.signin_status('a@nutech.edu.pk', null) ->> 'failures')::int, 0, 'no failures yet');
select is((pg_temp.fail('A@nutech.edu.pk', repeat('1', 64), 4) ->> 'captcha_required')::boolean, false,
  'four failures do not need Turnstile');
select is((public.signin_failed('a@nutech.edu.pk', repeat('1', 64)) ->> 'captcha_required')::boolean, true,
  'the fifth failure needs Turnstile');
select is((public.signin_status('a@nutech.edu.pk', null) ->> 'captcha_required')::boolean, true,
  'the account needs Turnstile from any IP');
select is((public.signin_status('someone@nutech.edu.pk', repeat('1', 64)) ->> 'captcha_required')::boolean, true,
  'the IP needs Turnstile for any account');
select is((pg_temp.fail('a@nutech.edu.pk', repeat('1', 64), 4) ->> 'failures')::int, 9, 'four more failures');
select results_eq(
  $$ select (r ->> 'locked')::boolean, (r ->> 'notify')::boolean from (select public.signin_failed('a@nutech.edu.pk', repeat('1', 64)) r) s $$,
  $$ values (true, true) $$,
  'the tenth failure locks the account and asks the app to email the owner');
select results_eq(
  $$ select (r ->> 'locked')::boolean, (r ->> 'notify')::boolean from (select public.signin_failed('a@nutech.edu.pk', repeat('1', 64)) r) s $$,
  $$ values (true, false) $$,
  'further failures while locked do not email again');
select isnt((public.signin_status('a@nutech.edu.pk', null) ->> 'locked_until'), null, 'the account reports a lock');
select is((public.signin_status('someone@nutech.edu.pk', repeat('1', 64)) ->> 'locked_until'), null,
  'the IP behind those failures is challenged, never locked');
select results_eq(
  $$ select (r ->> 'locked')::boolean, (r ->> 'notify')::boolean from (select pg_temp.fail('nobody@nutech.edu.pk', null, 10) r) s $$,
  $$ values (true, false) $$,
  'a lock on an unknown account never emails');
select throws_ok($$ select * from public.security_events $$, '42501', null, 'anon cannot read security events');
select throws_ok($$ select * from private.auth_failures $$, '42501', null, 'anon cannot read failed attempts');
reset role;

select is(
  (select array_agg(distinct kind order by kind) from public.security_events where user_id = '40000000-0000-0000-0000-00000000000a'),
  array['account_locked', 'sign_in_failed', 'signup'], 'failures and the lock are logged for the owner');

-- Successful sign-ins: first device no alert, a second device alerts with a one-time token.
set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select (r ->> 'new_device')::boolean, r ->> 'alert_token' from (select public.record_sign_in(repeat('a', 64), repeat('2', 64), 'Mozilla/5.0 Chrome', 'password') r) s $$,
  $$ values (true, null::text) $$,
  'the first device is new but raises no alert');
select results_eq(
  $$ select (r ->> 'new_device')::boolean, r ->> 'alert_token' from (select public.record_sign_in(repeat('a', 64), repeat('2', 64), 'Mozilla/5.0 Chrome', 'password') r) s $$,
  $$ values (false, null::text) $$,
  'a known device raises no alert');
reset role;
select is((public.signin_status('a@nutech.edu.pk', null) ->> 'failures')::int, 0, 'a successful sign-in clears failures');

create temporary table alert (token text) on commit drop;
grant all on alert to authenticated, anon;
set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-00000000000a');
insert into alert
  select public.record_sign_in(repeat('b', 64), repeat('3', 64), 'Mozilla/5.0 Firefox', 'google') ->> 'alert_token';
reset role;
select matches((select token from alert), '^[0-9a-f]{64}$', 'a new device mints a one-time alert token');
set local role anon;
select throws_ok(
  $$ select public.record_sign_in(repeat('c', 64), null, null, 'password') $$,
  '42501', null, 'record_sign_in needs a signed-in user');
reset role;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.user_devices where user_id = '40000000-0000-0000-0000-00000000000a' $$,
  'B cannot read A''s devices');
select pg_temp.as_user('40000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.user_devices), 2::bigint, 'A reads her own two devices');
reset role;

-- "This wasn't me" ends every session once, from a signed-out browser.
insert into auth.sessions (id, user_id) values
  ('40000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-0000000000f2', '40000000-0000-0000-0000-00000000000b');
set local role anon;
select is(public.security_not_me(repeat('0', 64)) ->> 'ok', 'false', 'an unknown token does nothing');
select results_eq(
  $$ select r ->> 'ok', r ->> 'email' from (select public.security_not_me((select token from alert)) r) s $$,
  $$ values ('true', 'a@nutech.edu.pk') $$,
  'the token signs A out everywhere and returns her email for the reset');
select is(public.security_not_me((select token from alert)) ->> 'ok', 'false', 'the token works only once');
reset role;
select is_empty($$ select 1 from auth.sessions where user_id = '40000000-0000-0000-0000-00000000000a' $$,
  'all of A''s sessions are gone');
select isnt_empty($$ select 1 from auth.sessions where user_id = '40000000-0000-0000-0000-00000000000b' $$,
  'B''s sessions are untouched');

-- Generic rate limit.
set local role anon;
select is(
  (select array_agg(public.rate_limit('test:key', 3, 3600) order by g) from generate_series(1, 4) g),
  array[true, true, true, false], 'the fourth call inside the window is refused');
select throws_ok($$ select public.rate_limit('test:key', 5000, 3600) $$, '22023', null, 'limits are bounded');
reset role;

-- Staff: a role only counts on a two-factor session.
insert into public.staff_roles (user_id, role) values ('40000000-0000-0000-0000-00000000000b', 'trust_reviewer');
set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-00000000000b', 'aal1');
select is(public.is_staff(), false, 'staff without two-factor are not staff');
select pg_temp.as_user('40000000-0000-0000-0000-00000000000b', 'aal2');
select results_eq(
  $$ select public.is_staff(), public.is_staff('trust_reviewer'), public.is_staff('super_admin') $$,
  $$ values (true, true, false) $$,
  'with two-factor the granted role counts, and only that role');
select throws_ok(
  $$ insert into public.staff_roles (user_id, role) values ('40000000-0000-0000-0000-00000000000b', 'super_admin') $$,
  '42501', null, 'staff cannot grant themselves roles');
reset role;

select * from finish();
rollback;
