-- Recruiter portal, second file (PRD 5.20): saved searches, invitations to apply, bulk moves, the
-- company page, availability preferences, the Opportunities tabs, role limits, deletion and the
-- candidate link on /verify. R1 admin and R2 recruiter at Orbit; B is its billing seat; S1..S3 students.
begin;
select plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  ('96000000-0000-0000-0000-0000000000a1', 'r1@orbitcorp.com', '{"role":"recruiter","full_name":"Omar Orbit"}'),
  ('96000000-0000-0000-0000-0000000000a2', 'r2@orbitcorp.com', '{"role":"recruiter","full_name":"Rabia Orbit"}'),
  ('96000000-0000-0000-0000-0000000000a3', 'b@orbitcorp.com', '{"role":"recruiter","full_name":"Bashir Billing"}'),
  ('96000000-0000-0000-0000-00000000000a', 's1@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-00000000000b', 's2@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-00000000000c', 's3@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-0000000000f5', 'st@nutech.edu.pk', '{}');
update public.profiles set onboarding_complete = true, username = 'rx_' || right(user_id::text, 2),
       department = 'Software Engineering', graduation_year = 2027
 where user_id::text like '96000000-%' and role = 'student';
insert into public.staff_roles (user_id, role) values ('96000000-0000-0000-0000-0000000000f5', 'accounts');

create function pg_temp.as_user(p_id text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
-- Staff grants (phase 10 registry): the whole {key: [subject ids]} object replaces the previous pgTAP grants.
create function pg_temp.grants(p jsonb) returns void language plpgsql as $$
declare
  r record;
begin
  update public.entitlement_grants set revoked_at = now(), revoked_reason = 'pgTAP reset'
   where source = 'admin' and reason = 'pgTAP' and revoked_at is null;
  for r in select k.*, x.id from jsonb_each(p) t cross join lateral jsonb_array_elements_text(t.value) x(id)
             cross join lateral private.entitlement_key(t.key) k where k.key is not null loop
    insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
    values (r.subject, r.id::uuid, r.key, case r.kind when 'bool' then 'true'::jsonb else '1'::jsonb end, 'admin', now() + interval '1 day', 'pgTAP');
  end loop;
end;
$$;
-- What the phase 8 trial allowance gave every verified organisation (3 seats, 5 credits, shortlists).
create function pg_temp.baseline(p_org uuid) returns void language sql as $$
  insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason) values
    ('org', p_org, 'org.seats', '3', 'admin', now() + interval '1 day', 'pgTAP baseline'),
    ('org', p_org, 'contact.credits', '5', 'admin', now() + interval '1 day', 'pgTAP baseline'),
    ('org', p_org, 'recruit.shortlists', 'true', 'admin', now() + interval '1 day', 'pgTAP baseline');
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;
select pg_temp.baseline('96000000-0000-0000-0000-0000000000e1');

-- Set up the organisation directly (the creation flow is covered in file 41).
insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status, created_by) values
  ('96000000-0000-0000-0000-0000000000e1', 'orbit', 'Orbit Labs', 'orbitcorp.com', 'https://orbitcorp.com', 'Software', '11-50', 'Lahore', 'CEO', 'verified',
   '96000000-0000-0000-0000-0000000000a1');
insert into public.org_members (org_id, user_id, role) values
  ('96000000-0000-0000-0000-0000000000e1', '96000000-0000-0000-0000-0000000000a1', 'admin'),
  ('96000000-0000-0000-0000-0000000000e1', '96000000-0000-0000-0000-0000000000a2', 'recruiter'),
  ('96000000-0000-0000-0000-0000000000e1', '96000000-0000-0000-0000-0000000000a3', 'billing');
select pg_temp.remember('org', '96000000-0000-0000-0000-0000000000e1');
select pg_temp.grants(jsonb_build_object('talent.full_profile', jsonb_build_array(pg_temp.v('org')), 'saved_searches', jsonb_build_array(pg_temp.v('org'))));
insert into public.user_skills (user_id, skill_id, level) values
  ('96000000-0000-0000-0000-00000000000a', 'react', 3), ('96000000-0000-0000-0000-00000000000b', 'react', 1),
  ('96000000-0000-0000-0000-00000000000c', 'python', 4);
update public.profiles set recruiter_visible = true where user_id in ('96000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000b');

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.talent_explore('{}') $$, '42501', null, 'a billing seat can''t search talent');
select is((public.org_plan() ->> 'seats_used')::integer, 2, 'but sees the plan (a billing member takes no seat)');
select throws_ok($$ select public.org_members_list() $$, '42501', null, 'and can''t manage the team');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.org_members_list() $$, '42501', null, 'a recruiter seat can''t manage the team either');
select throws_ok($$ select public.update_company_page('{"industry":"Software","size":"11-50"}') $$, '42501', null, 'or edit the company page');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$ select public.talent_explore('{}') $$, '42501', null, 'a recruiter session without two-factor reads nothing');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.update_company_page('{"about":"Orbit builds maps.","locations":["Lahore","Karachi"],"industry":"Software","size":"11-50"}') $$, 'an admin edits the company page');
select throws_ok($$ select public.talent_explore('{"batch_from":"abcd"}') $$, '22023', null, 'a malformed batch is refused');

-- ---------------------------------------------------------------------------
-- Company page and student controls
-- ---------------------------------------------------------------------------
select pg_temp.as_user('96000000-0000-0000-0000-00000000000a');
select is(public.company_page('orbit') ->> 'name', 'Orbit Labs', 'a student reads a verified company page');
select is(public.company_page('orbit') ->> 'about', 'Orbit builds maps.', 'with its about text');
select ok(not (public.company_page('orbit') ? 'response_rate'), 'which carries no hiring or response statistics');
select throws_ok($$ select public.company_page('nope') $$, 'P0002', null, 'an unknown company is not found');
select lives_ok($$ select public.save_recruiter_prefs(array['internship', 'part_time'], 'Lahore', true) $$, 'a student sets availability, city and remote');
select throws_ok($$ select public.save_recruiter_prefs(array['astronaut'], null, false) $$, '22023', null, 'unknown availability is refused');
select is((public.my_recruiter_prefs() ->> 'city'), 'Lahore', 'and reads them back');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select is((public.talent_explore('{"availability":["part_time"]}') ->> 'total')::integer, 1, 'recruiters can filter by what the student said they are open to');

-- ---------------------------------------------------------------------------
-- Saved searches
-- ---------------------------------------------------------------------------
select lives_ok($$ select pg_temp.remember('ss', public.save_search('React people', '{"skills":[{"skill":"react","min_level":1}]}', 'daily')) $$, 'a saved search is stored (entitled)');
select throws_ok($$ select public.save_search('Bad', '{"gender":"f"}', 'daily') $$, '22023', null, 'a saved search can''t hold a protected filter');
select is(jsonb_array_length(public.saved_searches_list() -> 'items'), 1, 'it is listed');
reset role;
update public.saved_searches set last_run_at = now() - interval '2 days';
-- A student indexed after the search last ran counts as a new match.
update public.talent_index set first_indexed_at = now() - interval '1 hour' where student_id = '96000000-0000-0000-0000-00000000000b';
select is(private.run_saved_searches(), 1, 'a due search with new matches leaves a notice');
select is((select count(*)::integer from public.notifications where type = 'saved_search_matches' and user_id = '96000000-0000-0000-0000-0000000000a1'), 1, 'for the person who saved it');
select is(private.run_saved_searches(), 0, 'and not again until it is due');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.delete_saved_search(pg_temp.v('ss')) $$, 'P0002', null, 'another seat can''t delete it');

-- ---------------------------------------------------------------------------
-- Jobs: invite to apply, requirements, bulk moves, the Opportunities tabs
-- ---------------------------------------------------------------------------
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.remember('job', public.save_job(null, jsonb_build_object('title', 'React engineer', 'type', 'full_time', 'location', 'Lahore',
  'salary_min', 200000, 'salary_max', 300000, 'min_tier', 'spark', 'deadline', (current_date + 20)::text, 'description', repeat('x', 80),
  'min_skill_levels', '[{"skill":"react","min_level":1}]'::jsonb))) $$, 'a job with a tier requirement is saved');
select lives_ok($$ select public.publish_job(pg_temp.v('job')) $$, 'and published');
select is(public.invite_to_apply(pg_temp.v('job'), array['96000000-0000-0000-0000-00000000000a'::uuid, '96000000-0000-0000-0000-00000000000c'::uuid]), 1,
  'only visible candidates are invited to apply');
select is(public.invite_to_apply(pg_temp.v('job'), array['96000000-0000-0000-0000-00000000000a'::uuid]), 0, 'and never twice');
select pg_temp.as_user('96000000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.opportunities('jobs') where id = pg_temp.v('job')), 1, 'the invited student sees the job');
select is((select count(*)::integer from public.opportunities('for_you') where id = pg_temp.v('job')), 0, 'but For you needs the tier they don''t have');
select throws_ok($$ select public.apply_to_job(pg_temp.v('job')) $$, '55000', null, 'applying below the minimum tier is refused with the reason');
reset role;
insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked, tier, tier_met, computed_at, published_at)
values ('96000000-0000-0000-0000-00000000000a', 1, '{}', 10, 0, 0, 10, true, 'spark', 'spark', now(), now());
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.opportunities('for_you') where id = pg_temp.v('job')), 1, 'with the tier, the job is For you');
select lives_ok($$ select pg_temp.remember('app', public.apply_to_job(pg_temp.v('job'), null)) $$, 'and applying works');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select is(public.bulk_move_applications(array[pg_temp.v('app')], 'screening'), 1, 'a recruiter moves applicants in bulk');
select throws_ok($$ select public.bulk_move_applications(array[pg_temp.v('app')], 'rejected', 'because') $$, '22023', null, 'a rejection reason must be one of the three');
select lives_ok($$ select public.bulk_move_applications(array[pg_temp.v('app')], 'rejected', 'position_filled') $$, 'a rejection with a reason works');
select pg_temp.as_user('96000000-0000-0000-0000-00000000000a');
select is(public.application_get(pg_temp.v('app')) ->> 'reason', 'The position has been filled.', 'the student reads a generic reason');

-- ---------------------------------------------------------------------------
-- Members, deletion, the candidate link on /verify
-- ---------------------------------------------------------------------------
reset role;
insert into public.signing_keys (key_id, public_key) values ('cv-20260102-abcdef02', repeat('C', 43)) on conflict do nothing;
insert into public.cv_records (user_id, code, version, snapshot, content_hash, snapshot_hash, signature, key_id, source, issued_at, expires_at)
values ('96000000-0000-0000-0000-00000000000a', '9ABCDEFGHJ', 1, '{"schema":"skilient.cv/1"}', repeat('1', 64), repeat('2', 64), repeat('A', 86), (select key_id from public.signing_keys order by created_at limit 1), 'first',
        date_trunc('second', now()), date_trunc('second', now()) + interval '30 days');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select is(public.recruit_candidate_for_code('9abcdefghj'), '96000000-0000-0000-0000-00000000000a'::uuid, 'a recruiter who may open the student finds them from a verify code');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select public.add_note('96000000-0000-0000-0000-00000000000a', 'Interviewed on Tuesday.') $$, 'a note is added');
reset role;
select is((select count(*)::integer from public.recruiter_notes where student_id = '96000000-0000-0000-0000-00000000000a'), 1, 'it is stored with the student');
delete from auth.users where id = '96000000-0000-0000-0000-00000000000a';
select is((select count(*)::integer from public.recruiter_notes where student_id is null and body like 'Note removed%'), 1, 'when the student deletes their account the note is anonymised and its text removed');
select is((select count(*)::integer from public.job_applications where student_id = '96000000-0000-0000-0000-00000000000a'), 0, 'and their applications go');
select is((select count(*)::integer from public.hires where student_id is null), 0, 'no hire record was created by accident');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.recruit_candidate_for_code('9abcdefghj') $$, 'P0002', null, 'and the verify link no longer opens them');
select lives_ok($$ select public.remove_org_member('96000000-0000-0000-0000-0000000000a2') $$, 'an admin removes a recruiter seat');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.talent_explore('{}') $$, '42501', null, 'whose access ends at once');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.ops_org_reputation('96000000-0000-0000-0000-0000000000e1') $$, '42501', null, 'organisation reputation stays staff-only');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000f5');
select ok((public.ops_org_reputation('96000000-0000-0000-0000-0000000000e1') -> 'searches') is not null, 'and staff see the audit of its searches');
reset role;

select finish();
rollback;
