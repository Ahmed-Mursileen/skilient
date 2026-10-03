-- Phase 12, slice 3 (PRD 5.1): university "Talk to us" leads and the public pricing extras.
-- C and D accounts staff, X a student (not staff).
begin;
select plan(16);

insert into public.universities (id, name, city, slug) values
  ('95100000-0000-0000-0000-0000000000a1', 'Leads Test University', 'Multan', 'leads-test-university');
insert into public.university_domains (university_id, domain, kind) values ('95100000-0000-0000-0000-0000000000a1', 'leads-uni.edu.pk', 'both');
insert into auth.users (id, email, email_confirmed_at) values
  ('95100000-0000-0000-0000-000000000001', 'staff51c@nutech.edu.pk', now()),
  ('95100000-0000-0000-0000-000000000002', 'staff51d@nutech.edu.pk', now()),
  ('95100000-0000-0000-0000-000000000003', 'student51@nutech.edu.pk', now());
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  ('95100000-0000-0000-0000-000000000001', 'accounts', '95100000-0000-0000-0000-000000000001'),
  ('95100000-0000-0000-0000-000000000002', 'accounts', '95100000-0000-0000-0000-000000000001');

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

set local role anon;
select throws_ok($$select * from public.sales_leads$$, '42501', null, 'signed-out visitors cannot read leads');
select throws_ok($$select public.submit_sales_lead('Dr Amna', 'Director, Career Services', 'Leads Test University', 'amna@leads-uni.edu.pk', 'short')$$,
  '22023', null, 'a message needs at least 10 characters');
select throws_ok($$select public.submit_sales_lead('Dr Amna', 'Director, Career Services', 'Leads Test University', 'not-an-email', 'We would like a demo for our career office.')$$,
  '22023', 'Enter a valid email address.', 'the email must be valid');
select ok(public.submit_sales_lead('Dr Amna', 'Director, Career Services', 'Leads Test University', 'Amna@Leads-Uni.edu.pk',
  'We would like a demo for our career office.') is not null, 'a university official can send a lead signed out');
select throws_ok($$select public.submit_sales_lead('Dr Amna', 'Director', 'Leads Test University', 'amna@leads-uni.edu.pk', 'Following up on my earlier message.')$$,
  '23505', null, 'one open lead per address');
select ok((public.public_pricing_extras() -> 'hire_fees' ->> 'intern')::int > 0, 'hiring fees are readable signed out');
select ok((public.public_pricing_extras() ->> 'trial_days')::int > 0, 'the trial length is readable signed out');
reset role;

create function pg_temp.lead() returns uuid language sql security definer as $$ select id from public.sales_leads where email = 'amna@leads-uni.edu.pk' $$;
grant execute on function pg_temp.lead() to authenticated;
select is((select university_id::text from public.sales_leads where email = 'amna@leads-uni.edu.pk'),
  '95100000-0000-0000-0000-0000000000a1', 'the lead is matched to its university by email domain');

set local role authenticated;
select pg_temp.as_user('95100000-0000-0000-0000-000000000003');
select throws_ok($$select * from public.sales_leads$$, '42501', null, 'a signed-in student cannot read leads');
select throws_ok($$select public.ops_sales_leads()$$, '42501', null, 'a student cannot open the lead queue');

select pg_temp.as_user('95100000-0000-0000-0000-000000000001');
select is((select l ->> 'university' from jsonb_array_elements(public.ops_sales_leads()) l where l ->> 'email' = 'amna@leads-uni.edu.pk'),
  'Leads Test University', 'accounts staff see the lead with its university');
select lives_ok($$select public.ops_update_sales_lead(pg_temp.lead(), 'contacted', 'Called on Monday')$$,
  'staff move a lead along');
select pg_temp.as_user('95100000-0000-0000-0000-000000000002');
select throws_ok($$select public.ops_update_sales_lead(pg_temp.lead(), 'lost', 'not mine')$$,
  '55000', null, 'another staff member cannot change a lead someone is working on');
reset role;

select is((select row(status::text, claimed_by::text, staff_note)::text from public.sales_leads where email = 'amna@leads-uni.edu.pk'),
  row('contacted', '95100000-0000-0000-0000-000000000001', 'Called on Monday')::text, 'the first staff member to act claims the lead');
select ok((select before ? 'status' and after ? 'status' from public.ops_audit_log where action = 'lead.update' order by created_at desc limit 1),
  'the update is audited with before and after');
select is((select count(*)::int from public.ops_audit_log where action = 'lead.update'), 1, 'one audit row per update');

select * from finish();
rollback;
