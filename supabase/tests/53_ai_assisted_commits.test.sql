-- AI-assisted work (decisions 2026-10-03, PRD 5.5): commits by an AI coding agent, recorded by
-- the worker from a pull request the student opened and merged, count toward L1/L2 and flag the
-- skill as AI-assisted when most of its counted lines came from the agent; a passed code check
-- clears the flag. The worker's checks (pull request author, agent identity) are covered by
-- tests/worker; this file covers storage, levels, the reads and the refusals.
begin;
select plan(18);

insert into auth.users (id, email) values
  ('53000000-0000-0000-0000-00000000000a', 'ai53a@nutech.edu.pk'),
  ('53000000-0000-0000-0000-00000000000b', 'ai53b@nutech.edu.pk');
insert into public.github_accounts (user_id, github_id, login) values
  ('53000000-0000-0000-0000-00000000000a', 5301, 'aiamna'),
  ('53000000-0000-0000-0000-00000000000b', 5302, 'aibilal');
insert into public.github_installations (installation_id, account_id, account_login, account_type) values
  (95301, 5301, 'aiamna', 'User');
insert into public.github_repos (repo_id, full_name, owner_id, private, default_branch, languages) values
  (953, 'aiamna/app', 5301, false, 'main', '{TypeScript}');
insert into public.github_user_repos (user_id, repo_id, installation_id, kind) values
  ('53000000-0000-0000-0000-00000000000a', 953, 95301, 'owned');

create function pg_temp.sha(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha1'), 'hex') $$;
create function pg_temp.commit(p_name text, p_at timestamptz, p_lines integer, p_agent text default null, p_pr integer default null)
returns boolean language sql as $$
  select private.record_commit('53000000-0000-0000-0000-00000000000a', 953, jsonb_build_object(
    'sha', pg_temp.sha(p_name), 'committed_at', p_at, 'authored_at', p_at, 'seen_via', 'harvest',
    'meaningful_lines', p_lines, 'ai_agent', p_agent, 'via_pr', p_pr,
    'detections', jsonb_build_array(jsonb_build_object('skill', 'typescript', 'kind', 'lines', 'path', 'src/a.ts', 'lines', p_lines))));
$$;
create function pg_temp.skill() returns public.user_skills language sql as $$
  select * from public.user_skills where user_id = '53000000-0000-0000-0000-00000000000a' and skill_id = 'typescript';
$$;

-- One commit of the student's own (40 lines) and three by Claude through pull request #7 (180 lines).
select pg_temp.commit('own1', '2026-09-01 12:00+05', 40);
select pg_temp.commit('ai1', '2026-09-02 12:00+05', 60, 'noreply@anthropic.com', 7);
select pg_temp.commit('ai2', '2026-09-03 12:00+05', 60, 'noreply@anthropic.com', 7);
select pg_temp.commit('ai3', '2026-09-04 12:00+05', 60, 'noreply@anthropic.com', 7);
select private.recompute_user_skills('53000000-0000-0000-0000-00000000000a');

select is((select count(*)::int from public.github_commits where user_id = '53000000-0000-0000-0000-00000000000a' and ai_agent is not null), 3,
  'agent commits are stored with their agent');
select is((select via_pr from public.github_commits where sha = pg_temp.sha('ai1')), 7, 'and the pull request they came through');
select is((pg_temp.skill()).level, 2::smallint, 'agent commits count toward L2 like the student''s own');
select is((pg_temp.skill()).ai_lines, 180, 'the AI-written lines are counted');
select ok((pg_temp.skill()).ai_assisted, 'a skill mostly written by an agent is flagged AI-assisted');

-- The flag follows the share: more of the student's own lines clear it.
select pg_temp.commit('own2', '2026-09-05 12:00+05', 200);
select private.recompute_user_skills('53000000-0000-0000-0000-00000000000a');
select ok(not (pg_temp.skill()).ai_assisted, 'once most lines are the student''s own, the flag goes');

-- A passed code check clears it whatever the share.
select pg_temp.commit('ai4', '2026-09-06 12:00+05', 400, 'noreply@anthropic.com', 8);
select private.recompute_user_skills('53000000-0000-0000-0000-00000000000a');
select ok((pg_temp.skill()).ai_assisted, 'more agent lines bring the flag back');
insert into public.code_checks (user_id, skill_id, status) values ('53000000-0000-0000-0000-00000000000a', 'typescript', 'passed');
select private.recompute_user_skills('53000000-0000-0000-0000-00000000000a');
select ok(not (pg_temp.skill()).ai_assisted, 'a passed code check removes the AI-assisted label');
delete from public.code_checks where user_id = '53000000-0000-0000-0000-00000000000a';
select private.recompute_user_skills('53000000-0000-0000-0000-00000000000a');

-- A complete author listing (which never contains agent commits) doesn't mark them rewritten.
select private.harvest_commits('53000000-0000-0000-0000-00000000000a', 953,
  jsonb_build_array(jsonb_build_object('sha', pg_temp.sha('own1'), 'parents', 1),
                    jsonb_build_object('sha', pg_temp.sha('own2'), 'parents', 1)), true);
select is((select count(*)::int from public.github_commits where user_id = '53000000-0000-0000-0000-00000000000a'
            and ai_agent is not null and status = 'counted'), 4, 'agent commits survive a complete author listing');

-- An agent commit can't be stored without the pull request it came through.
select throws_ok($$insert into public.github_commits (user_id, repo_id, sha, occurred_at, seen_via, ai_agent)
                   values ('53000000-0000-0000-0000-00000000000a', 953, repeat('e', 40), now(), 'harvest', 'noreply@anthropic.com')$$,
  '23514', null, 'an agent commit needs its pull request');

-- Reads
select is(private.ai_agent_label('noreply@anthropic.com'), 'Claude', 'agent emails read as their name');
select is(private.ai_agent_label('someone@else.dev'), 'someone@else.dev', 'unknown identities read as they are');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '53000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select ok((select ai_assisted from public.my_skills() where skill_id = 'typescript'), 'my_skills returns the flag');
select ok(exists (select 1 from public.my_skill_proofs('typescript') where kind = 'ai_pull_request' and url like '%/pull/7'),
  'the skill''s proofs list the agent pull requests');
select ok((select ai_assisted from public.user_skills where user_id = '53000000-0000-0000-0000-00000000000a' and skill_id = 'typescript'),
  'signed-in users can read the flag on a profile');

-- Refusals: nobody but the worker writes agent data.
select throws_ok($$update public.github_commits set ai_agent = 'noreply@anthropic.com', via_pr = 1$$, '42501', null,
  'a student cannot mark commits as agent-written');
select throws_ok($$select private.agent_commit_shas('53000000-0000-0000-0000-00000000000a', 953)$$, '42501', null,
  'a student cannot call the worker''s reads');
reset role;
set local role anon;
select throws_ok($$select * from public.my_skills()$$, '42501', null, 'signed-out visitors cannot read skills');
reset role;

select * from finish();
rollback;
