-- Teacher portal (PRD 5.21). T1 and T2 are faculty at NUTECH, F is faculty whose email is on the
-- CSV, A owns a venture with B and C, D is another NUTECH student, S is accounts staff (aal2).
begin;
select plan(96);

insert into auth.users (id, email, raw_user_meta_data) values
  ('94000000-0000-0000-0000-0000000000a1', 't1@nutech.edu.pk', '{"role":"faculty","full_name":"Dr One"}'),
  ('94000000-0000-0000-0000-0000000000a2', 't2@nutech.edu.pk', '{"role":"faculty","full_name":"Dr Two"}'),
  ('94000000-0000-0000-0000-0000000000a3', 'f@nutech.edu.pk', '{"role":"faculty","full_name":"Dr Csv"}'),
  ('94000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk', '{}'),
  ('94000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk', '{}'),
  ('94000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk', '{}'),
  ('94000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk', '{}'),
  ('94000000-0000-0000-0000-00000000000e', 'e@nu.edu.pk', '{}'),
  ('94000000-0000-0000-0000-0000000000f5', 's@nutech.edu.pk', '{}');
update public.profiles set onboarding_complete = true, username = 'tp_' || right(user_id::text, 2)
 where user_id::text like '94000000-%' and role = 'student';
insert into public.staff_roles (user_id, role) values ('94000000-0000-0000-0000-0000000000f5', 'accounts');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Faculty accounts and verification
-- ---------------------------------------------------------------------------
select is((select role::text from public.profiles where user_id = '94000000-0000-0000-0000-0000000000a1'), 'faculty',
  'a faculty signup creates a faculty profile');
select ok((select onboarding_complete from public.profiles where user_id = '94000000-0000-0000-0000-0000000000a1'),
  'faculty skip the student onboarding');
select is(private.validate_signup('x@nutech.edu.pk', 'recruiter'), 'This kind of account can''t sign up here yet.',
  'recruiters still can''t sign up here');
select is(private.validate_signup('x@gmail.com', 'faculty'), 'Use your university email.', 'faculty need a university email too');

set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.request_teacher_role('CS', 'Lecturer') $$, '42501', null, 'a student can''t ask for the teacher role');
select throws_ok($$ select public.teacher_home() $$, '42501', null, 'an unapproved account has no teacher home');

select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.save_idea(null, '{}') $$, '42501', null, 'a faculty account without approval can''t post ideas');
select is(public.request_teacher_role('Computer Science', 'Lecturer'), 'pending', 'faculty ask for the teacher role');
select throws_ok($$ select public.teacher_home() $$, '42501', null, 'a pending teacher still gets student permissions only');
select throws_ok($$ select public.approve_teacher('94000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'nobody approves themselves');

select pg_temp.as_user('94000000-0000-0000-0000-0000000000f5', 'aal1');
select throws_ok($$ select public.approve_teacher('94000000-0000-0000-0000-0000000000a1') $$, '42501', null,
  'accounts staff without two-factor can''t approve');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000f5', 'aal2');
select is(jsonb_array_length(public.teacher_requests('pending')), 1, 'staff see the pending request');
select lives_ok($$ select public.approve_teacher('94000000-0000-0000-0000-0000000000a1') $$, 'accounts staff approve a teacher');

-- CSV pre-approval: the matching email is approved on asking, even one that asked before the import.
select lives_ok($$ select public.import_faculty_csv((select id from public.universities where slug = (select slug from public.universities u
   join public.profiles p on p.university_id = u.id where p.user_id = '94000000-0000-0000-0000-0000000000a1')),
   '[{"email":"F@nutech.edu.pk","department":"Math","title":"Professor"},{"email":"t2@nutech.edu.pk"}]') $$,
  'staff import a faculty CSV');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a3');
select is(public.request_teacher_role('Mathematics', 'Professor'), 'approved', 'a CSV email is approved on asking');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.import_faculty_csv((select university_id from public.profiles where user_id = '94000000-0000-0000-0000-00000000000a'), '[{"email":"x@y.pk"}]') $$,
  '42501', null, 'a student can''t import a faculty list');

select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select is(public.request_teacher_role('Software Engineering', 'Assistant Professor'), 'approved', 'the import also covers a second email');

-- ---------------------------------------------------------------------------
-- Ideas
-- ---------------------------------------------------------------------------
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select pg_temp.remember('idea', public.save_idea(null, jsonb_build_object(
  'title', 'Campus bus tracker', 'brief', 'Track the shuttle live.', 'skills', jsonb_build_array('react', 'nodejs'),
  'difficulty', 'intermediate', 'team_size', 3, 'duration_weeks', 8, 'deliverables', 'A web app and a demo', 'max_teams', 1,
  'audience', 'university')));
select is(jsonb_array_length(public.ideas_list(true)), 1, 'the teacher lists their idea');
select throws_ok($$ select public.save_idea(null, '{"title":"x"}') $$, '22023', null, 'an incomplete idea is refused');

select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select is(jsonb_array_length(public.ideas_list(false)), 1, 'a student at the university sees the open idea');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000e');
select is(jsonb_array_length(public.ideas_list(false)), 0, 'a student elsewhere does not see a university-only idea');

select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select pg_temp.remember('v1', public.start_venture_from_idea(pg_temp.v('idea'), jsonb_build_object(
  'title', 'Campus bus tracker', 'description', 'From the idea', 'skill_ids', jsonb_build_array('react', 'nodejs'))));
select is((select idea_id from public.ventures where id = pg_temp.v('v1')), pg_temp.v('idea'), 'the venture is linked to the idea');
select is((select status::text from public.venture_supervisors where venture_id = pg_temp.v('v1')), 'invited',
  'the idea''s teacher is invited to supervise');
select throws_ok($$ select public.start_venture_from_idea(pg_temp.v('idea'), jsonb_build_object('title','Second','description','d')) $$,
  '55000', null, 'the idea closes at its team limit');
select throws_ok($$ select public.start_venture_from_idea('94000000-0000-0000-0000-000000000000', '{}') $$, 'P0002', null, 'an unknown idea is refused');

select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ select public.save_idea('%s', jsonb_build_object('title', 'Renamed', 'brief', 'Track the shuttle live.',
  'skills', jsonb_build_array('react', 'nodejs'), 'difficulty', 'intermediate', 'team_size', 3, 'duration_weeks', 8,
  'deliverables', 'A web app and a demo', 'max_teams', 1)) $$, pg_temp.v('idea')),
  '55000', null, 'once a team started, the title is locked');
select is(jsonb_array_length(public.idea_get(pg_temp.v('idea')) -> 'ventures'), 1, 'the teacher sees the team that started');

-- ---------------------------------------------------------------------------
-- Supervision
-- ---------------------------------------------------------------------------
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
reset role;
insert into public.venture_members (venture_id, user_id) values
  (pg_temp.v('v1'), '94000000-0000-0000-0000-00000000000b'),
  (pg_temp.v('v1'), '94000000-0000-0000-0000-00000000000c');
update public.ventures set status = 'in_progress', visibility = 'unlisted' where id = pg_temp.v('v1');
set local role authenticated;

select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select is((select count(*)::integer from public.ventures where id = pg_temp.v('v1')), 0, 'a teacher who does not supervise can''t read an unlisted venture');
select throws_ok($$ select public.respond_supervision(pg_temp.v('v1'), true) $$, 'P0002', null, 'only the invited teacher can answer');

select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select is((select count(*)::integer from public.ventures where id = pg_temp.v('v1')), 0, 'an invited teacher can''t read it before accepting');
select lives_ok($$ select public.respond_supervision(pg_temp.v('v1'), true) $$, 'the teacher accepts supervision');
select is((select count(*)::integer from public.ventures where id = pg_temp.v('v1')), 1, 'a supervisor reads the unlisted venture');
select is(public.supervision_for(pg_temp.v('v1')) ->> 'status', 'active', 'the venture shows its active supervisor');

select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select public.invite_supervisor('%s', '94000000-0000-0000-0000-0000000000a2') $$, pg_temp.v('v1')),
  '23505', null, 'one supervisor per venture');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000d');
select throws_ok(format($$ select public.invite_supervisor('%s', '94000000-0000-0000-0000-0000000000a2') $$, pg_temp.v('v1')),
  '42501', null, 'only the owner invites a supervisor');

-- The supervisor cap holds (lowered to 1 for the test).
reset role;
insert into public.platform_config (key, version, value, reason)
select 'teacher.limits', 2, private.config('teacher.limits') || '{"supervisions_max": 1, "endorsements_per_month": 2}'::jsonb, 'test limits';
set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-00000000000d');
select pg_temp.remember('v2', public.create_venture('{"type":"project","title":"Second","description":"d","skill_ids":["react"]}'));
select lives_ok(format($$ select public.invite_supervisor('%s', '94000000-0000-0000-0000-0000000000a1') $$, pg_temp.v('v2')),
  'the owner invites a teacher who is already supervising');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.respond_supervision(pg_temp.v('v2'), true) $$, '23514', null, 'a teacher can''t exceed the supervision cap');
select lives_ok($$ select public.respond_supervision(pg_temp.v('v2'), false) $$, 'declining is always allowed');

-- Thread and confirmations
select lives_ok($$ select public.post_supervisor_comment(pg_temp.v('v1'), 'Please add tests.') $$, 'the supervisor comments');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.post_supervisor_comment(pg_temp.v('v1'), 'Will do.') $$, 'a member answers in the thread');
select is(jsonb_array_length(public.supervisor_thread(pg_temp.v('v1')) -> 'comments'), 2, 'members read the thread');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000d');
select is(public.supervisor_thread(pg_temp.v('v1')), null, 'outsiders get no thread');
select throws_ok($$ select public.post_supervisor_comment(pg_temp.v('v1'), 'hi') $$, '42501', null, 'outsiders can''t post in it');
select is((select count(*)::integer from public.supervisor_comments), 0, 'the thread table is closed to outsiders');

select pg_temp.as_user('94000000-0000-0000-0000-00000000000b');
select pg_temp.remember('b_entry', public.log_contribution(pg_temp.v('v1'), 'code', 'Built the map view', null, null, array['react']));
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.supervisor_confirm_contribution(pg_temp.v('b_entry')) $$, 'P0002', null, 'only the supervisor confirms entries');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select ok(public.supervisor_confirm_contribution(pg_temp.v('b_entry')), 'the supervisor confirms an entry');
select ok((select faculty_confirmed and peer_verified from public.contributions_with_status where id = pg_temp.v('b_entry')),
  'it is faculty-confirmed and counts as peer-verified');

-- ---------------------------------------------------------------------------
-- Reviews and the CV
-- ---------------------------------------------------------------------------
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select pg_temp.remember('rr', public.request_review(pg_temp.v('v1'), '94000000-0000-0000-0000-0000000000a2'));
select throws_ok(format($$ select public.request_review('%s', '94000000-0000-0000-0000-0000000000a2') $$, pg_temp.v('v1')),
  '23505', null, 'one open request per teacher per venture');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select is((select count(*)::integer from public.ventures where id = pg_temp.v('v1')), 1, 'an open review request opens the venture to the teacher');
select throws_ok($$ select public.submit_review(pg_temp.v('rr'), '{"scope":{"score":5,"comment":"ok fine"}}') $$, '22023', null, 'every rubric part is required');
select lives_ok($$ select public.submit_review(pg_temp.v('rr'), jsonb_build_object(
  'scope', jsonb_build_object('score', 4, 'comment', 'Clear scope'), 'technical', jsonb_build_object('score', 5, 'comment', 'Clean code'),
  'collaboration', jsonb_build_object('score', 3, 'comment', 'Some gaps'), 'documentation', jsonb_build_object('score', 4, 'comment', 'Good readme'),
  'outcome', jsonb_build_object('score', 4, 'comment', 'Shipped')), 'Nice work') $$, 'the teacher submits a review');
select is((select count(*)::integer from public.ventures where id = pg_temp.v('v1')), 0, 'the venture closes to the teacher again');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000b');
select is((public.venture_reviews_for(pg_temp.v('v1')) -> 0 ->> 'average')::numeric, 4.00, 'members see the scores');
reset role;
update public.ventures set visibility = 'public' where id = pg_temp.v('v1');
set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-00000000000e');
select is(public.venture_reviews_for(pg_temp.v('v1')) -> 0 ->> 'average', null, 'outsiders see that faculty reviewed, not the scores');
reset role;
select ok((private.cv_snapshot('94000000-0000-0000-0000-00000000000b') -> 'projects' -> 0 ->> 'faculty_reviewed')::boolean,
  'the CV project carries the faculty badge');
select is(private.cv_snapshot('94000000-0000-0000-0000-00000000000b')::text ~ 'average|"score"', false, 'the CV snapshot carries no review score');
select is((private.cv_snapshot('94000000-0000-0000-0000-00000000000b') -> 'projects' -> 0 ->> 'faculty_confirmed')::integer, 1,
  'it counts the faculty-confirmed entry');

-- ---------------------------------------------------------------------------
-- Teacher endorsements
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a3');
select throws_ok(format($$ select public.teacher_endorse('94000000-0000-0000-0000-00000000000b', '%s', '[{"skill":"react"}]') $$, pg_temp.v('v1')),
  '42501', null, 'a teacher can''t endorse outside reviewed or supervised ventures');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.teacher_endorse('94000000-0000-0000-0000-00000000000b', '%s', '[{"skill":"python"}]') $$, pg_temp.v('v1')),
  '22023', null, 'only skills tagged in the venture');
select throws_ok(format($$ select public.teacher_endorse('94000000-0000-0000-0000-00000000000d', '%s', '[{"skill":"react"}]') $$, pg_temp.v('v1')),
  'P0002', null, 'only members of the venture');
select is(public.teacher_endorse('94000000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  jsonb_build_array(jsonb_build_object('skill', 'react', 'evidence', pg_temp.v('b_entry'))), 'Good'), 1, 'a reviewer endorses a member');
select throws_ok(format($$ select public.teacher_endorse('94000000-0000-0000-0000-00000000000c', '%s', '[{"skill":"react"},{"skill":"nodejs"},{"skill":"react"}]') $$, pg_temp.v('v1')),
  '22023', null, 'each skill once');
select lives_ok(format($$ select public.teacher_endorse('94000000-0000-0000-0000-00000000000c', '%s', '[{"skill":"react"}]') $$, pg_temp.v('v1')),
  'a second student');
select throws_ok(format($$ select public.teacher_endorse('94000000-0000-0000-0000-00000000000c', '%s', '[{"skill":"nodejs"}]') $$, pg_temp.v('v1')),
  '23514', null, 'the monthly limit holds');
reset role;
select is((select kind from (select 'teacher'::text as kind from public.endorsements where endorser_kind = 'teacher' limit 1) x), 'teacher',
  'teacher endorsements are marked');
select is((private.score_endorsements('94000000-0000-0000-0000-00000000000b', (select value from private.ranking_formula())) -> 'items' -> 0 ->> 'weight')::numeric, 1.5,
  'a teacher endorsement weighs 1.5');
select ok(exists (select 1 from private.l4_skills('94000000-0000-0000-0000-00000000000b') where skill_id = 'react'),
  'one evidence-tied teacher endorsement reaches L4 alone');
select ok((private.compute_ranking('94000000-0000-0000-0000-00000000000b') -> 'facts' ->> 'teacher_endorsement')::boolean,
  'it is the external signal for Luminary');

-- ---------------------------------------------------------------------------
-- Code-check grading
-- ---------------------------------------------------------------------------
insert into public.code_checks (id, user_id, skill_id, status, submitted_at)
values ('94000000-0000-0000-0000-0000000000c1', '94000000-0000-0000-0000-00000000000d', 'react', 'in_progress', null);
update public.code_checks set status = 'submitted', submitted_at = now() where id = '94000000-0000-0000-0000-0000000000c1';
select isnt((select routed_to_staff_at from public.code_checks where id = '94000000-0000-0000-0000-0000000000c1'), null,
  'with no opted-in teacher the check goes straight to Skilient reviewers');
insert into public.teacher_settings (user_id, grading_opt_in, weekly_grading_cap, grading_skills) values
  ('94000000-0000-0000-0000-0000000000a1', true, 1, '{react}'),
  ('94000000-0000-0000-0000-0000000000a2', true, 1, '{react}'),
  ('94000000-0000-0000-0000-0000000000a3', true, 5, '{python}');
insert into public.code_checks (id, user_id, skill_id, status, submitted_at) values
  ('94000000-0000-0000-0000-0000000000c2', '94000000-0000-0000-0000-00000000000b', 'react', 'in_progress', null),
  ('94000000-0000-0000-0000-0000000000c3', '94000000-0000-0000-0000-00000000000c', 'react', 'in_progress', null);
update public.code_checks set status = 'submitted', submitted_at = now() where id in
  ('94000000-0000-0000-0000-0000000000c2', '94000000-0000-0000-0000-0000000000c3');
select throws_ok($$ update public.code_checks set claimed_by = '94000000-0000-0000-0000-0000000000f5' where id = '94000000-0000-0000-0000-0000000000c2' $$,
  '55000', null, 'Skilient reviewers can''t take a check that is still with the teachers');
select is((select routed_to_staff_at from public.code_checks where id = '94000000-0000-0000-0000-0000000000c2'), null,
  'with an opted-in teacher the check waits for the university''s teachers');
select is((select due_at > now() + interval '71 hours' from public.code_checks where id = '94000000-0000-0000-0000-0000000000c2'), true, 'it is due in 72 hours');

set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.teacher_claim_code_check('94000000-0000-0000-0000-0000000000c2', true) $$, '42501', null, 'skill must match the teacher''s chosen skills');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.teacher_claim_code_check('94000000-0000-0000-0000-0000000000c2', true) $$, '42501', null,
  'a teacher can''t grade a student in a venture they supervise');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000e');
select throws_ok($$ select public.teacher_claim_code_check('94000000-0000-0000-0000-0000000000c2', true) $$, '42501', null, 'a student can''t claim');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select public.teacher_claim_code_check('94000000-0000-0000-0000-0000000000c2', true) $$, 'a teacher claims a check');
select throws_ok($$ select public.teacher_claim_code_check('94000000-0000-0000-0000-0000000000c3', true) $$, '23514', null, 'the weekly limit holds');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.teacher_claim_code_check('94000000-0000-0000-0000-0000000000c2', true) $$, '55000', null,
  'a second teacher never takes a check that is claimed');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a2');
select ok(public.teacher_grade_code_check('94000000-0000-0000-0000-0000000000c2',
  '{"behaviour":{"pass":true},"design":{"pass":true},"change":{"pass":true},"accuracy":{"pass":false}}', 'Good explanation'), '3 of 4 passes');
reset role;
select is((select status::text from public.code_checks where id = '94000000-0000-0000-0000-0000000000c2'), 'passed', 'the check is passed');
-- Unclaimed after 48 hours moves to Skilient reviewers.
update public.code_checks set submitted_at = now() - interval '49 hours' where id = '94000000-0000-0000-0000-0000000000c3';
select private.teacher_reminders();
select isnt((select routed_to_staff_at from public.code_checks where id = '94000000-0000-0000-0000-0000000000c3'), null,
  'an unclaimed check moves to Skilient reviewers after 48 hours');

-- Removing a teacher keeps past reviews and endorsements, marked former faculty.
set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-0000000000f5', 'aal2');
select lives_ok($$ select public.revoke_teacher('94000000-0000-0000-0000-0000000000a1', 'left the university') $$, 'staff remove a teacher');
reset role;
select is((select status::text from public.venture_supervisors where venture_id = pg_temp.v('v1') and teacher_id = '94000000-0000-0000-0000-0000000000a1'), 'ended', 'their supervision ends');
set local role authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.teacher_home() $$, '42501', null, 'a removed teacher has student permissions only');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000f5', 'aal2');
select lives_ok($$ select public.revoke_teacher('94000000-0000-0000-0000-0000000000a2', 'left the university') $$, 'and the reviewer');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000b');
select is((public.venture_reviews_for(pg_temp.v('v1')) -> 0 ->> 'former_faculty')::boolean, true, 'their review stays, marked former faculty');
select is((select count(*)::integer from public.endorsements_for('94000000-0000-0000-0000-00000000000b') where former_faculty), 1,
  'and so does their endorsement');

-- ---------------------------------------------------------------------------
-- Tables refuse direct writes
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.teacher_profiles (user_id, university_id, department, title, status)
  values ('94000000-0000-0000-0000-00000000000b', (select university_id from public.profiles where user_id = '94000000-0000-0000-0000-00000000000b'), 'CS', 'Prof', 'approved') $$,
  '42501', null, 'nobody approves themselves by inserting');
select throws_ok($$ insert into public.project_ideas (teacher_id, university_id, title, brief, skills, difficulty, team_size, duration_weeks, deliverables)
  values ('94000000-0000-0000-0000-00000000000b', (select university_id from public.profiles where user_id = '94000000-0000-0000-0000-00000000000b'), 'abc', 'b', '{react}', 'intro', 2, 1, 'd') $$,
  '42501', null, 'ideas are written through save_idea only');
select throws_ok($$ insert into public.venture_reviews (request_id, venture_id, teacher_id, rubric, average) values (gen_random_uuid(), pg_temp.v('v1'), '94000000-0000-0000-0000-0000000000a2', '{}', 5) $$,
  '42501', null, 'reviews are written through submit_review only');
select throws_ok($$ select count(*) from public.faculty_csv_entries $$, '42501', null, 'the faculty list is closed');
select throws_ok($$ select count(*) from public.teacher_concentration_flags $$, '42501', null, 'concentration flags are closed');
select throws_ok($$ insert into public.supervisor_comments (venture_id, author_id, body) values (pg_temp.v('v1'), '94000000-0000-0000-0000-00000000000b', 'x') $$,
  '42501', null, 'comments are written through post_supervisor_comment only');
select throws_ok($$ insert into public.venture_supervisors (venture_id, teacher_id) values (pg_temp.v('v2'), '94000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, 'supervisors are set through functions only');
select throws_ok($$ insert into public.review_requests (venture_id, teacher_id, requested_by, due_at) values (pg_temp.v('v1'), '94000000-0000-0000-0000-0000000000a3', '94000000-0000-0000-0000-00000000000b', now()) $$,
  '42501', null, 'review requests are written through functions only');
select throws_ok($$ insert into public.teacher_settings (user_id) values ('94000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, 'teacher settings are written through save_teacher_settings only');

select finish();
rollback;
