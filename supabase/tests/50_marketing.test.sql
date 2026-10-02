-- Phase 12, slice 1 (PRD 5.1): live universities and the signup gate, university requests,
-- landing numbers (hidden below 200), plans for /pricing, and the staff controls.
-- C accounts staff, X a student (not staff).
begin;
select plan(34);

insert into public.universities (id, name, city, slug, live_at) values
  ('95000000-0000-0000-0000-0000000000a1', 'Closed University', 'Lahore', 'closed-university', null),
  ('95000000-0000-0000-0000-0000000000a2', 'Open University of Tests', 'Karachi', 'open-university-of-tests', now());
insert into public.university_domains (university_id, domain, kind) values
  ('95000000-0000-0000-0000-0000000000a1', 'closed.edu.pk', 'both'),
  ('95000000-0000-0000-0000-0000000000a2', 'open.edu.pk', 'both');
insert into public.personal_email_domains (domain) values ('mail-test.pk') on conflict do nothing;
insert into auth.users (id, email, email_confirmed_at) values
  ('95000000-0000-0000-0000-000000000001', 'staff50@nutech.edu.pk', now()),
  ('95000000-0000-0000-0000-000000000002', 'student50@open.edu.pk', now());
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  ('95000000-0000-0000-0000-000000000001', 'accounts', '95000000-0000-0000-0000-000000000001');

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signup gate
-- ---------------------------------------------------------------------------
select is(private.validate_signup('a@closed.edu.pk', 'student'), 'Your university isn''t on Skilient yet.',
  'a student at a university that is not live is refused');
select is(private.validate_signup('a@closed.edu.pk', 'faculty'), 'Your university isn''t on Skilient yet.',
  'faculty at a university that is not live are refused');
select is(private.validate_signup('a@closed.edu.pk', 'university_admin'), null,
  'a university official can sign up before the university opens');
select is(private.validate_signup('a@open.edu.pk', 'student'), null, 'a student at a live university can sign up');
select is(private.validate_signup('a@open.edu.pk', 'student', '95000000-0000-0000-0000-0000000000a1'),
  'That university doesn''t use this email domain.', 'the chosen university still has to own the domain');
select is(private.validate_signup('a@mail-test.pk', 'student'), 'Use your university email.', 'personal email is still refused first');
update public.universities set live_at = now() + interval '1 day' where id = '95000000-0000-0000-0000-0000000000a1';
select is(private.validate_signup('a@closed.edu.pk', 'student'), 'Your university isn''t on Skilient yet.',
  'a university opening tomorrow is not live today');
update public.universities set live_at = null where id = '95000000-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------------------
-- University requests (signed out)
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.university_requests$$, '42501', null, 'signed-out visitors cannot read requests');
select throws_ok($$select public.request_university('me@mail-test.pk', null, true, repeat('a', 40))$$,
  '22023', 'Use your university email.', 'a personal address cannot request');
select throws_ok($$select public.request_university('me@open.edu.pk', null, true, repeat('a', 40))$$,
  '55000', null, 'a live university cannot be requested');
select throws_ok($$select public.request_university('me@unknown-uni.edu.pk', null, true, repeat('a', 40))$$,
  '22023', 'Enter your university''s name.', 'an unknown domain needs the university name');
select throws_ok($$select public.request_university('me@closed.edu.pk', null, false, repeat('a', 40))$$,
  '22023', null, 'consent is required');
select is(public.request_university('Me@Closed.edu.pk', null, true, repeat('b', 40)) ->> 'status', 'created',
  'a known university that is not live can be requested');
select is(public.request_university('me@closed.edu.pk', null, true, repeat('c', 40)),
  '{"status": "exists", "university": "Closed University"}'::jsonb, 'asking twice changes nothing');
select is(public.request_university('you@unknown-uni.edu.pk', 'Unknown Institute of Tests', true, repeat('d', 40)) ->> 'university',
  'Unknown Institute of Tests', 'an unknown domain is recorded with the typed name');
select throws_ok($$select public.confirm_university_request(repeat('z', 40))$$, 'P0002', null, 'a wrong token confirms nothing');
select is(public.confirm_university_request(repeat('b', 40)) ->> 'university', 'Closed University', 'the email link confirms');
select ok(public.unsubscribe_university_request(repeat('b', 40)), 'the same link unsubscribes');
select throws_ok($$select public.confirm_university_request(repeat('b', 40))$$, 'P0002', null, 'an unsubscribed request cannot be confirmed again');
reset role;

select is((select row(lower(email), university_id::text, confirmed_at is not null, unsubscribed_at is not null)::text
             from public.university_requests where domain = 'closed.edu.pk'),
  row('me@closed.edu.pk', '95000000-0000-0000-0000-0000000000a1', true, true)::text, 'the request is stored lower-cased and linked');
select is((select count(*)::int from public.university_requests where token_hash ~ '^[0-9a-f]{64}$'), 2, 'only token hashes are stored');

set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.university_requests$$, '42501', null, 'a signed-in student cannot read requests');
select throws_ok($$select public.ops_university_requests()$$, '42501', null, 'a student cannot see the request counts');
select throws_ok($$select public.ops_set_university_live('95000000-0000-0000-0000-0000000000a1', true, 'test')$$,
  '42501', null, 'a student cannot open a university');
reset role;

-- ---------------------------------------------------------------------------
-- Staff controls
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-000000000001');
select is((select r ->> 'requests' from jsonb_array_elements(public.ops_university_requests()) r where r ->> 'domain' = 'closed.edu.pk'),
  '1', 'staff see requests counted per domain');
select ok(public.ops_set_university_live('95000000-0000-0000-0000-0000000000a1', true, 'MoU signed') is not null,
  'accounts staff open a university');
select ok(public.ops_open_all_universities('Public launch') >= 0, 'accounts staff can open every university at once');
reset role;
select is(private.validate_signup('a@closed.edu.pk', 'student'), null, 'once open, its students can sign up');
select ok((select before ? 'live_at' and after ? 'live_at' from public.ops_audit_log where action = 'uni.open'
             and target_id = '95000000-0000-0000-0000-0000000000a1'), 'opening is audited with before and after');
select ok(exists (select 1 from public.ops_audit_log where action = 'uni.open_all'), 'opening all is audited');

-- ---------------------------------------------------------------------------
-- Landing numbers: hidden below marketing.stats_min
-- ---------------------------------------------------------------------------
select private.refresh_landing_stats();
set local role anon;
select is(public.landing_stats() -> 'verified_students', 'null'::jsonb, 'fewer than 200 verified students: the number is hidden');
reset role;
insert into auth.users (id, email, email_confirmed_at)
select gen_random_uuid(), 'bulk' || g || '@open.edu.pk', now() from generate_series(1, 200) g;
select private.refresh_landing_stats();
set local role anon;
select ok((public.landing_stats() ->> 'verified_students')::int >= 200, 'at 200 the number shows');
select ok(public.landing_stats() -> 'universities' ? 'Open University of Tests', 'a live university with enough students is listed');
select ok((select (p ->> 'price_pkr')::numeric = 399 from jsonb_array_elements(public.public_plans()) p where p ->> 'id' = 'student_pro_monthly'),
  'plans and prices are readable signed out');
reset role;

select * from finish();
rollback;
