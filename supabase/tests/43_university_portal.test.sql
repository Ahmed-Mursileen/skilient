-- University portal (PRD 5.22, 5.23; decisions.md 2026-10-04 "phase 9").
-- O1 claims NUTECH and becomes owner; A2 is an invited admin; C3 a coordinator; S1..S6 students;
-- ST accounts staff; MO a moderator; X1 an official at another university.
begin;
select * from no_plan();

create function pg_temp.as_user(p_id text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
-- What Ahmed does by SQL: give a claimed university a plan.
create function pg_temp.plan(p_uni uuid, p_plan text) returns void language sql as $$
  insert into public.platform_config (key, version, value, reason)
  select 'uni.test_plans', max(version) + 1,
         (select value from public.platform_config where key = 'uni.test_plans' order by version desc limit 1) || jsonb_build_object(p_uni::text, p_plan),
         'pgTAP' from public.platform_config where key = 'uni.test_plans';
$$;
create function pg_temp.letter(p_user uuid) returns text language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('university-claims', p_user::text || '/' || gen_random_uuid()::text || '.pdf', p_user::text,
          '{"mimetype": "application/pdf", "size": 1000}')
  returning name;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select pg_temp.remember('nutech', (select university_id from public.university_domains where domain = 'nutech.edu.pk' limit 1));
select pg_temp.remember('other', (select d.university_id from public.university_domains d
                                    where d.university_id <> pg_temp.v('nutech') and d.kind = 'both' and d.domain <> 'preston.edu.pk' order by d.domain limit 1));
select set_config('test.other_domain', (select domain from public.university_domains where university_id = pg_temp.v('other') order by domain limit 1), false);

insert into auth.users (id, email, raw_user_meta_data) values
  ('96000000-0000-0000-0000-0000000000a1', 'o1@nutech.edu.pk', jsonb_build_object('role', 'university_admin', 'full_name', 'Omar Owner', 'university_id', pg_temp.v('nutech'))),
  ('96000000-0000-0000-0000-0000000000a2', 'a2@nutech.edu.pk', jsonb_build_object('role', 'university_admin', 'full_name', 'Amna Admin', 'university_id', pg_temp.v('nutech'))),
  ('96000000-0000-0000-0000-0000000000a3', 'c3@nutech.edu.pk', jsonb_build_object('role', 'university_admin', 'full_name', 'Cyra Coordinator', 'university_id', pg_temp.v('nutech'))),
  ('96000000-0000-0000-0000-0000000000a9', 'x1@' || current_setting('test.other_domain'), jsonb_build_object('role', 'university_admin', 'full_name', 'Xavier Other', 'university_id', pg_temp.v('other'))),
  ('96000000-0000-0000-0000-000000000001', 's1@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-000000000002', 's2@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-000000000003', 's3@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-000000000004', 's4@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-000000000005', 's5@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-000000000006', 's6@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-0000000000f5', 'st96@nutech.edu.pk', '{}'),
  ('96000000-0000-0000-0000-0000000000f6', 'mo96@nutech.edu.pk', '{}');
update public.profiles set onboarding_complete = true, username = 'up_' || right(user_id::text, 2),
       department = case when right(user_id::text, 1) in ('1', '2', '3') then 'Computer Science' else 'Software Engineering' end,
       graduation_year = 2027
 where user_id::text like '96000000-%' and role = 'student';
insert into public.staff_roles (user_id, role) values
  ('96000000-0000-0000-0000-0000000000f5', 'accounts'), ('96000000-0000-0000-0000-0000000000f6', 'moderator');

-- ---------------------------------------------------------------------------
-- Signup and domains
-- ---------------------------------------------------------------------------
select is((select role::text || ':' || onboarding_complete::text || ':' || visibility::text from public.profiles
            where user_id = '96000000-0000-0000-0000-0000000000a1'), 'university_admin:true:friends',
  'a university official gets an official account, no onboarding, hidden from students');
select is(private.validate_signup('x@gmail.com', 'university_admin'), 'Use your university email.', 'officials can''t use webmail');
select throws_ok($$ insert into public.university_domains (university_id, domain, source) values (pg_temp.v('nutech'), 'gmail.com', 'ops') $$,
  '23514', null, 'a public email domain can never be a university domain');

-- ---------------------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$ select public.submit_uni_claim(jsonb_build_object('title', 'Registrar', 'path', 'x')) $$, '42501', null,
  'a claim needs two-factor');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select is(public.my_uni(), null, 'no portal before the claim is approved');
reset role;
select set_config('test.letter_o1', pg_temp.letter('96000000-0000-0000-0000-0000000000a1'), false);
select set_config('test.letter_a2', pg_temp.letter('96000000-0000-0000-0000-0000000000a2'), false);
set local role authenticated;
select lives_ok($$ select pg_temp.remember('claim', public.submit_uni_claim(jsonb_build_object('title', 'Registrar', 'path', current_setting('test.letter_o1')))) $$,
  'an official claims their university with a letter');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.submit_uni_claim(jsonb_build_object('title', 'Dean', 'path', current_setting('test.letter_a2'))) $$,
  '23505', null, 'one open claim per university');
select throws_ok($$ select public.decide_uni_claim(pg_temp.v('claim'), true, 'looks fine') $$, '42501', null, 'officials can''t approve claims');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000f5');
select lives_ok($$ select public.decide_uni_claim(pg_temp.v('claim'), true, 'Letter checked against the registrar page') $$,
  'accounts staff approve the claim');
select is((select owner_id from public.universities where id = pg_temp.v('nutech')), '96000000-0000-0000-0000-0000000000a1'::uuid,
  'the claimant becomes the owner');
select ok(exists (select 1 from public.ops_audit_log where action = 'uni.claim_approve' and target_id = pg_temp.v('nutech')::text),
  'the approval is audited');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.submit_uni_claim(jsonb_build_object('title', 'Dean', 'path', current_setting('test.letter_a2'))) $$,
  '55000', null, 'a claimed university refuses new claims');

-- ---------------------------------------------------------------------------
-- Plan stub and seats
-- ---------------------------------------------------------------------------
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select is(public.my_uni() ->> 'plan', 'free', 'a claimed university with no licence is free');
select is((public.my_uni() -> 'limits' ->> 'uni.admin_seats')::integer, 1, 'free: one seat (the owner)');
select throws_ok($$ select public.invite_uni_admin('a2@nutech.edu.pk', 'admin', null, repeat('a', 64)) $$, '55000', null,
  'a free university has no seat for a second admin');
reset role;
select pg_temp.plan(pg_temp.v('nutech'), 'basic');
set local role authenticated;
select is((public.my_uni() -> 'limits' ->> 'uni.admin_seats')::integer, 2, 'Basic: two seats');
select ok(not private.uni_entitled(pg_temp.v('nutech'), 'uni.unknown_key'), 'an unknown entitlement key is denied');
select ok(not private.uni_entitled(pg_temp.v('nutech'), 'uni.student_records'), 'Basic has no individual records');
select throws_ok($$ select public.invite_uni_admin('a2@gmail.com', 'admin', null, repeat('a', 64)) $$, '22023', null,
  'invites go to the university''s own domains');
select lives_ok($$ select pg_temp.remember('inv_a2', public.invite_uni_admin('a2@nutech.edu.pk', 'admin', null, repeat('b', 64))) $$,
  'the owner invites an admin');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select public.accept_uni_invite(pg_temp.v('inv_a2')) $$, 'the invitee accepts');
select is(public.my_uni() ->> 'role', 'admin', 'and is an admin now');
select pg_temp.as_user('96000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.uni_structure() $$, '42501', null, 'students have no portal');

-- Departments and coordinators
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.remember('cs', public.save_department(null, 'Computer Science')) $$, 'the owner adds a department');
select is((select count(*)::integer from public.profiles where department_id = pg_temp.v('cs')), 3,
  'existing profiles whose text matches are linked');
select is((select department from public.profiles where user_id = '96000000-0000-0000-0000-000000000001'), 'Computer Science',
  'the department text stays for leaderboard, Explore and recruiter filters');
-- Leaderboard, Explore and recruiter filters keep working on the department text (decisions.md 2026-10-04).
select pg_temp.as_user('96000000-0000-0000-0000-000000000004');
select ok((select count(*) from public.search_people('up', 'Computer Science', null, null, 0, null)) >= 1,
  'Explore still filters people by the linked department');
select lives_ok($$ select * from public.leaderboard('university', 'Computer Science', null, 0) $$, 'the leaderboard department filter still works');
reset role;
update public.profiles set recruiter_visible = true where user_id = '96000000-0000-0000-0000-000000000001';
select private.refresh_talent_index('96000000-0000-0000-0000-000000000001');
select ok(coalesce((select department = 'Computer Science' from public.talent_index where student_id = '96000000-0000-0000-0000-000000000001'), true),
  'the recruiter talent index keeps the department text');
select throws_ok($$ update public.profiles set department = 'Basket Weaving' where user_id = '96000000-0000-0000-0000-000000000001' $$,
  '22023', null, 'a student at a university with its own list must pick from it');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
reset role;
select pg_temp.plan(pg_temp.v('nutech'), 'growth');
set local role authenticated;
select lives_ok($$ select pg_temp.remember('inv_c3', public.invite_uni_admin('c3@nutech.edu.pk', 'coordinator', pg_temp.v('cs'), repeat('c', 64))) $$,
  'a coordinator is invited for one department');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a3');
select lives_ok($$ select public.accept_uni_invite(pg_temp.v('inv_c3')) $$, 'the coordinator accepts');

-- ---------------------------------------------------------------------------
-- Records: plan check, logging, coordinator scope, rate, viewers
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.plan(pg_temp.v('nutech'), 'basic');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.university_student_record('96000000-0000-0000-0000-000000000001') $$, '42501', null,
  'a Basic university gets no individual record, even by calling the function directly');
select throws_ok($$ select public.uni_students() $$, '42501', null, 'nor the student list');
select throws_ok($$ select private.university_student_record('96000000-0000-0000-0000-000000000001') $$, '42501', null,
  'nor through the private function');
reset role;
select is((select count(*)::integer from public.student_record_access_log), 0, 'a refused call writes no record view');
select pg_temp.plan(pg_temp.v('nutech'), 'growth');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1', 'aal1');
select throws_ok($$ select public.university_student_record('96000000-0000-0000-0000-000000000001') $$, '42501', null,
  'records need two-factor');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select ok(public.university_student_record('96000000-0000-0000-0000-000000000001') ? 'skills', 'Growth: the owner opens a record');
select ok(public.university_student_record('96000000-0000-0000-0000-000000000001') ? 'profile', 'and opens it again');
select ok(not (public.university_student_record('96000000-0000-0000-0000-000000000001') ?| array['chat', 'messages', 'notes', 'contacts', 'cv_views']),
  'a record never carries chat, recruiter notes, contacts or CV views');
reset role;
select is((select count(*)::integer from public.student_record_access_log where student_id = '96000000-0000-0000-0000-000000000001'), 3,
  'every record view is logged, one row per opening');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a3');
select ok(public.university_student_record('96000000-0000-0000-0000-000000000002') ? 'profile', 'a coordinator opens a student of their department');
select throws_ok($$ select public.university_student_record('96000000-0000-0000-0000-000000000004') $$, 'P0002', null,
  'but not one of another department');
select throws_ok($$ select public.university_student_record('96000000-0000-0000-0000-0000000000a1') $$, 'P0002', null,
  'and never a non-student');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a9');
select throws_ok($$ select public.university_student_record('96000000-0000-0000-0000-000000000001') $$, '42501', null,
  'an official of another university gets nothing');
select pg_temp.as_user('96000000-0000-0000-0000-000000000001');
select is(public.my_record_viewers() ->> 'locked', 'true', 'a student without Pro sees no viewer list');
reset role;
insert into public.platform_config (key, version, value, reason)
select 'entitlements.test_grants', max(version) + 1,
       (select value from public.platform_config where key = 'entitlements.test_grants' order by version desc limit 1)
         || '{"privacy.record_viewers": ["96000000-0000-0000-0000-000000000001"]}'::jsonb, 'pgTAP'
  from public.platform_config where key = 'entitlements.test_grants';
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(public.my_record_viewers() -> 'items'), 3, 'a Pro student sees every view of their record');
select is(public.my_record_viewers() -> 'items' -> 0 ->> 'name', 'Omar Owner', 'with the viewer''s name');
reset role;
-- 100 an hour per admin: the 101st open is refused.
delete from private.rate_limit_events where key like 'uni_record:%';
insert into private.rate_limit_events (key) select 'uni_record:96000000-0000-0000-0000-0000000000a2' from generate_series(1, 100);
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.university_student_record('96000000-0000-0000-0000-000000000001') $$, '54000', null,
  'record opens are limited to 100 an hour per admin');

-- ---------------------------------------------------------------------------
-- Ecosphere: contrast, slugs, questions, awards
-- ---------------------------------------------------------------------------
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.save_branding('{"primary": {"light": "#f5f5f5", "dark": "#ffffff"}}') $$, '23514', null,
  'a colour failing contrast is refused');
select throws_ok($$ select public.save_branding('{"primary": {"light": "#1a1a1a", "dark": "#111111"}}') $$, '23514', null,
  'each theme is checked against its own page');
select lives_ok($$ select public.save_branding('{"primary": {"light": "#1f4e79", "dark": "#9cc7ff"}, "welcome": "Welcome to NUTECH"}') $$,
  'colours passing 4.5:1 in both themes are kept');
select ok(private.contrast_ratio('#000000', '#ffffff') between 20.99 and 21.01, 'the WCAG formula gives 21:1 for black on white');
select lives_ok($$ select public.uni_change_slug('nutech-isb') $$, 'the slug changes');
select throws_ok($$ select public.uni_change_slug('nutech-two') $$, '55000', null, 'once every 30 days');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a9');
reset role;
update public.universities set slug_changed_at = null where id = pg_temp.v('other');
insert into public.university_admins (user_id, university_id, role) values ('96000000-0000-0000-0000-0000000000a9', pg_temp.v('other'), 'owner');
select set_config('test.old_slug', (select slug from public.university_slug_history where university_id = pg_temp.v('nutech') limit 1), false);
set local role authenticated;
select throws_ok($$ select public.uni_change_slug(current_setting('test.old_slug')) $$,
  '23505', null, 'an old slug stays reserved for 90 days');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.save_uni_question('Which religion do you follow?', '["A", "B"]') $$, '23514', null,
  'questions on religion are refused');
select throws_ok($$ select public.save_uni_question('What is your family income?', '["Low", "High"]') $$, '23514', null,
  'questions on income are refused');
select throws_ok($$ select public.save_uni_question('Pick a society', '["A", "B", "C", "D", "E", "F", "G"]') $$, '22023', null,
  'up to 6 options');
select lives_ok($$ select pg_temp.remember('q1', public.save_uni_question('Which society are you in?', '["Robotics", "Debating", "None"]')) $$,
  'a multiple-choice question is saved');
select pg_temp.as_user('96000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.answer_uni_question(pg_temp.v('q1'), 0) $$, 'a student answers');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select is(public.uni_questions() -> 0 -> 'counts' -> 0, 'null'::jsonb, 'a count under 5 is hidden');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000f5');
select lives_ok($$ select public.ops_remove_uni_question(pg_temp.v('q1'), 'Not allowed here') $$, 'staff remove a question');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.remember('badge', public.save_badge(null, '{"name": "Dean''s Innovation Award", "icon": "trophy"}')) $$,
  'the owner defines an award');
select lives_ok($$ select public.award_badge(pg_temp.v('badge'), 'up_01', 'Best FYP') $$, 'and grants it by username');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.award_badge(pg_temp.v('badge'), 'up_04', null) $$, '42501', null,
  'a coordinator awards only their department');
reset role;
select ok(private.cv_snapshot('96000000-0000-0000-0000-000000000001') -> 'awards' -> 0 ->> 'name' = 'Dean''s Innovation Award',
  'the award goes into the next CV snapshot');
select ok(not exists (select 1 from pg_proc where proname like 'score_%' and pronamespace = 'private'::regnamespace
                        and prosrc like '%badge_awards%'), 'no ranking function reads awards');

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.uni_add_exam_period('2027-01-01', '2027-02-14', 'Fall finals') $$, 'an admin adds an exam period');
select lives_ok($$ select public.uni_add_exam_period('2027-05-01', '2027-06-14', 'Spring finals') $$, 'and another');
select throws_ok($$ select public.uni_add_exam_period('2027-09-01', '2027-09-10', 'Mid terms') $$, '23514', null,
  'at most 90 exam days in a calendar year');

-- ---------------------------------------------------------------------------
-- Announcements and moderation hide
-- ---------------------------------------------------------------------------
select lives_ok($$ select pg_temp.remember('ann', public.uni_post_announcement(jsonb_build_object('body', 'CS orientation on Monday', 'departments', jsonb_build_array(pg_temp.v('cs'))))) $$,
  'an announcement targets a department');
select pg_temp.as_user('96000000-0000-0000-0000-000000000001');
select ok(private.can_view_post(pg_temp.v('ann')), 'a targeted student sees it');
select pg_temp.as_user('96000000-0000-0000-0000-000000000004');
select ok(not private.can_view_post(pg_temp.v('ann')), 'a student outside the target doesn''t');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.uni_post_announcement('{"body": "two"}') $$, 'a second announcement today');
select lives_ok($$ select public.uni_post_announcement('{"body": "three"}') $$, 'a third');
select throws_ok($$ select public.uni_post_announcement('{"body": "four"}') $$, '54000', null, 'at most 3 a day per university');

reset role;
insert into public.posts (id, author_id, university_id, audience, type, body)
values ('96000000-0000-0000-0000-00000000aaaa', '96000000-0000-0000-0000-000000000004', pg_temp.v('nutech'), 'university', 'general', 'Spam spam');
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.uni_hide('post', '96000000-0000-0000-0000-00000000aaaa', 'Spam') $$, '42501', null,
  'coordinators can''t hide content');
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.uni_hide('post', '96000000-0000-0000-0000-00000000aaaa', 'Spam in the feed') $$, 'the owner hides a post');
select pg_temp.as_user('96000000-0000-0000-0000-000000000002');
select ok(not private.can_view_post('96000000-0000-0000-0000-00000000aaaa'), 'a hidden post is gone for others');
select pg_temp.as_user('96000000-0000-0000-0000-000000000004');
select ok(private.can_view_post('96000000-0000-0000-0000-00000000aaaa'), 'its author still sees it');
reset role;
select ok(exists (select 1 from public.report_cases where target_id = '96000000-0000-0000-0000-00000000aaaa' and status = 'open'),
  'hidden content reaches the Skilient queue');
select ok(exists (select 1 from public.notifications where user_id = '96000000-0000-0000-0000-000000000004' and type = 'content_hidden_by_university'
                    and data ->> 'reason' = 'Spam in the feed'), 'the author is told it was hidden and why');
update public.report_cases set status = 'dismissed', resolved_at = now(), resolved_by = '96000000-0000-0000-0000-0000000000f6'
 where target_id = '96000000-0000-0000-0000-00000000aaaa';
select is((select status::text from public.university_hides where target_id = '96000000-0000-0000-0000-00000000aaaa'), 'restored',
  'dismissing the case restores it, and the reversal is kept');
select is((select hidden_by_university_at from public.posts where id = '96000000-0000-0000-0000-00000000aaaa'), null,
  'the post is visible again');

-- ---------------------------------------------------------------------------
-- Events: capacity and check-in
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.remember('ev', public.save_event(null, jsonb_build_object('type', 'talk', 'title', 'Career talk', 'location', 'Hall A',
  'starts_at', now() + interval '1 hour', 'ends_at', now() + interval '3 hours', 'capacity', 1))) $$, 'an admin creates an event');
select pg_temp.as_user('96000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.rsvp_event(pg_temp.v('ev')) $$, 'a student RSVPs');
select pg_temp.as_user('96000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.rsvp_event(pg_temp.v('ev')) $$, '23514', null, 'capacity is enforced');
select throws_ok($$ select public.check_in_event(pg_temp.v('ev'), 'wrong') $$, '22023', null, 'a wrong code is refused');
reset role;
select set_config('test.code', private.event_code(pg_temp.v('ev'), floor(extract(epoch from now()) / 30)::bigint), false);
set local role authenticated;
select pg_temp.as_user('96000000-0000-0000-0000-000000000001');
select is(public.check_in_event(pg_temp.v('ev'), current_setting('test.code')), 'checked_in',
  'the current code checks a registered student in');

select * from finish();
rollback;
