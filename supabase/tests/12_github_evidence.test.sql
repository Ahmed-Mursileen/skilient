-- Commit evidence, levels and review flags (PRD 5.5 "Evidence levels", "Anti-gaming").
-- A and B study at NUTECH, C at FAST; D is a trust reviewer. The worker's side (GitHub
-- calls, author checks) is covered by tests/worker; this covers the database rules.
begin;
select plan(37);

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('60000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('60000000-0000-0000-0000-00000000000c', 'c@nu.edu.pk'),
  ('60000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk');
insert into public.staff_roles (user_id, role) values ('60000000-0000-0000-0000-00000000000d', 'trust_reviewer');
insert into public.github_accounts (user_id, github_id, login) values
  ('60000000-0000-0000-0000-00000000000a', 6001, 'amna'),
  ('60000000-0000-0000-0000-00000000000b', 6002, 'bilal');
insert into public.github_installations (installation_id, account_id, account_login, account_type) values
  (96001, 6001, 'amna', 'User'), (96002, 6002, 'bilal', 'User');
insert into public.github_repos (repo_id, full_name, owner_id, private, default_branch, languages) values
  (901, 'amna/robot', 6001, true, 'main', '{Python}'),
  (902, 'bilal/robot', 6002, false, 'main', '{}');
insert into public.github_user_repos (user_id, repo_id, installation_id, kind) values
  ('60000000-0000-0000-0000-00000000000a', 901, 96001, 'owned'),
  ('60000000-0000-0000-0000-00000000000b', 902, 96002, 'owned');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.sha(p text) returns text language sql as $$
  select encode(extensions.digest(p, 'sha1'), 'hex');
$$;
-- One analysed commit, as the worker records it.
create function pg_temp.commit(
  p_user uuid, p_repo bigint, p_name text, p_at timestamptz,
  p_detections jsonb default '[]', p_lines integer default 0, p_blobs jsonb default '[]',
  p_seen text default 'harvest', p_authored timestamptz default null
) returns boolean language sql as $$
  select private.record_commit(p_user, p_repo, jsonb_build_object(
    'sha', pg_temp.sha(p_name), 'committed_at', p_at, 'authored_at', coalesce(p_authored, p_at),
    'pushed_at', case when p_seen = 'push' then p_at end, 'seen_via', p_seen,
    'meaningful_lines', p_lines, 'detections', p_detections, 'blobs', p_blobs));
$$;
create function pg_temp.level(p_user uuid, p_skill text) returns smallint language sql as $$
  select level from public.user_skills where user_id = p_user and skill_id = p_skill;
$$;

-- ---------------------------------------------------------------------------
-- Levels
-- ---------------------------------------------------------------------------
-- A: Python on three days (180 lines); FastAPI imported on two of them; Docker on all three.
select pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'a1', '2026-08-01 12:00+05',
  '[{"skill": "python", "kind": "lines", "path": "app/a.py", "lines": 60},
    {"skill": "fastapi", "kind": "import", "path": "app/a.py", "lines": 0},
    {"skill": "docker", "kind": "file", "path": "Dockerfile", "lines": 0}]', 60);
select pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'a2', '2026-08-02 12:00+05',
  '[{"skill": "python", "kind": "lines", "path": "app/b.py", "lines": 60},
    {"skill": "fastapi", "kind": "import", "path": "app/b.py", "lines": 0},
    {"skill": "docker", "kind": "file", "path": "Dockerfile", "lines": 0}]', 60);
select pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'a3', '2026-08-03 12:00+05',
  '[{"skill": "python", "kind": "lines", "path": "app/c.py", "lines": 60},
    {"skill": "docker", "kind": "file", "path": "Dockerfile", "lines": 0}]', 60);
-- Two commits the same Pakistan day don't make two days.
select pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'a4', '2026-08-02 23:30+05',
  '[{"skill": "fastapi", "kind": "import", "path": "app/c.py", "lines": 0}]', 0);
select private.recompute_user_skills('60000000-0000-0000-0000-00000000000a');

select is(pg_temp.level('60000000-0000-0000-0000-00000000000a', 'python'), 2::smallint,
  'a language reaches L2 with 3 days and 150+ lines');
select is(pg_temp.level('60000000-0000-0000-0000-00000000000a', 'fastapi'), 1::smallint,
  'a framework imported on only 2 distinct days stays L1');
select is(pg_temp.level('60000000-0000-0000-0000-00000000000a', 'docker'), 2::smallint,
  'a tool reaches L2 with hits on 3 days');
select is(pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'a1', '2026-08-01 12:00+05'), false,
  'a commit is recorded once (idempotent by SHA)');
select is((select count(*)::int from public.skill_evidence where user_id = '60000000-0000-0000-0000-00000000000a'), 9,
  'evidence is one row per commit and skill');

-- L3/L4 come from other sources (phase 4) and are never lowered by a recompute.
update public.user_skills set level = 3 where user_id = '60000000-0000-0000-0000-00000000000a' and skill_id = 'python';
select private.recompute_user_skills('60000000-0000-0000-0000-00000000000a');
select is(pg_temp.level('60000000-0000-0000-0000-00000000000a', 'python'), 3::smallint, 'a higher level is kept');
update public.user_skills set level = 2 where user_id = '60000000-0000-0000-0000-00000000000a' and skill_id = 'python';

-- ---------------------------------------------------------------------------
-- Flags hold evidence
-- ---------------------------------------------------------------------------
-- Burst: 51 commits in one day.
select count(*) from generate_series(1, 51) i
 where pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'burst' || i, '2026-08-10 12:00+05');
select is((select status::text from public.review_flags where user_id = '60000000-0000-0000-0000-00000000000a' and kind = 'burst'),
  'open', 'more than 50 commits in a day opens a burst flag');
select is((select count(*)::int from public.github_commits
            where user_id = '60000000-0000-0000-0000-00000000000a' and status = 'held'), 51,
  'every commit of that day is held');

-- Backdating: pushed now, authored 40 days before.
select pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'late', now(), '[]', 0, '[]', 'push', now() - interval '40 days');
select is((select status::text from public.github_commits where user_id = '60000000-0000-0000-0000-00000000000a' and sha = pg_temp.sha('late')),
  'held', 'a commit authored 40 days before its push is held');
select is((select occurred_at::date from public.github_commits where user_id = '60000000-0000-0000-0000-00000000000a' and sha = pg_temp.sha('late')),
  now()::date, 'its recency is the push time, not the author date');

-- Cross-account duplicate: B's commit adds a file byte-identical to one of A's.
select pg_temp.commit('60000000-0000-0000-0000-00000000000a', 901, 'dupA', '2026-08-05 12:00+05', '[]', 30, jsonb_build_array(repeat('c', 40)));
select pg_temp.commit('60000000-0000-0000-0000-00000000000b', 902, 'dupB', '2026-08-06 12:00+05', '[]', 30, jsonb_build_array(repeat('c', 40)));
select is((select count(*)::int from public.review_flags where kind = 'cross_account_duplicate' and status = 'open'
            and user_id in ('60000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000b')), 2,
  'identical files credited to two students flag both');
select results_eq(
  $$ select status::text from public.github_commits where sha in (pg_temp.sha('dupA'), pg_temp.sha('dupB')) order by sha $$,
  $$ values ('held'), ('held') $$,
  'both commits are held');

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('60000000-0000-0000-0000-00000000000b');
select is((select level from public.user_skills where user_id = '60000000-0000-0000-0000-00000000000a' and skill_id = 'python'),
  2::smallint, 'a classmate at the same university sees the level');
select is_empty($$ select * from public.github_commits where user_id = '60000000-0000-0000-0000-00000000000a' $$,
  'a classmate never sees the commits');
select is_empty($$ select * from public.skill_evidence where user_id = '60000000-0000-0000-0000-00000000000a' $$,
  'a classmate never sees the evidence');
select is_empty($$ select id from public.review_flags where user_id = '60000000-0000-0000-0000-00000000000a' $$,
  'a classmate never sees the flags');
select pg_temp.as_user('60000000-0000-0000-0000-00000000000c');
select is_empty($$ select skill_id, level from public.user_skills where user_id = '60000000-0000-0000-0000-00000000000a' $$,
  'a student at another university does not see a university-only profile''s skills');
select pg_temp.as_user('60000000-0000-0000-0000-00000000000a');
select isnt_empty($$ select * from public.skill_evidence where user_id = '60000000-0000-0000-0000-00000000000a' $$,
  'the owner reads her evidence');
select is((select count(*)::int from public.review_flags where status = 'open'), 3,
  'the owner sees that items are under review');
select throws_ok($$ select kind from public.review_flags $$, '42501', null, 'but not what the flag says');
select throws_ok($$ insert into public.user_skills (user_id, skill_id, level) values ('60000000-0000-0000-0000-00000000000a', 'java', 2) $$,
  '42501', null, 'a student cannot write her own levels');
select throws_ok($$ update public.github_commits set status = 'counted' $$, '42501', null, 'or release her held commits');
select throws_ok($$ select private.record_commit('60000000-0000-0000-0000-00000000000a', 901, '{}') $$, '42501', null,
  'or record evidence');
select throws_ok($$ select public.resolve_review_flag(1, false, 'looks fine') $$, '42501', null, 'or resolve a flag');
select throws_ok($$ select * from private.github_commit_blobs $$, '42501', null, 'blob hashes are private');
set local role anon;
select throws_ok($$ select * from public.user_skills $$, '42501', null, 'signed-out visitors read no skills');
reset role;

-- ---------------------------------------------------------------------------
-- Trust reviewers resolve
-- ---------------------------------------------------------------------------
select set_config('test.flag_b', (select id::text from public.review_flags
  where user_id = '60000000-0000-0000-0000-00000000000b' and kind = 'cross_account_duplicate'), true);
select set_config('test.flag_burst', (select id::text from public.review_flags
  where user_id = '60000000-0000-0000-0000-00000000000a' and kind = 'burst'), true);
set local role authenticated;
select pg_temp.as_user('60000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.resolve_review_flag(current_setting('test.flag_b')::bigint, false, 'fine') $$,
  '42501', null, 'a trust reviewer needs a two-factor session');
select pg_temp.as_user('60000000-0000-0000-0000-00000000000d', 'aal2');
select is((select kind::text from public.review_flag_details(current_setting('test.flag_b')::bigint)),
  'cross_account_duplicate', 'a trust reviewer reads the flag');
select throws_ok($$ select public.resolve_review_flag(current_setting('test.flag_b')::bigint, false, '') $$,
  '22023', null, 'resolving needs a note');
select is(public.resolve_review_flag(current_setting('test.flag_b')::bigint, false, 'Shared starter file from a course'), true,
  'the reviewer clears B''s flag');
select is(public.resolve_review_flag(current_setting('test.flag_burst')::bigint, true, 'Generated commits'), true,
  'and upholds A''s burst');
reset role;
select is((select status::text from public.github_commits where sha = pg_temp.sha('dupB')), 'counted',
  'a cleared flag releases the commit');
select is((select status::text from public.github_commits where sha = pg_temp.sha('dupA')), 'held',
  'A''s own open flag still holds hers');
select is((select count(*)::int from public.github_commits
            where user_id = '60000000-0000-0000-0000-00000000000a' and exclusion = 'review'), 51,
  'an upheld flag excludes its commits for good');

-- ---------------------------------------------------------------------------
-- Excluding a repository, and history rewrites
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('60000000-0000-0000-0000-00000000000a');
update public.github_user_repos set excluded = true where repo_id = 901;
reset role;
select is_empty($$ select * from public.user_skills where user_id = '60000000-0000-0000-0000-00000000000a' $$,
  'excluding a repository removes the levels built on it');
update public.github_user_repos set excluded = false where repo_id = 901;

-- A complete listing without a3: the history was rewritten, its evidence goes.
select private.harvest_commits('60000000-0000-0000-0000-00000000000a', 901,
  (select jsonb_agg(jsonb_build_object('sha', sha)) from public.github_commits
    where user_id = '60000000-0000-0000-0000-00000000000a' and sha <> pg_temp.sha('a3')), true);
select is((select exclusion from public.github_commits where sha = pg_temp.sha('a3')), 'rewritten',
  'a commit no longer in the history is dropped');
select private.recompute_user_skills('60000000-0000-0000-0000-00000000000a');
select is(pg_temp.level('60000000-0000-0000-0000-00000000000a', 'python'), 1::smallint,
  'and the level falls back to what the remaining evidence shows');

select * from finish();
rollback;
