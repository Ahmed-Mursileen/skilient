-- Agreement versions and re-accept gate, onboarding state and completion (PRD 5.27).
begin;
select plan(22);

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk', '{"full_name": "Aisha A", "agreement_version": "1"}'),
  ('30000000-0000-0000-0000-00000000000b', 'b@nu.edu.pk', '{"full_name": "Bilal B"}'),
  ('30000000-0000-0000-0000-00000000000d', 'd@preston.edu.pk', '{"full_name": "Dua D"}');

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- Agreements: anyone reads the published text; drafts stay hidden.
insert into public.agreement_versions (version, title, body_md, summary_md) values (2, 'Draft', 'draft', 'draft');
set local role anon;
select results_eq($$ select version from public.agreement_versions order by version $$, $$ values (1) $$,
  'anon reads published versions only');
reset role;

set local role authenticated;
select pg_temp.as_user('30000000-0000-0000-0000-00000000000b');
select is((public.my_gate_state() ->> 'agreement_accepted')::boolean, false,
  'B signed up without accepting (e.g. Google), so the gate asks for it');
select throws_ok(
  $$ insert into public.agreement_acceptances (user_id, version) values ('30000000-0000-0000-0000-00000000000a', 1) $$,
  '42501', null, 'B cannot accept on A''s behalf');
select throws_ok(
  $$ insert into public.agreement_acceptances (user_id, version) values ('30000000-0000-0000-0000-00000000000b', 2) $$,
  '42501', null, 'B cannot accept an unpublished version');
select lives_ok(
  $$ insert into public.agreement_acceptances (user_id, version) values ('30000000-0000-0000-0000-00000000000b', 1) $$,
  'B accepts the current version');
select is((public.my_gate_state() ->> 'agreement_accepted')::boolean, true, 'the gate is satisfied');
select throws_ok(
  $$ delete from public.agreement_acceptances where user_id = '30000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'acceptances cannot be deleted');
reset role;

-- Publishing a new version re-opens the gate for everyone.
update public.agreement_versions set published_at = now() - interval '1 second' where version = 2;
set local role authenticated;
select pg_temp.as_user('30000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select (public.my_gate_state() ->> 'agreement_version')::int, (public.my_gate_state() ->> 'agreement_accepted')::boolean $$,
  $$ values (2, false) $$,
  'a newly published version must be accepted again');
reset role;
update public.agreement_versions set published_at = null where version = 2;

-- Onboarding: own state only; completion only when the required fields are set.
set local role authenticated;
select pg_temp.as_user('30000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select (public.my_gate_state() ->> 'onboarding_step')::int, (public.my_gate_state() ->> 'onboarding_complete')::boolean,
            (public.my_gate_state() ->> 'email_allowed')::boolean $$,
  $$ values (1, false, true) $$,
  'a new account starts onboarding at step 1 with an allowed email');
select isnt_empty(
  $$ update public.onboarding_state set step = 2, data = '{"skipped_github": false}' where user_id = '30000000-0000-0000-0000-00000000000a' returning 1 $$,
  'A saves her progress');
select throws_ok(
  $$ update public.onboarding_state set completed_at = now() where user_id = '30000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'A cannot set completed_at directly');
select throws_ok(
  $$ update public.onboarding_state set step = 9 where user_id = '30000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'steps stay between 1 and 6');
select is(public.complete_onboarding(), false, 'completion is refused while required fields are missing');
update public.profiles set username = 'aisha', department = 'Computer Science', graduation_year = 2027
 where user_id = '30000000-0000-0000-0000-00000000000a';
select is(public.complete_onboarding(), true, 'completion succeeds once the fields are set');
select is((public.my_gate_state() ->> 'onboarding_complete')::boolean, true, 'the gate sees onboarding complete');

select pg_temp.as_user('30000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ update public.onboarding_state set step = 6 where user_id = '30000000-0000-0000-0000-00000000000a' returning 1 $$,
  'B cannot change A''s onboarding');

-- Shared domain: D picks among the owning universities only, and only before completing.
select pg_temp.as_user('30000000-0000-0000-0000-00000000000d');
select is(public.my_gate_state() -> 'university_id', 'null'::jsonb, 'D''s university is still undecided');
select is(
  public.set_my_university((select id from public.universities where name = 'National University of Technology (NUTECH)')),
  false, 'D cannot pick a university that doesn''t own her email domain');
select is(
  public.set_my_university((select id from public.universities where name = 'Preston University Kohat')),
  true, 'D picks one of the universities that owns preston.edu.pk');
select pg_temp.as_user('30000000-0000-0000-0000-00000000000a');
select is(
  public.set_my_university((select id from public.universities where name = 'National University of Technology (NUTECH)')),
  false, 'the university is fixed once onboarding is complete');
reset role;

set local role anon;
select throws_ok($$ select public.my_gate_state() $$, '42501', null, 'anon has no gate state');
select throws_ok($$ select public.complete_onboarding() $$, '42501', null, 'anon cannot complete onboarding');
reset role;

select * from finish();
rollback;
