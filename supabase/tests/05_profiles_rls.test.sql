-- Profiles RLS (PRD 5.4, 8): visibility × viewer. A and C study at NUTECH, B at FAST.
-- Nobody reads another university's university-only profile; signed-out visitors read nothing.
begin;
select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('20000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk', '{"full_name": "Aisha A"}'),
  ('20000000-0000-0000-0000-00000000000b', 'b@nu.edu.pk',     '{"full_name": "Bilal B"}'),
  ('20000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk', '{"full_name": "Chaudhry C"}');

update public.profiles set username = 'aisha', department = 'Computer Science', graduation_year = 2027, bio = 'A bio'
 where user_id = '20000000-0000-0000-0000-00000000000a';
update public.profiles set username = 'bilal' where user_id = '20000000-0000-0000-0000-00000000000b';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.visible_to_me() returns setof text language sql as $$
  select username from public.profiles where username is not null order by username;
$$;

-- Default visibility is university.
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
select results_eq($$ select * from pg_temp.visible_to_me() $$, $$ values ('aisha') $$,
  'A sees her own profile but not B at another university');
select pg_temp.as_user('20000000-0000-0000-0000-00000000000c');
select results_eq($$ select * from pg_temp.visible_to_me() $$, $$ values ('aisha') $$,
  'C at the same university sees A');
select pg_temp.as_user('20000000-0000-0000-0000-00000000000b');
select results_eq($$ select * from pg_temp.visible_to_me() $$, $$ values ('bilal') $$,
  'B at another university sees only himself');
select is_empty($$ select 1 from public.profiles where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  'B cannot read A''s university-only profile by id');
select is_empty($$ select 1 from public.onboarding_state where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  'B cannot read A''s onboarding state');
select is_empty($$ select 1 from public.security_events where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  'B cannot read A''s security events');
select is_empty($$ select 1 from public.agreement_acceptances where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  'B cannot read A''s agreement acceptances');

-- The restricted card: name, department and batch, by exact username only.
select results_eq(
  $$ select username, full_name, department, graduation_year from public.get_profile_card('aisha') $$,
  $$ values ('aisha', 'Aisha A', 'Computer Science', 2027::smallint) $$,
  'B gets A''s public card: name, department and batch'
);
select is_empty($$ select * from public.get_profile_card('ais') $$, 'the card needs the exact username');
select throws_ok($$ select * from public.profiles_public_card $$, '42501', null,
  'the card table cannot be listed directly');

-- Writes: B cannot touch A; A changes only her own editable columns.
select is_empty(
  $$ update public.profiles set bio = 'hacked' where user_id = '20000000-0000-0000-0000-00000000000a' returning 1 $$,
  'B cannot update A''s profile');
reset role;
select is((select bio from public.profiles where user_id = '20000000-0000-0000-0000-00000000000a'), 'A bio',
  'A''s bio is unchanged');

set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
select isnt_empty(
  $$ update public.profiles set bio = 'New bio' where user_id = '20000000-0000-0000-0000-00000000000a' returning 1 $$,
  'A updates her own bio');
select throws_ok(
  $$ update public.profiles set university_id = (select id from public.universities where name like 'National University of Computer%') where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'A cannot move herself to another university');
select throws_ok(
  $$ update public.profiles set onboarding_complete = true where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'A cannot mark onboarding complete directly');
select throws_ok(
  $$ update public.profiles set role = 'faculty' where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'A cannot change her role');
select throws_ok(
  $$ insert into public.profiles (user_id, full_name) values ('20000000-0000-0000-0000-00000000000f', 'x') $$,
  '42501', null, 'profiles cannot be inserted over the API');
select throws_ok(
  $$ delete from public.profiles where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'profiles cannot be deleted over the API');
select throws_ok(
  $$ update public.profiles set avatar_path = '20000000-0000-0000-0000-00000000000b/x.webp' where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'an avatar path outside the owner''s folder is refused');
select throws_ok(
  $$ update public.profiles set username = 'admin' where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'reserved usernames are refused');

-- Global: every signed-in user, any university.
update public.profiles set visibility = 'global' where user_id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('20000000-0000-0000-0000-00000000000b');
select results_eq($$ select * from pg_temp.visible_to_me() $$, $$ values ('aisha'), ('bilal') $$,
  'B sees A once she is global');

-- Friends only: nobody else until friendships exist (phase 3).
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
update public.profiles set visibility = 'friends' where user_id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('20000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.profiles where user_id = '20000000-0000-0000-0000-00000000000a' $$,
  'C (same university, not a friend) cannot read A''s friends-only profile');
select results_eq($$ select username from public.get_profile_card('aisha') $$, $$ values ('aisha') $$,
  'C still gets A''s public card');
select pg_temp.as_user('20000000-0000-0000-0000-00000000000a');
select results_eq($$ select * from pg_temp.visible_to_me() $$, $$ values ('aisha') $$,
  'A still sees her own friends-only profile');

-- Username check.
select is(public.username_available('bilal'), false, 'a taken username is unavailable');
select is(public.username_available('aisha'), true, 'your own username counts as available');
select is(public.username_available('fresh_name'), true, 'a free username is available');
select is(public.username_available('Bad Name!'), false, 'an invalid username is unavailable');
reset role;

-- Signed-out visitors get nothing.
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.get_profile_card('aisha') $$, '42501', null, 'anon cannot read a public card');
reset role;

select * from finish();
rollback;
