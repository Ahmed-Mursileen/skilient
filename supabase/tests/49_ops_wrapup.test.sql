-- Phase 11, slice 5 (PRD 5.26): every staff write is audited with before and after (checked over
-- the whole catalogue), organisation verification documents, and university onboarding.
-- A super admin, C accounts staff, M moderator, P an organisation admin, Q another recruiter,
-- O a university official.
begin;
select plan(34);

insert into public.universities (id, name, city, slug)
values ('94900000-0000-0000-0000-0000000000a1', 'Wrapup University', 'Islamabad', 'wrapup-university');
insert into public.university_domains (university_id, domain, kind) values ('94900000-0000-0000-0000-0000000000a1', 'wrapup-uni.edu.pk', 'both');
insert into auth.users (id, email)
select ('94900000-0000-0000-0000-0000000000' || x.k)::uuid, x.e
  from (values ('01', 'ow01@nutech.edu.pk'), ('02', 'ow02@nutech.edu.pk'), ('03', 'ow03@nutech.edu.pk'),
               ('04', 'ow04@nutech.edu.pk'), ('05', 'ow05@nutech.edu.pk'), ('06', 'registrar@wrapup-uni.edu.pk')) as x(k, e);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('94900000-0000-0000-0000-0000000000' || case p when 'A' then '01' when 'C' then '02' when 'M' then '03'
    when 'P' then '04' when 'Q' then '05' when 'O' then '06' end)::uuid
$$;
update public.profiles set onboarding_complete = true, full_name = 'Wrap ' || right(user_id::text, 2) where user_id::text like '94900000-%';
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  (pg_temp.u('A'), 'super_admin', pg_temp.u('A')), (pg_temp.u('C'), 'accounts', pg_temp.u('A')), (pg_temp.u('M'), 'moderator', pg_temp.u('A'));
insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status)
values ('94900000-0000-0000-0000-00000000000f', 'wrapup-co', 'Wrapup Co', 'wrapup-co.pk', 'https://wrapup-co.pk', 'Software', '11-50', 'Lahore', 'Founder', 'pending'),
       ('94900000-0000-0000-0000-00000000000e', 'elsewhere-co', 'Elsewhere Co', 'elsewhere-co.pk', 'https://elsewhere-co.pk', 'Software', '11-50', 'Lahore', 'Founder', 'pending');
insert into public.org_members (org_id, user_id, role) values
  ('94900000-0000-0000-0000-00000000000f', pg_temp.u('P'), 'admin'), ('94900000-0000-0000-0000-00000000000e', pg_temp.u('Q'), 'admin');
update public.profiles set role = 'university_admin', university_id = '94900000-0000-0000-0000-0000000000a1' where user_id = pg_temp.u('O');
insert into public.personal_email_domains (domain) values ('wrapup-mail.pk') on conflict do nothing;

create function pg_temp.as_user(p text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.audit(p_action text, p_target text) returns public.ops_audit_log language sql security definer as $$
  select * from public.ops_audit_log where action = p_action and target_id = p_target order by created_at desc limit 1
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Every staff write records before and after
-- ---------------------------------------------------------------------------
-- A staff write function: requires a staff role and changes a table. It must insert into
-- ops_audit_log with both before and after, or go through private.billing_audit (which does).
-- Excluded: create_post (a staff announcement is its own record, with its author) and
-- ops_view_as_page (it appends to its own view session, the log of that view).
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p
    where p.pronamespace = 'private'::regnamespace
      and p.prosrc ~ 'require_(moderator|trust_reviewer|accounts|any_staff|super_admin|accounts_or_admin)\(|is_staff\('
      and p.prosrc ~* '(insert into|update|delete from)\s+(public|auth|storage|private)\.'
      and p.proname not in ('create_post', 'ops_view_as_page', 'billing_audit')
      and not (p.prosrc ~* 'insert into public\.ops_audit_log\s*\([^)]*\mbefore\M[^)]*\mafter\M'
               or p.prosrc ~* 'private\.billing_audit\(')),
  '{}'::text[],
  'every staff write function audits with before and after');
select ok((select count(*) from pg_proc p where p.pronamespace = 'private'::regnamespace
            and p.prosrc ~* 'insert into public\.ops_audit_log\s*\([^)]*\mbefore\M[^)]*\mafter\M') >= 40,
  'and there are dozens of them, so the check reads the real catalogue');
select ok((select prosrc ~* 'insert into public\.ops_audit_log\s*\([^)]*\mbefore\M[^)]*\mafter\M' from pg_proc
            where proname = 'billing_audit' and pronamespace = 'private'::regnamespace), 'billing_audit writes both');

set local role authenticated;
select pg_temp.as_user('C');
select lives_ok($$select public.add_exam_period('94900000-0000-0000-0000-0000000000a1', '2091-03-01', '2091-03-10', 'Mid-terms per registrar')$$,
  'accounts staff add an exam period');
select is((select before from public.ops_audit_log where action = 'exam_period.add' and staff_id = pg_temp.u('C')), '{}'::jsonb,
  'the add now records an empty before');
select lives_ok($$select public.remove_exam_period((select id from public.exam_periods where university_id = '94900000-0000-0000-0000-0000000000a1'), 'Entered twice')$$,
  'and removes it');
select is((select after from public.ops_audit_log where action = 'exam_period.remove' and staff_id = pg_temp.u('C')), '{"removed": true}'::jsonb,
  'the removal now records an after');

-- ---------------------------------------------------------------------------
-- Organisation verification documents
-- ---------------------------------------------------------------------------
select pg_temp.as_user('P');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id, metadata)
                  values ('org-documents', '94900000-0000-0000-0000-00000000000f/94900000-0000-0000-0000-0000000000d1.pdf', pg_temp.u('P')::text, '{"size": 2048}')$$,
  'an organisation admin uploads into their organisation''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id, metadata)
                   values ('org-documents', '94900000-0000-0000-0000-00000000000e/94900000-0000-0000-0000-0000000000d2.pdf', pg_temp.u('P')::text, '{"size": 2048}')$$,
  '42501', null, 'but not into another organisation''s');
select throws_ok($$select public.submit_org_document('94900000-0000-0000-0000-00000000000e/94900000-0000-0000-0000-0000000000d2.pdf')$$,
  '22023', null, 'and can''t attach another organisation''s path');
select throws_ok($$select public.submit_org_document('94900000-0000-0000-0000-00000000000f/94900000-0000-0000-0000-0000000000d9.pdf')$$,
  'P0002', null, 'or a file that wasn''t uploaded');
select lives_ok($$select public.submit_org_document('94900000-0000-0000-0000-00000000000f/94900000-0000-0000-0000-0000000000d1.pdf')$$,
  'attaches the uploaded document');
select is(public.my_org_document() ->> 'path', '94900000-0000-0000-0000-00000000000f/94900000-0000-0000-0000-0000000000d1.pdf', 'and sees it');
select pg_temp.as_user('Q');
select is((select count(*)::integer from storage.objects where bucket_id = 'org-documents'), 0, 'another organisation can''t see the file');
select throws_ok($$select public.ops_org_document('94900000-0000-0000-0000-00000000000f')$$, '42501', null, 'or read it through ops');
select pg_temp.as_user('M');
select is((select count(*)::integer from storage.objects where bucket_id = 'org-documents'), 0, 'nor can a moderator');
select pg_temp.as_user('C');
select is((select count(*)::integer from storage.objects where bucket_id = 'org-documents'), 1, 'accounts staff can read it');
select is(public.ops_org_document('94900000-0000-0000-0000-00000000000f') ->> 'type', 'pdf', 'and see it on the organisation''s case');
select pg_temp.as_user('C', 'aal1');
select is((select count(*)::integer from storage.objects where bucket_id = 'org-documents'), 0, 'but only with two-factor on');

-- ---------------------------------------------------------------------------
-- University onboarding
-- ---------------------------------------------------------------------------
select pg_temp.as_user('M');
select throws_ok($$select public.ops_uni_list('wrapup')$$, '42501', null, 'moderators don''t onboard universities');
select pg_temp.as_user('C');
select is((public.ops_uni_list('wrapup') -> 0 ->> 'id'), '94900000-0000-0000-0000-0000000000a1', 'accounts staff find a university by name');
select is((public.ops_uni_list('wrapup-uni.edu') -> 0 ->> 'id'), '94900000-0000-0000-0000-0000000000a1', 'or by domain');
select is((public.ops_uni_record('94900000-0000-0000-0000-0000000000a1') ->> 'owner'), null, 'it has no owner yet');
select throws_ok($$select public.ops_assign_uni_owner('94900000-0000-0000-0000-0000000000a1', 'ow03@nutech.edu.pk', 'MoU signed 1 Oct')$$,
  '22023', null, 'only a university staff account at that university can become owner');
select throws_ok($$select public.ops_assign_uni_owner('94900000-0000-0000-0000-0000000000a1', 'registrar@wrapup-uni.edu.pk', 'MoU signed 1 Oct')$$,
  '55000', null, 'and it needs two-factor on');
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), pg_temp.u('O'), 'phone', 'totp', 'verified', now(), now());
set local role authenticated;
select pg_temp.as_user('C');
select is(public.ops_assign_uni_owner('94900000-0000-0000-0000-0000000000a1', 'Registrar@wrapup-uni.edu.pk', 'MoU signed 1 Oct 2026'), pg_temp.u('O'),
  'accounts staff make the registrar the owner');
select is((public.ops_uni_record('94900000-0000-0000-0000-0000000000a1') -> 'owner' ->> 'user_id'), pg_temp.u('O')::text, 'the record shows the owner');
select is((pg_temp.audit('uni.owner_assign', '94900000-0000-0000-0000-0000000000a1')).after ->> 'owner_id', pg_temp.u('O')::text, 'audited with the owner after');
select throws_ok($$select public.ops_assign_uni_owner('94900000-0000-0000-0000-0000000000a1', 'registrar@wrapup-uni.edu.pk', 'again')$$,
  '55000', null, 'a university keeps one owner');

select throws_ok($$select public.ops_add_uni_domain('94900000-0000-0000-0000-0000000000a1', 'wrapup-mail.pk', 'both', 'Staff mail')$$,
  '22023', null, 'a public email domain is never a university domain');
select throws_ok($$select public.ops_add_uni_domain('94900000-0000-0000-0000-0000000000a1', 'wrapup-uni.edu.pk', 'both', 'Again')$$,
  '23505', null, 'a domain belongs to one university');
select lives_ok($$select public.ops_add_uni_domain('94900000-0000-0000-0000-0000000000a1', 'Students.Wrapup-Uni.edu.pk', 'student', 'Student mail server')$$,
  'accounts staff add a student domain');
reset role;
select is((select source from public.university_domains where domain = 'students.wrapup-uni.edu.pk'), 'ops', 'marked as added by staff (the HEC sync leaves it alone)');
select is((pg_temp.audit('uni.domain_add', '94900000-0000-0000-0000-0000000000a1')).after ->> 'domain', 'students.wrapup-uni.edu.pk', 'and audited');

select * from finish();
rollback;
