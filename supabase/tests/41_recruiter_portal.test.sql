-- Recruiter portal (PRD 5.20). R1 is the admin of Acme, R2 a recruiter at a rival, R3 an invited
-- teammate of Acme, S1..S4 are NUTECH students, ST is accounts staff (aal2).
begin;
select plan(208);

insert into auth.users (id, email, raw_user_meta_data) values
  ('95000000-0000-0000-0000-0000000000a1', 'r1@acmecorp.com', '{"role":"recruiter","full_name":"Rita Recruiter"}'),
  ('95000000-0000-0000-0000-0000000000a2', 'r2@rivalco.com', '{"role":"recruiter","full_name":"Ravi Rival"}'),
  ('95000000-0000-0000-0000-0000000000a3', 'r3@acmecorp.com', '{"role":"recruiter","full_name":"Rana Teammate"}'),
  ('95000000-0000-0000-0000-00000000000a', 's1@nutech.edu.pk', '{}'),
  ('95000000-0000-0000-0000-00000000000b', 's2@nutech.edu.pk', '{}'),
  ('95000000-0000-0000-0000-00000000000c', 's3@nutech.edu.pk', '{}'),
  ('95000000-0000-0000-0000-00000000000d', 's4@nutech.edu.pk', '{}'),
  ('95000000-0000-0000-0000-0000000000f5', 'st@nutech.edu.pk', '{}');
update public.profiles set onboarding_complete = true, username = 'rp_' || right(user_id::text, 2),
       department = 'Computer Science', graduation_year = 2027
 where user_id::text like '95000000-%' and role = 'student';
insert into public.staff_roles (user_id, role) values ('95000000-0000-0000-0000-0000000000f5', 'accounts');

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

-- ---------------------------------------------------------------------------
-- Signup
-- ---------------------------------------------------------------------------
select is(private.validate_signup('x@gmail.com', 'recruiter'), 'Use your work email.', 'a recruiter can''t use a webmail address');
select is(private.validate_signup('x@nutech.edu.pk', 'recruiter'), 'Use your company email, not a university one.', 'a recruiter can''t use a university domain');
select is(private.validate_signup('x@acmecorp.com', 'recruiter'), null, 'a company domain is accepted');
select is((select role::text from public.profiles where user_id = '95000000-0000-0000-0000-0000000000a1'), 'recruiter', 'a recruiter signup creates a recruiter profile');
select ok((select university_id is null and onboarding_complete and visibility = 'friends' from public.profiles where user_id = '95000000-0000-0000-0000-0000000000a1'),
  'a recruiter has no university, skips onboarding and is hidden from students');
select throws_ok($$ insert into auth.users (id, email, raw_user_meta_data) values ('95000000-0000-0000-0000-0000000000e1', 'x@gmail.com', '{"role":"recruiter"}') $$,
  '42501', null, 'the trigger refuses a recruiter with a webmail address even if the hook is off');

-- ---------------------------------------------------------------------------
-- Organisation: create, verify, suspend
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$ select public.create_organization('{"name":"Acme","website":"https://www.acmecorp.com","industry":"Software","size":"11-50","city":"Islamabad","signer_role":"HR lead"}') $$,
  '42501', null, 'two-factor is required to create an organisation');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.create_organization('{"name":"Acme","website":"https://www.other-site.com","industry":"Software","size":"11-50","city":"Islamabad","signer_role":"HR lead"}') $$,
  '22023', null, 'the website must match the email domain');
select throws_ok($$ select public.create_organization('{"name":"Acme","website":"http://www.acmecorp.com","industry":"Software","size":"11-50","city":"Islamabad","signer_role":"HR lead"}') $$,
  '22023', null, 'the website must be https');
select lives_ok($$ select pg_temp.remember('orgA', public.create_organization('{"name":"Acme Software","website":"https://www.acmecorp.com","industry":"Software","size":"11-50","city":"Islamabad","signer_role":"HR lead"}')) $$,
  'a recruiter creates their organisation');
select throws_ok($$ select public.create_organization('{"name":"Acme Two","website":"https://acmecorp.com","industry":"Software","size":"11-50","city":"Islamabad","signer_role":"HR lead"}') $$,
  '55000', null, 'they can''t create a second one');
select is(public.my_org() ->> 'status', 'pending', 'a new organisation is pending');
select is(public.my_org() ->> 'role', 'admin', 'its creator is the admin');
select throws_ok($$ select public.talent_explore('{}') $$, '42501', null, 'a pending organisation sees no talent data');
select lives_ok($$ select public.update_company_page('{"about":"We build software.","locations":["Islamabad","Lahore"],"industry":"Software","size":"11-50"}') $$,
  'a pending organisation can build its company page');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select pg_temp.remember('orgB', public.create_organization('{"name":"Rival Co","website":"https://rivalco.com","industry":"Software","size":"51-200","city":"Karachi","signer_role":"Founder"}')) $$,
  'a second company creates its organisation');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.ops_orgs('pending') $$, '42501', null, 'recruiters can''t read the verification queue');
select throws_ok($$ select public.decide_org(pg_temp.v('orgA'), 'verify', null) $$, '42501', null, 'recruiters can''t verify themselves');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000f5', 'aal1');
select throws_ok($$ select public.decide_org(pg_temp.v('orgA'), 'verify', null) $$, '42501', null, 'staff without two-factor can''t verify');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000f5');
select is(jsonb_array_length(public.ops_orgs('pending')), 2, 'staff see both pending organisations');
select throws_ok($$ select public.decide_org(pg_temp.v('orgB'), 'reject', null) $$, '22023', null, 'a rejection needs a reason');
select lives_ok($$ select public.decide_org(pg_temp.v('orgA'), 'verify', null) $$, 'accounts staff verify an organisation');
select lives_ok($$ select public.decide_org(pg_temp.v('orgB'), 'verify', null) $$, 'and the rival');
select throws_ok($$ select public.decide_org(pg_temp.v('orgA'), 'verify', null) $$, '55000', null, 'a verified organisation can''t be verified again');
reset role;
select pg_temp.baseline(pg_temp.v('orgA')), pg_temp.baseline(pg_temp.v('orgB'));
select is((select count(*)::integer from public.ops_audit_log where target_type = 'organization' and action = 'org.verify'), 2, 'verification is audited');
select is((select count(*)::integer from public.notifications where type = 'org_decided' and user_id = '95000000-0000-0000-0000-0000000000a1'), 1,
  'the organisation''s admin is told');

-- ---------------------------------------------------------------------------
-- Plan stub: fail closed
-- ---------------------------------------------------------------------------
select is(private.org_entitled(pg_temp.v('orgA'), 'talent.full_profile'), false, 'no entitlement without a grant');
select is(private.org_entitled(pg_temp.v('orgA'), 'made.up'), false, 'an unknown key is denied');
select pg_temp.grants(jsonb_build_object('talent.full_profile', jsonb_build_array(pg_temp.v('orgA')), 'made.up', jsonb_build_array(pg_temp.v('orgA')),
  'saved_searches', jsonb_build_array(pg_temp.v('orgA')), 'analytics', jsonb_build_array(pg_temp.v('orgA')),
  'api.access', jsonb_build_array(pg_temp.v('orgA')), 'competitions.create', jsonb_build_array(pg_temp.v('orgA'))));
select is(private.org_entitled(pg_temp.v('orgA'), 'talent.full_profile'), true, 'a granted known key is allowed');
select is(private.org_entitled(pg_temp.v('orgA'), 'made.up'), false, 'an unknown key stays denied even if granted');
select is(private.org_entitled(pg_temp.v('orgB'), 'talent.full_profile'), false, 'the grant names one organisation');

-- ---------------------------------------------------------------------------
-- Talent index and search
-- ---------------------------------------------------------------------------
insert into public.user_skills (user_id, skill_id, level) values
  ('95000000-0000-0000-0000-00000000000a', 'react', 3), ('95000000-0000-0000-0000-00000000000a', 'python', 2),
  ('95000000-0000-0000-0000-00000000000b', 'python', 1),
  ('95000000-0000-0000-0000-00000000000c', 'react', 4),
  ('95000000-0000-0000-0000-00000000000d', 'react', 2);
insert into public.code_checks (user_id, skill_id, status) values ('95000000-0000-0000-0000-00000000000a', 'react', 'passed');
update public.profiles set recruiter_visible = true, availability = '{internship}', city = 'Islamabad'
 where user_id in ('95000000-0000-0000-0000-00000000000a', '95000000-0000-0000-0000-00000000000b', '95000000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.talent_index where student_id::text like '95000000-%'), 3, 'only recruiter-visible students are indexed');
select is_empty($$ select 1 from public.talent_index where student_id = '95000000-0000-0000-0000-00000000000c' $$, 'a student who didn''t opt in is not indexed');
select is_empty($$ select column_name from information_schema.columns where table_schema = 'public' and table_name = 'talent_index'
                    and column_name ~* '(name|photo|avatar|username|gender|age|religion|ethnic|email)' $$,
  'the index has no name, photo, username or protected-attribute column');
select private.refresh_talent_index();

set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select * from public.talent_index $$, '42501', null, 'the index can''t be read directly');
select throws_ok($$ select public.talent_explore('{"gender":"f"}') $$, '22023', null, 'gender can''t be filtered');
select throws_ok($$ select public.talent_explore('{"religion":"x"}') $$, '22023', null, 'religion can''t be filtered');
select throws_ok($$ select public.talent_explore('{"age":{"max":25}}') $$, '22023', null, 'age can''t be filtered');
select throws_ok($$ select public.search_talent('{"photo":true}') $$, '22023', null, 'photos can''t be filtered');
select throws_ok($$ select public.talent_explore('{"skills":[{"skill":"react","min_level":9}]}') $$, '22023', null, 'a skill level above 4 is refused');

select is((public.talent_explore('{"skills":[{"skill":"react","min_level":2}]}') ->> 'total')::integer, 2, 'Explore counts students at L2+ React');
select is((public.talent_explore('{"skills":[{"skill":"react","min_level":3}]}') ->> 'total')::integer, 1, 'the minimum level filters');
select is((public.talent_explore('{"skills":[{"skill":"react","min_level":1}],"code_check":true}') ->> 'total')::integer, 1, 'has code check filters');
select is((public.talent_explore('{"availability":["part_time"]}') ->> 'total')::integer, 0, 'availability filters');
select is((public.talent_explore('{"city":"islamabad"}') ->> 'total')::integer, 3, 'city filters (case-insensitive)');
select ok(not exists (
    select 1 from jsonb_array_elements(public.talent_explore('{}') -> 'results') r, jsonb_object_keys(r) k
     where k in ('id', 'student_id', 'name', 'username', 'avatar_path', 'photo', 'email')),
  'Explore rows carry no id, name, username, photo or email');
select ok((public.talent_explore('{"skills":[{"skill":"react","min_level":2}]}') -> 'results' -> 0 ->> 'why') like 'L3 React%',
  'each result says why it matches, best match first');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.search_talent('{}') $$, '55000', null, 'an organisation without the entitlement gets no full results');
select is((public.talent_explore('{}') ->> 'total')::integer, 3, 'Explore still works for it');
select is((public.talent_explore('{}') ->> 'full_access')::boolean, false, 'and says full access is locked');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is((public.search_talent('{"skills":[{"skill":"react","min_level":2}]}') ->> 'total')::integer, 2, 'full results with the entitlement');
select is((public.search_talent('{"skills":[{"skill":"react","min_level":2}]}') -> 'results' -> 0 ->> 'name'), 's1',
  'full results carry names');
select pg_temp.remember('s1', '95000000-0000-0000-0000-00000000000a');
select pg_temp.remember('s2', '95000000-0000-0000-0000-00000000000b');
select pg_temp.remember('s3', '95000000-0000-0000-0000-00000000000c');
select pg_temp.remember('s4', '95000000-0000-0000-0000-00000000000d');
reset role;
select ok((select count(*) >= 5 from public.search_audit where org_id = pg_temp.v('orgA')), 'every search is audited');
select ok(not exists (select 1 from public.search_audit where filters ? 'gender'), 'refused filters aren''t audited as searches');
select private.org_log(pg_temp.v('orgA'), pg_temp.v('s1'), 'viewed');

-- ---------------------------------------------------------------------------
-- Candidate, notes, shortlists, company blocks, visibility
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.recruit_candidate(pg_temp.v('s3')) $$, 'P0002', null, 'a student who isn''t visible can''t be opened');
select is(public.recruit_candidate(pg_temp.v('s1')) #>> '{person,name}', 's1', 'a visible student opens');
select is(public.recruit_candidate(pg_temp.v('s1')) ->> 'access', 'search', 'through the entitlement');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.recruit_candidate(pg_temp.v('s1')) $$, 'P0002', null, 'an organisation without the entitlement can''t open candidates');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.remember('listA', public.create_shortlist('Frontend')) $$, 'a shortlist is created');
select lives_ok($$ select public.add_to_shortlist(pg_temp.v('listA'), pg_temp.v('s1')) $$, 'a candidate is added');
select lives_ok($$ select public.add_to_shortlist(pg_temp.v('listA'), pg_temp.v('s4')) $$, 'and another');
select throws_ok($$ select public.add_to_shortlist(pg_temp.v('listA'), pg_temp.v('s3')) $$, 'P0002', null, 'a student who isn''t visible can''t be shortlisted');
select lives_ok($$ select public.add_note(pg_temp.v('s1'), 'Strong React, follow up in March.') $$, 'a private note is added');
select is(jsonb_array_length(public.notes_for(pg_temp.v('s1'))), 1, 'the org reads its notes');
select lives_ok($$ select public.reorder_shortlist(pg_temp.v('listA'), array(select (i ->> 'id')::uuid from jsonb_array_elements(public.shortlist_get(pg_temp.v('listA')) -> 'items') i order by i ->> 'name' desc)) $$, 'reordering works');
select is(public.shortlist_get(pg_temp.v('listA')) -> 'items' -> 0 ->> 'visible', 'true', 'shortlist entries show while visible');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.shortlist_get(pg_temp.v('listA')) $$, 'P0002', null, 'another organisation can''t read the list');
select throws_ok($$ select public.notes_for(pg_temp.v('s1')) $$, 'P0002', null, 'or the notes');

-- Turning recruiter visibility off removes the student at once and hides their entries.
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.profiles set recruiter_visible = false where user_id = pg_temp.v('s1') $$, 'a student turns recruiter visibility off');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is((public.search_talent('{"skills":[{"skill":"react","min_level":2}]}') ->> 'total')::integer, 1, 'they vanish from search');
select throws_ok($$ select public.recruit_candidate(pg_temp.v('s1')) $$, 'P0002', null, 'their profile can''t be opened');
select throws_ok($$ select public.notes_for(pg_temp.v('s1')) $$, 'P0002', null, 'notes are unreachable while they''re hidden');
select ok((select bool_or(i ->> 'visible' = 'false' and i ->> 'name' is null and i ->> 'student_id' is null)
             from jsonb_array_elements(public.shortlist_get(pg_temp.v('listA')) -> 'items') i), 'the shortlist shows "no longer visible" with no name or link');
reset role;
select is((select count(*)::integer from public.recruiter_notes where student_id = pg_temp.v('s1')), 1, 'the note is kept');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.profiles set recruiter_visible = true where user_id = pg_temp.v('s1') $$, 'they turn it back on');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is(jsonb_array_length(public.notes_for(pg_temp.v('s1'))), 1, 'the note is reachable again');

-- A student blocks a company.
select pg_temp.as_user('95000000-0000-0000-0000-00000000000d');
select lives_ok($$ select public.block_company(pg_temp.v('orgA')) $$, 'a student blocks a company');
select is(jsonb_array_length(public.my_blocked_companies()), 1, 'and sees it in the list');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is((public.search_talent('{}') ->> 'total')::integer, 2, 'the blocked company no longer finds them');
select throws_ok($$ select public.recruit_candidate(pg_temp.v('s4')) $$, 'P0002', null, 'or opens them');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000d');
select lives_ok($$ select public.unblock_company(pg_temp.v('orgA')) $$, 'they unblock');

-- ---------------------------------------------------------------------------
-- Contact requests
-- ---------------------------------------------------------------------------
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.send_contact_request(pg_temp.v('s1'), 'Intern', 'too short') $$, '22023', null, 'the message needs 50 characters');
select throws_ok($$ select public.send_contact_request(pg_temp.v('s1'), '', repeat('x', 60)) $$, '22023', null, 'and a named role');
select throws_ok($$ select public.send_contact_request(pg_temp.v('s3'), 'Intern', repeat('x', 60)) $$, 'P0002', null, 'a hidden student can''t be contacted');
select lives_ok($$ select pg_temp.remember('req1', public.send_contact_request(pg_temp.v('s1'), 'React intern', 'We are hiring a React intern for the summer and your verified work caught our eye.')) $$,
  'a contact request is sent');
select throws_ok($$ select public.send_contact_request(pg_temp.v('s1'), 'React intern', 'We are hiring a React intern for the summer and your verified work caught our eye.') $$,
  '55000', null, 'a second pending request to the same student is refused');
reset role;
select is((select sum(used)::integer from public.usage_counters where subject_id = pg_temp.v('orgA') and key = 'contact.credits'), 1, 'a request spends one credit');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.v('s1') and type = 'contact_request' and actor_id is null), 1,
  'the student is told, without naming the recruiter');

set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.respond_contact_request(pg_temp.v('req1'), true) $$, 'P0002', null, 'only the addressed student answers');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select is(jsonb_array_length(public.my_contact_requests()), 1, 'the student sees the request');
select is(public.my_contact_requests() -> 0 #>> '{org,name}', 'Acme Software', 'with the company that sent it');
select lives_ok($$ select public.respond_contact_request(pg_temp.v('req1'), false, 'Not looking right now') $$, 'the student declines');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.send_contact_request(pg_temp.v('s1'), 'React intern', 'We are hiring a React intern for the summer and your verified work caught our eye.') $$,
  '55000', null, 'a declined student can''t be re-contacted within 90 days');
reset role;
select is((select status::text from public.contact_requests where id = pg_temp.v('req1')), 'declined', 'the decline is recorded');
select is((select sum(used)::integer from public.usage_counters where subject_id = pg_temp.v('orgA') and key = 'contact.credits'), 1, 'and the credit isn''t refunded');
update public.contact_requests set decided_at = now() - interval '91 days' where id = pg_temp.v('req1');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.remember('req2', public.send_contact_request(pg_temp.v('s1'), 'React intern', 'Following up with a clearer offer: a paid three-month React internship with mentoring.')) $$,
  'after 90 days they can be contacted again');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok($$ select pg_temp.remember('thread1', public.respond_contact_request(pg_temp.v('req2'), true)) $$, 'the student accepts');
select is((select org_id from public.chat_threads where id = pg_temp.v('thread1')), pg_temp.v('orgA'), 'the chat is labelled with the company');
select is((select count(*)::integer from public.chat_messages where thread_id = pg_temp.v('thread1')), 1, 'the recruiter''s message opens it');
select ok((select title like '% · Acme Software' from public.my_threads() where id = pg_temp.v('thread1')), 'the student sees the company in the thread title');
select lives_ok($$ select public.close_contact_chat(pg_temp.v('req2')) $$, 'the student closes the conversation');
select is((select count(*)::integer from public.my_threads() where id = pg_temp.v('thread1')), 0, 'it leaves their list');
select throws_ok($$ select public.send_message(pg_temp.v('thread1'), 'hello') $$, '42501', null, 'and nobody can write to it');
reset role;

-- Expiry, the daily cap and the spam review.
insert into public.contact_requests (org_id, recruiter_id, student_id, role_title, message, created_at, expires_at)
values (pg_temp.v('orgB'), '95000000-0000-0000-0000-0000000000a2', pg_temp.v('s2'), 'Intern', repeat('y', 60), now() - interval '20 days', now() - interval '6 days');
select is(private.expire_contact_requests(), 1, 'requests expire after 14 days');
select is((select status::text from public.contact_requests where org_id = pg_temp.v('orgB') and student_id = pg_temp.v('s2')), 'expired', 'and are marked expired');
select pg_temp.grants(jsonb_build_object('talent.full_profile', jsonb_build_array(pg_temp.v('orgA'), pg_temp.v('orgB')),
  'saved_searches', jsonb_build_array(pg_temp.v('orgA')), 'analytics', jsonb_build_array(pg_temp.v('orgA')),
  'api.access', jsonb_build_array(pg_temp.v('orgA')), 'competitions.create', jsonb_build_array(pg_temp.v('orgA'))));
insert into public.platform_config (key, version, value, reason)
select 'recruit.limits', max(version) + 1, (private.config('recruit.limits') || '{"daily_contacts": 1}'::jsonb), 'pgTAP' from public.platform_config where key = 'recruit.limits';
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select public.send_contact_request(pg_temp.v('s2'), 'Intern', 'Hello again, we would like to talk about a summer internship at Rival Co in Karachi.') $$, 'a recruiter sends up to the daily cap');
select throws_ok($$ select public.send_contact_request(pg_temp.v('s4'), 'Intern', 'Hello again, we would like to talk about a summer internship at Rival Co in Karachi.') $$, '54000', null,
  'the daily cap refuses the next one');
reset role;
insert into public.contact_requests (org_id, recruiter_id, student_id, role_title, message, status, decided_at, created_at, expires_at)
select pg_temp.v('orgB'), '95000000-0000-0000-0000-0000000000a2', pg_temp.v('s1'), 'Intern ' || g, repeat('z', 60), 'declined', now() - interval '1 day', now() - interval '3 days' - (g || ' minutes')::interval, now() + interval '5 days'
  from generate_series(1, 12) g;
insert into public.contact_requests (org_id, recruiter_id, student_id, role_title, message, status, decided_at, created_at, expires_at)
select pg_temp.v('orgB'), '95000000-0000-0000-0000-0000000000a2', pg_temp.v('s3'), 'Intern', repeat('z', 60), 'declined', now() - interval '1 day', now() - interval '3 days', now() + interval '5 days'
 on conflict do nothing;
select is(private.check_org_spam(), 1, 'an organisation above 80% declines opens a spam review');
select is(private.check_org_spam(), 0, 'once');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.org_response_stats(pg_temp.v('orgB')) $$, '42501', null, 'response statistics are staff-only');
select throws_ok($$ select public.ops_spam_reviews('open') $$, '42501', null, 'so is the spam review queue');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000f5');
select ok((public.org_response_stats(pg_temp.v('orgB')) ->> 'decline_rate')::numeric > 0.8, 'staff see the decline rate');
select is(jsonb_array_length(public.ops_spam_reviews('open')), 1, 'and the open review');
select lives_ok($$ select public.ops_resolve_spam_review((public.ops_spam_reviews('open') -> 0 ->> 'id')::uuid, 'clear', 'Legitimate campaign') $$, 'staff clear it');
select lives_ok($$ select public.decide_org(pg_temp.v('orgB'), 'suspend', 'Testing suspension') $$, 'staff suspend an organisation');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.talent_explore('{}') $$, '42501', null, 'a suspended organisation loses access');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000f5');
select lives_ok($$ select public.decide_org(pg_temp.v('orgB'), 'reinstate', null) $$, 'and can be reinstated');
reset role;

-- ---------------------------------------------------------------------------
-- Members and invites
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.invite_org_member('x@gmail.com', 'recruiter', repeat('a', 64)) $$, '22023', null, 'invites can''t go to a public email domain');
select throws_ok($$ select public.invite_org_member('x@otherco.com', 'recruiter', repeat('a', 64)) $$, '22023', null, 'or another company''s domain');
select lives_ok($$ select pg_temp.remember('inv1', public.invite_org_member('R3@acmecorp.com', 'recruiter', repeat('a', 64))) $$, 'a teammate on the domain is invited');
reset role;
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.org_invites where id = pg_temp.v('inv1')), 'the invite expires after 7 days');
select is((select token_hash from public.org_invites where id = pg_temp.v('inv1')), repeat('a', 64), 'only a token hash is stored');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a3');
select is(jsonb_array_length(public.my_org_invites()), 1, 'the invitee sees it, matched by email');
select lives_ok($$ select public.accept_org_invite(pg_temp.v('inv1')) $$, 'and accepts');
select is(public.my_org() ->> 'name', 'Acme Software', 'the teammate is in the organisation');
select throws_ok($$ select public.org_members_list() $$, '42501', null, 'only admins see the member list');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.set_org_member_role('95000000-0000-0000-0000-0000000000a1', 'recruiter') $$, '55000', null, 'an organisation keeps at least one admin');
select lives_ok($$ select public.remove_org_member('95000000-0000-0000-0000-0000000000a3') $$, 'an admin removes a member');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.recruit_candidate(pg_temp.v('s1')) $$, '42501', null, 'a removed member has no access');

-- ---------------------------------------------------------------------------
-- Jobs, applications, hires
-- ---------------------------------------------------------------------------
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.save_job(null, jsonb_build_object('title', 'React intern', 'type', 'internship', 'location', 'Islamabad', 'deadline', (current_date + 30)::text,
  'description', repeat('d', 80))) $$, '22023', null, 'a job without a pay range is refused');
select throws_ok($$ select public.save_job(null, jsonb_build_object('title', 'React intern', 'type', 'internship', 'location', 'Islamabad', 'salary_min', 50000, 'salary_max', 40000,
  'deadline', (current_date + 30)::text, 'description', repeat('d', 80))) $$, '22023', null, 'a reversed pay range is refused');
select lives_ok($$ select pg_temp.remember('job1', public.save_job(null, jsonb_build_object('title', 'React intern', 'type', 'internship', 'location', 'Islamabad',
  'salary_min', 40000, 'salary_max', 60000, 'deadline', (current_date + 30)::text, 'description', repeat('d', 80),
  'min_skill_levels', '[{"skill":"react","min_level":2}]'::jsonb))) $$, 'a job with pay is saved as a draft');
select lives_ok($$ select public.publish_job(pg_temp.v('job1')) $$, 'and published into the free slot');
select lives_ok($$ select pg_temp.remember('job2', public.save_job(null, jsonb_build_object('title', 'Python engineer', 'type', 'full_time', 'remote', true,
  'salary_min', 150000, 'salary_max', 250000, 'deadline', (current_date + 30)::text, 'description', repeat('p', 80)))) $$, 'a second job is saved');
select throws_ok($$ select public.publish_job(pg_temp.v('job2')) $$, '55000', null, 'a second live job needs another slot');

select pg_temp.as_user('95000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.apply_to_job(pg_temp.v('job1'), 'Hello') $$, '55000', null, 'a student below the requirement can''t apply');
select ok((select jsonb_array_length(public.job_public(pg_temp.v('job1')) -> 'unmet') = 1), 'and is told what they''re missing');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok($$ select pg_temp.remember('app1', public.apply_to_job(pg_temp.v('job1'), 'I built a React dashboard for my society.')) $$, 'a qualified student applies in one step');
select throws_ok($$ select public.apply_to_job(pg_temp.v('job1')) $$, '23505', null, 'once');
select is((select count(*)::integer from public.opportunities('jobs')), 1, 'the job is on the Jobs tab');
select is((select count(*)::integer from public.opportunities('applications')), 1, 'and the application is tracked');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is(jsonb_array_length(public.job_applicants(pg_temp.v('job1')) -> 'applicants'), 1, 'the recruiter sees the applicant');
select is(public.recruit_candidate(pg_temp.v('s1')) ->> 'access', 'search', 'the applicant opens');
select throws_ok($$ select public.move_application(pg_temp.v('app1'), 'rejected') $$, '22023', null, 'a rejection needs a reason');
select lives_ok($$ select public.move_application(pg_temp.v('app1'), 'interview') $$, 'the recruiter moves the applicant forward');
select throws_ok($$ select public.move_application(pg_temp.v('app1'), 'screening') $$, '55000', null, 'but never backwards');
select lives_ok($$ select public.move_application(pg_temp.v('app1'), 'hired') $$, 'and hires them');
reset role;
select is((select kind from public.hires where application_id = pg_temp.v('app1')), 'intern', 'an internship records an intern hire');
select is((select fee_status from public.hires where application_id = pg_temp.v('app1')), 'invoiced', 'and the hiring fee is invoiced (phase 10)');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.v('s1') and type = 'application_stage'), 2, 'each stage change notifies the student');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select ok(public.application_get(pg_temp.v('app1')) ->> 'reason' is null and not (public.application_get(pg_temp.v('app1')) ? 'notes'), 'the student never sees private notes');
select is(jsonb_array_length(public.application_get(pg_temp.v('app1')) -> 'history'), 3, 'they see the stages and dates');

-- The 90-day question.
reset role;
update public.hires set hired_at = now() - interval '91 days' where application_id = pg_temp.v('app1');
select pg_temp.remember('hire1', (select id from public.hires where application_id = pg_temp.v('app1')));
select is(private.ask_hire_outcomes(), 1, 'after 90 days the recruiter gets one question');
select is(private.ask_hire_outcomes(), 0, 'only once');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.answer_hire_outcome(pg_temp.v('hire1'), 'yes') $$, 'the recruiter answers');
select throws_ok($$ select public.answer_hire_outcome(pg_temp.v('hire1'), 'maybe') $$, '22023', null, 'with one of four answers');

-- ---------------------------------------------------------------------------
-- API and webhooks
-- ---------------------------------------------------------------------------
select lives_ok($$ select pg_temp.remember('tok1', public.create_api_token('ATS', encode(sha256(convert_to('skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa', 'utf8')), 'hex'))) $$, 'an admin with the API entitlement creates a token');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.create_api_token('x', repeat('b', 64)) $$, '55000', null, 'an organisation without the entitlement can''t');
reset role;
select is((select count(*)::integer from public.api_tokens where token_hash = 'skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa'), 0, 'the token itself is never stored');
set local role anon;
select throws_ok($$ select public.api_candidate('not-a-real-token-at-all-0000', '95000000-0000-0000-0000-00000000000a') $$, '28000', null, 'an unknown token is refused');
reset role;
-- Sign a stand-in CV record for S1 so the API has something to return.
insert into public.signing_keys (key_id, public_key) values ('cv-20260101-abcdef01', repeat('B', 43)) on conflict do nothing;
insert into public.cv_records (user_id, code, version, snapshot, content_hash, snapshot_hash, signature, key_id, source, issued_at, expires_at)
values (pg_temp.v('s1'), '0123456789', 1, '{"schema":"skilient.cv/1"}', repeat('1', 64), repeat('2', 64), repeat('A', 86), (select key_id from public.signing_keys order by created_at limit 1), 'first',
        date_trunc('second', now()), date_trunc('second', now()) + interval '30 days');
set local role anon;
select is(public.api_candidate('skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa', pg_temp.v('s1')) ->> 'code', '0123456789', 'the API returns the signed CV of a student the organisation has a link with');
select throws_ok($$ select public.api_candidate('skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa', pg_temp.v('s2')) $$, 'P0002', null, 'but no one else (never a bulk export)');
select is(jsonb_array_length(public.api_job_applications('skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa', pg_temp.v('job1'))), 1, 'applications of a job are listed');
select is(jsonb_array_length(public.api_shortlists('skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa')), 1, 'shortlists are listed');
reset role;
select is((select count(*)::integer from public.api_tokens where last_used_at is not null), 1, 'use is recorded');
select lives_ok($$ update public.api_tokens set revoked_at = now() $$, 'revoking a token');
set local role anon;
select throws_ok($$ select public.api_shortlists('skl_pgtap_aaaaaaaaaaaaaaaaaaaaaaaa') $$, '28000', null, 'a revoked token stops working');
reset role;

set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.create_webhook('http://hooks.example.com/x', array['application.created']) $$, '22023', null, 'a webhook must use https');
select throws_ok($$ select public.create_webhook('https://10.0.0.1/x', array['application.created']) $$, '22023', null, 'and a host name, not an address');
select throws_ok($$ select public.create_webhook('https://hooks.example.com/x', array['something.else']) $$, '22023', null, 'and a known event');
select lives_ok($$ select pg_temp.remember('hook1', (public.create_webhook('https://hooks.example.com/x', array['application.created', 'contact.accepted']) ->> 'id')::uuid) $$, 'a webhook is created');
select ok(not (public.api_settings() -> 'webhooks' -> 0 ? 'secret'), 'its secret is shown once and not listed');
reset role;
select ok((select secret like 'whsec_%' from public.api_webhooks where id = pg_temp.v('hook1')), 'the worker can read the signing secret');
-- A new application queues a delivery.
update public.job_posts set status = 'closed' where id = pg_temp.v('job1');
update public.job_posts set status = 'live', published_at = now() where id = pg_temp.v('job2');
insert into public.user_skills (user_id, skill_id, level) values (pg_temp.v('s2'), 'java', 1) on conflict do nothing;
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.apply_to_job(pg_temp.v('job2')) $$, 'a student applies to the second job');
reset role;
select is((select count(*)::integer from public.api_webhook_deliveries where webhook_id = pg_temp.v('hook1') and event = 'application.created'), 1, 'the application queues a webhook delivery');
select is((select count(*)::integer from private.webhook_due(10)), 1, 'the worker claims it');
select lives_ok($$ select private.webhook_result((select id from public.api_webhook_deliveries limit 1), false, 500, 'boom') $$, 'a failure is recorded');
select is((select attempt from public.api_webhook_deliveries limit 1), 1, 'with one attempt counted');
select ok((select next_attempt_at > now() from public.api_webhook_deliveries limit 1), 'and a backoff before the next try');
select lives_ok($$ select private.webhook_result((select id from public.api_webhook_deliveries limit 1), true, 200, null) $$, 'a success is recorded');
select is((select status from public.api_webhook_deliveries limit 1), 'delivered', 'and marks it delivered');

-- ---------------------------------------------------------------------------
-- Analytics, competitions
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is((public.org_analytics(180) -> 'funnel' ->> 'hired')::integer, 1, 'analytics show the funnel to an entitled organisation');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a2');
select is((public.org_analytics(180) ->> 'locked')::boolean, true, 'and are locked for the rest');

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.save_competition(null, '{"title":"Build a thing","role":"Frontend","skills":[{"skill":"react","min_level":1}],"starts_on":"2030-01-01","ends_on":"2030-01-05",
  "prize":"PKR 100,000","brief":"x","rubric":[]}') $$, '22023', null, 'a competition runs 7 to 21 days');
select lives_ok($$ select pg_temp.remember('comp1', public.save_competition(null, jsonb_build_object('title', 'Build a dashboard', 'role', 'Frontend engineer',
  'skills', '[{"skill":"react","min_level":1}]'::jsonb, 'starts_on', (current_date + 3)::text, 'ends_on', (current_date + 12)::text, 'team_size', 2,
  'prize', 'PKR 100,000 and an interview', 'brief', repeat('Build a dashboard for our ops team. ', 6),
  'rubric', '[{"criterion":"Correctness","weight":60},{"criterion":"Design","weight":40}]'::jsonb))) $$, 'a competition brief is saved');
select lives_ok($$ select public.submit_competition(pg_temp.v('comp1')) $$, 'and sent for review');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000f5');
select throws_ok($$ select public.ops_review_competition(pg_temp.v('comp1'), false, null) $$, '22023', null, 'a rejection needs a reason');
select lives_ok($$ select public.ops_review_competition(pg_temp.v('comp1'), true, null) $$, 'an admin approves the brief');
reset role;
update public.competitions set starts_at = now() - interval '1 hour', ends_at = now() + interval '9 days' where id = pg_temp.v('comp1');
select private.competitions_tick();
select is((select status::text from public.competitions where id = pg_temp.v('comp1')), 'live', 'an approved competition goes live at its start');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok($$ select pg_temp.remember('team1', public.create_team(pg_temp.v('comp1'), 'Pixel Pushers')) $$, 'a student creates a team');
select lives_ok($$ select public.invite_team_member(pg_temp.v('team1'), 'rp_0b') $$, 'and invites a teammate');
select throws_ok($$ select public.invite_team_member(pg_temp.v('team1'), 'rp_0d') $$, '23514', null, 'a team holds at most the allowed size');
select lives_ok($$ select public.submit_repo(pg_temp.v('team1'), 'https://github.com/pixel/dash') $$, 'the lead submits a repository');
select throws_ok($$ select public.submit_repo(pg_temp.v('team1'), 'https://evil.example.com/pixel/dash') $$, '22023', null, 'only GitHub repositories are accepted');
reset role;
update public.competitions set ends_at = now() - interval '1 minute', starts_at = now() - interval '10 days' where id = pg_temp.v('comp1');
select private.competitions_tick();
select is((select status::text from public.competitions where id = pg_temp.v('comp1')), 'frozen', 'submissions freeze at the deadline');
select is((select count(*)::integer from private.competition_freeze_candidates()), 1, 'the freeze worker is offered the repository');
select private.competition_freeze_record((select id from public.competition_teams limit 1), repeat('a', 40), 'ok');
select is((select frozen_sha from public.competition_teams limit 1), repeat('a', 40), 'the latest commit is recorded');
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.submit_repo(pg_temp.v('team1'), 'https://github.com/pixel/other') $$, '55000', null, 'a frozen submission can''t change');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.score_team(pg_temp.v('team1'), '{"Correctness": 9, "Design": 8}') $$, 'the recruiter scores the entry');
select lives_ok($$ select public.finish_competition(pg_temp.v('comp1')) $$, 'and finishes the competition');
reset role;
select is((select kind from public.competition_awards where student_id = pg_temp.v('s1') and skill_id = 'react'), 'winner', 'the winner gets a winner badge');
select ok(exists (select 1 from private.l3_skills(pg_temp.v('s1')) where skill_id = 'react'), 'participants earn L3 evidence');

-- ---------------------------------------------------------------------------
-- The rest: every recruiter table denies direct reads
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select * from public.organizations $$, '42501', null, 'organisations are read through functions only');
select throws_ok($$ select * from public.contact_requests $$, '42501', null, 'contact requests too');
select throws_ok($$ select * from public.api_webhooks $$, '42501', null, 'webhook secrets can''t be read');
select throws_ok($$ select * from public.job_applications $$, '42501', null, 'applications too');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select ok((public.my_profile_viewers() ->> 'companies_30d')::integer >= 1, 'a student sees how many companies looked at them');
select is((public.my_profile_viewers() ->> 'names_visible')::boolean, false, 'but not their names without Pro');
reset role;

select finish();
rollback;
