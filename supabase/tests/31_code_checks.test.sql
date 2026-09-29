-- Code checks (PRD 5.5, 5.21). S has Python at L2 from their own commits; F is S's friend and a
-- trust reviewer; T and U are trust reviewers; M is a moderator; O is another student.
begin;
select plan(49);

insert into auth.users (id, email) values
  ('93100000-0000-0000-0000-00000000000a', 's@nutech.edu.pk'),
  ('93100000-0000-0000-0000-00000000000b', 'f@nutech.edu.pk'),
  ('93100000-0000-0000-0000-00000000000c', 't@nutech.edu.pk'),
  ('93100000-0000-0000-0000-00000000000d', 'u@nutech.edu.pk'),
  ('93100000-0000-0000-0000-00000000000e', 'm@nutech.edu.pk'),
  ('93100000-0000-0000-0000-00000000000f', 'o@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'cc_' || right(user_id::text, 2)
 where user_id::text like '93100000-%';
insert into public.staff_roles (user_id, role) values
  ('93100000-0000-0000-0000-00000000000b', 'trust_reviewer'),
  ('93100000-0000-0000-0000-00000000000c', 'trust_reviewer'),
  ('93100000-0000-0000-0000-00000000000d', 'trust_reviewer'),
  ('93100000-0000-0000-0000-00000000000e', 'moderator');
insert into public.friendships (user_id_a, user_id_b) values ('93100000-0000-0000-0000-00000000000a', '93100000-0000-0000-0000-00000000000b');
insert into public.github_accounts (user_id, github_id, login) values ('93100000-0000-0000-0000-00000000000a', 93101, 'sana');
insert into public.github_installations (installation_id, account_id, account_login, account_type) values (93101, 93101, 'sana', 'User');
insert into public.github_repos (repo_id, full_name, owner_id, private, default_branch, languages)
values (93101, 'sana/robot', 93101, true, 'main', '{Python}');
insert into public.github_user_repos (user_id, repo_id, installation_id, kind)
values ('93100000-0000-0000-0000-00000000000a', 93101, 93101, 'owned');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
create function pg_temp.sha(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha1'), 'hex') $$;
create function pg_temp.level(p_skill text) returns smallint language sql security definer as $$
  select level from public.user_skills where user_id = '93100000-0000-0000-0000-00000000000a' and skill_id = p_skill;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Python on three days, 180 lines: L2 from the student's own commits. Go only once (L1).
select private.record_commit('93100000-0000-0000-0000-00000000000a', 93101, jsonb_build_object(
  'sha', pg_temp.sha('c' || i), 'committed_at', '2026-08-0' || i || ' 12:00+05', 'authored_at', '2026-08-0' || i || ' 12:00+05',
  'seen_via', 'harvest', 'meaningful_lines', 60,
  'detections', jsonb_build_array(jsonb_build_object('skill', 'python', 'kind', 'lines', 'path', 'app/m' || i || '.py', 'lines', 60))))
  from generate_series(1, 3) i;
select private.record_commit('93100000-0000-0000-0000-00000000000a', 93101, jsonb_build_object(
  'sha', pg_temp.sha('g1'), 'committed_at', '2026-08-04 12:00+05', 'seen_via', 'harvest', 'meaningful_lines', 30,
  'detections', '[{"skill": "go", "kind": "lines", "path": "main.go", "lines": 30}]'::jsonb));
select private.recompute_user_skills('93100000-0000-0000-0000-00000000000a');

-- ---------------------------------------------------------------------------
-- Requesting
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('93100000-0000-0000-0000-00000000000a');
select is(pg_temp.level('python'), 2::smallint, 'Python is L2 from the student''s commits');
select throws_ok($$ select public.request_code_check('go') $$, '55000', null, 'a skill below L2 can''t be checked');
select throws_ok($$ select public.request_code_check('nope') $$, 'P0002', null, 'an unknown skill is refused');
select is((select blocker from public.code_check_state('python')), null, 'the drawer is told a check can be requested');
select lives_ok($$ select pg_temp.remember('c1', public.request_code_check('python')) $$, 'the student requests a check');
select is((select status::text from public.code_checks where id = pg_temp.v('c1')), 'preparing', 'it waits for the worker');
select throws_ok($$ select public.request_code_check('python') $$, '55000', null, 'one open check per skill');
reset role;
select is((select count(*)::integer from pgmq.q_github_jobs where message->>'check_id' = current_setting('test.c1')), 1,
  'the worker is asked to pick the code');
set local role authenticated;
select throws_ok($$ select public.start_code_check(pg_temp.v('c1')) $$, '55000', null, 'it can''t start before the code is picked');
select throws_ok($$ select path from public.code_checks $$, '42501', null, 'where the code is isn''t readable from the table');
select throws_ok($$ select grader_id from public.code_checks $$, '42501', null, 'nor who graded it');
select throws_ok($$ update public.code_checks set status = 'passed' $$, '42501', null, 'no direct writes');
select throws_ok($$ select * from public.code_check_prompts $$, '42501', null, 'the question bank isn''t readable');

-- The worker picks commit c2, lines 5-28 of app/m2.py.
reset role;
select is((select count(*)::integer from private.code_check_candidates(current_setting('test.c1')::uuid)), 3,
  'the candidates are the student''s counted commits for the skill');
select ok(private.code_check_prepared(current_setting('test.c1')::uuid, 93101, pg_temp.sha('c2'), 'app/m2.py', 5, 28),
  'the worker records where the snippet is');
select is((select count(*)::integer from public.notifications where user_id = '93100000-0000-0000-0000-00000000000a'
            and type = 'code_check_ready'), 1, 'the student is told it''s ready');

-- ---------------------------------------------------------------------------
-- The attempt
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('93100000-0000-0000-0000-00000000000a');
select is((select prompt from public.my_code_check(pg_temp.v('c1'))), null, 'the change request stays hidden until the code is shown');
select is(public.start_code_check(pg_temp.v('c1')), null::timestamptz, 'starting asks for the code; the clock waits for it');
select throws_ok($$ select public.save_code_check(pg_temp.v('c1'), '{"what": "x"}') $$, '55000', null,
  'no answers before the code has been shown');
reset role;
select is((select role from private.code_check_snippet_access(current_setting('test.c1')::uuid, '93100000-0000-0000-0000-00000000000a', 'aal1')),
  'student', 'the student may see their code during the attempt');
select is((select count(*)::integer from private.code_check_snippet_access(current_setting('test.c1')::uuid, '93100000-0000-0000-0000-00000000000f', 'aal2')),
  0, 'nobody else may');
select is((select count(*)::integer from private.code_check_snippet_access(current_setting('test.c1')::uuid, '93100000-0000-0000-0000-00000000000c', 'aal2')),
  0, 'not even a trust reviewer before it''s submitted and claimed');
select private.code_check_served(current_setting('test.c1')::uuid);
select ok((select deadline_at from public.code_checks where id = current_setting('test.c1')::uuid)
          between now() + interval '9 minutes' and now() + interval '11 minutes', 'the 10 minutes start when the code is first shown');
set local role authenticated;
select ok((select prompt from public.my_code_check(pg_temp.v('c1'))) is not null, 'once shown, the change request appears');
select throws_ok($$ select public.save_code_check(pg_temp.v('c1'), '{"what": "x", "extra": "y"}') $$, '22023', null,
  'only the three answers');
select throws_ok(format($$ select public.save_code_check('%s', jsonb_build_object('what', repeat('x', 2001))) $$, pg_temp.v('c1')),
  '23514', null, 'answers are at most 2,000 characters');
select is(public.save_code_check(pg_temp.v('c1'), '{"what": "Parses the timetable", "why": "One pass, no copies"}'), 'in_progress'::public.code_check_status,
  'answers are saved as the student types');
select is(public.save_code_check(pg_temp.v('c1'), '{"what": "Parses the timetable", "why": "One pass, no copies", "change": "Stream it"}', true),
  'submitted'::public.code_check_status, 'and submitted');
select throws_ok($$ select public.save_code_check(pg_temp.v('c1'), '{"what": "changed my mind"}') $$, '55000', null,
  'a submitted check can''t be edited');
select is((select blocker from public.code_check_state('python')), 'you already have a code check open for this skill',
  'another can''t be requested while it waits for a grade');

-- ---------------------------------------------------------------------------
-- Grading
-- ---------------------------------------------------------------------------
select pg_temp.as_user('93100000-0000-0000-0000-00000000000e', 'aal2');
select throws_ok($$ select * from public.code_check_queue() $$, '42501', null, 'moderators don''t grade');
select pg_temp.as_user('93100000-0000-0000-0000-00000000000b', 'aal2');
select is((select conflict from public.code_check_queue() where id = pg_temp.v('c1')), true, 'a friend sees the conflict');
select throws_ok($$ select public.claim_code_check(pg_temp.v('c1'), true) $$, '42501', null, 'and can''t claim it');
select pg_temp.as_user('93100000-0000-0000-0000-00000000000c', 'aal2');
select is((select skill_name from public.code_check_queue() where id = pg_temp.v('c1')), 'Python', 'a trust reviewer sees it in the queue');
select throws_ok($$ select public.grade_code_check(pg_temp.v('c1'), '{}', 'Good work') $$, '55000', null, 'claim before grading');
select lives_ok($$ select public.claim_code_check(pg_temp.v('c1'), true) $$, 'T claims it');
reset role;
select is((select role from private.code_check_snippet_access(current_setting('test.c1')::uuid, '93100000-0000-0000-0000-00000000000c', 'aal2')),
  'grader', 'the claiming reviewer on two-factor may see the code');
select is((select count(*)::integer from private.code_check_snippet_access(current_setting('test.c1')::uuid, '93100000-0000-0000-0000-00000000000c', 'aal1')),
  0, 'not without two-factor');
select is((select count(*)::integer from private.code_check_snippet_access(current_setting('test.c1')::uuid, '93100000-0000-0000-0000-00000000000a', 'aal1')),
  0, 'and the student no longer can');
set local role authenticated;
select pg_temp.as_user('93100000-0000-0000-0000-00000000000d', 'aal2');
select throws_ok($$ select public.claim_code_check(pg_temp.v('c1'), true) $$, '55000', null, 'another reviewer can''t take it');
select pg_temp.as_user('93100000-0000-0000-0000-00000000000c', 'aal2');
select throws_ok($$ select public.grade_code_check(pg_temp.v('c1'), '{"behaviour": {"pass": true}}', 'Good') $$, '22023', null,
  'all four rubric parts are marked');
select is(public.grade_code_check(pg_temp.v('c1'),
  '{"behaviour": {"pass": true, "comment": "Clear"}, "design": {"pass": true}, "change": {"pass": false, "comment": "Missed memory"}, "accuracy": {"pass": true}}',
  'Solid understanding; think about memory when streaming.'), true, '3 of 4 passes');
select results_eq($$ select action from public.ops_audit_log where target_id = pg_temp.v('c1')::text order by action $$,
  $$ values ('code_check.claim'::text), ('code_check.pass') $$, 'claim and grade are audited');
select is(pg_temp.level('python'), 4::smallint, 'a passed check makes the skill L4');

select pg_temp.as_user('93100000-0000-0000-0000-00000000000a');
select results_eq($$ select status::text, rubric -> 'change' ->> 'comment', feedback from public.my_code_check(pg_temp.v('c1')) $$,
  $$ values ('passed'::text, 'Missed memory'::text, 'Solid understanding; think about memory when streaming.'::text) $$,
  'the student reads the rubric and feedback, not who graded');
select is((select kind from public.my_skill_proofs('python') where kind = 'code_check'), 'code_check', 'and the drawer shows the pass');
select is((select blocker from public.code_check_state('python')), 'you already passed a code check for this skill',
  'a passed skill isn''t checked again');

-- ---------------------------------------------------------------------------
-- Time-outs and the 30-day rule
-- ---------------------------------------------------------------------------
reset role;
insert into public.code_checks (user_id, skill_id, status, repo_id, sha, path, start_line, end_line, ready_at, started_at,
                                deadline_at, snippet_served_at, answers)
values ('93100000-0000-0000-0000-00000000000f', 'python', 'in_progress', 1, pg_temp.sha('x'), 'a.py', 1, 20, now() - interval '1 hour',
        now() - interval '20 minutes', now() - interval '10 minutes', now() - interval '20 minutes', '{}'),
       ('93100000-0000-0000-0000-00000000000f', 'go', 'in_progress', 1, pg_temp.sha('y'), 'a.go', 1, 20, now() - interval '1 hour',
        now() - interval '20 minutes', now() - interval '10 minutes', now() - interval '20 minutes', '{"what": "Draft"}');
select private.code_checks_tick();
select results_eq($$ select skill_id, status::text from public.code_checks where user_id = '93100000-0000-0000-0000-00000000000f' order by skill_id $$,
  $$ values ('go'::text, 'submitted'::text), ('python', 'failed') $$,
  'a time-out submits what was saved, or fails with nothing saved');
update public.code_checks set status = 'failed' where user_id = '93100000-0000-0000-0000-00000000000f';
insert into public.github_accounts (user_id, github_id, login) values ('93100000-0000-0000-0000-00000000000f', 93102, 'omar');
insert into public.user_skills (user_id, skill_id, level, active_days, lines) values ('93100000-0000-0000-0000-00000000000f', 'java', 2, 3, 200);
update public.user_skills set active_days = 3, lines = 200, level = 2 where user_id = '93100000-0000-0000-0000-00000000000f';
insert into public.user_skills (user_id, skill_id, level, active_days, lines)
values ('93100000-0000-0000-0000-00000000000f', 'python', 2, 3, 200) on conflict do nothing;
set local role authenticated;
select pg_temp.as_user('93100000-0000-0000-0000-00000000000f');
select is((select blocker from public.code_check_state('python')), 'one attempt per skill every 30 days',
  'an attempt counts for 30 days from when the code was shown');

select * from finish();
rollback;
