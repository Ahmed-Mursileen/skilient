-- Verified CV signing core (PRD 5.18; decisions.md 2026-10-01): the snapshot takes verified
-- data only, issuing supersedes, key installs retire the old key, and nobody reaches the
-- tables or the private functions from the API. S is the student; T1-T6 and H are teammates
-- who endorse; O is another student; B is banned.
begin;
select plan(58);

insert into auth.users (id, email)
select ('93700000-0000-0000-0000-0000000000' || x.k)::uuid, 'cv' || x.k || '@nutech.edu.pk'
  from (values ('01'), ('11'), ('12'), ('13'), ('14'), ('15'), ('16'), ('17'), ('20'), ('30')) as x(k);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('93700000-0000-0000-0000-0000000000' || case p when 'S' then '01' when 'T1' then '11' when 'T2' then '12'
    when 'T3' then '13' when 'T4' then '14' when 'T5' then '15' when 'T6' then '16' when 'H' then '17'
    when 'O' then '20' when 'B' then '30' end)::uuid
$$;
create function pg_temp.v(i integer) returns uuid language sql immutable as $$
  select ('93700000-0000-0000-0000-00000000a00' || i)::uuid
$$;
update public.profiles
   set onboarding_complete = true, username = 'cv_' || right(user_id::text, 2), full_name = 'Student ' || right(user_id::text, 2),
       department = 'Computer Science', programme = 'BSCS Hons Unchecked', graduation_year = 2027
 where user_id::text like '93700000-%';
update auth.users set banned_until = now() + interval '30 days' where id = pg_temp.u('B');

-- Twenty skills at L2-L4, two at L1 and one at L0 (levels set below).
create temp table fx_skills as
select row_number() over (order by id)::integer as n, id from public.skills where retired_at is null order by id limit 23;
create function pg_temp.sk(i integer) returns text language sql stable as $$ select id from fx_skills where n = i $$;

-- Ventures: V1 completed (S owns; private repo; 3 deliverables), V2 in progress (public repo),
-- V3 unlisted, V4 recruiting, V5 completed where S left but keeps a confirmed entry, V6 where
-- S left with nothing confirmed.
insert into public.github_repos (repo_id, full_name, owner_id, private) values
  (93701, 'secret/app', 9370, true), (93702, 'org/public-app', 9370, false);
insert into public.ventures (id, type, owner_id, university_id, title, description, status, visibility, skill_ids, repo_id, repo_full_name)
select pg_temp.v(x.i), 'project', x.owner, p.university_id, x.title, 'Team-written description of ' || x.title, 'in_progress',
       x.vis::public.venture_visibility, array[pg_temp.sk(1), pg_temp.sk(2)], x.repo, x.repo_name
  from (values
    (1, pg_temp.u('S'), 'Timetable', 'public', 93701::bigint, 'secret/app'),
    (2, pg_temp.u('T1'), 'Canteen', 'public', 93702::bigint, 'org/public-app'),
    (3, pg_temp.u('T1'), 'Hidden thing', 'unlisted', null, null),
    (4, pg_temp.u('T1'), 'Recruiting', 'public', null, null),
    (5, pg_temp.u('T2'), 'Library', 'public', null, null),
    (6, pg_temp.u('T2'), 'Hostel', 'public', null, null)
  ) as x(i, owner, title, vis, repo, repo_name)
  join public.profiles p on p.user_id = x.owner;
insert into public.venture_members (venture_id, user_id)
select pg_temp.v(i), pg_temp.u('S') from generate_series(1, 6) i;
insert into public.venture_members (venture_id, user_id) values
  (pg_temp.v(1), pg_temp.u('T1')), (pg_temp.v(1), pg_temp.u('T2')), (pg_temp.v(2), pg_temp.u('T1')),
  (pg_temp.v(5), pg_temp.u('T2')), (pg_temp.v(6), pg_temp.u('T2'));
insert into public.venture_deliverables (venture_id, label, url) values
  (pg_temp.v(1), 'App', 'https://deliverable.example/app'), (pg_temp.v(1), 'Docs', 'https://deliverable.example/docs'),
  (pg_temp.v(1), 'Demo', 'https://deliverable.example/demo');
insert into public.contributions (id, venture_id, user_id, kind, description, skill_ids) values
  (md5('e1')::uuid, pg_temp.v(1), pg_temp.u('S'), 'code', 'Built the timetable parser', array[pg_temp.sk(1)]),
  (md5('e2')::uuid, pg_temp.v(1), pg_temp.u('S'), 'code', 'Wrote the export', array[pg_temp.sk(2)]),
  (md5('e5')::uuid, pg_temp.v(5), pg_temp.u('S'), 'code', 'Catalogue search', '{}'),
  (md5('e6')::uuid, pg_temp.v(6), pg_temp.u('S'), 'code', 'Unconfirmed work', '{}');
insert into public.contribution_confirmations (contribution_id, confirmer_id) values
  (md5('e1')::uuid, pg_temp.u('T1')), (md5('e2')::uuid, pg_temp.u('T2')), (md5('e5')::uuid, pg_temp.u('T2'));
delete from public.venture_members where user_id = pg_temp.u('S') and venture_id in (pg_temp.v(5), pg_temp.v(6));
update public.ventures set status = 'completed', completed_at = now() - interval '10 days' where id = pg_temp.v(1);
update public.ventures set status = 'completed', completed_at = now() - interval '40 days' where id = pg_temp.v(5);
update public.ventures set status = 'recruiting' where id = pg_temp.v(4);

-- Pull requests: one public and one private that count, one in S's own repository.
insert into public.github_pull_requests (user_id, repo_github_id, number, pr_github_id, repo_full_name, repo_private, merged_at,
                                         approver_github_id, counted, exclusion) values
  (pg_temp.u('S'), 93711, 7, 9371107, 'org/lib', false, now() - interval '5 days', 77, true, null),
  (pg_temp.u('S'), 93712, 3, 9371203, 'secret/lib', true, now() - interval '6 days', 77, true, null),
  (pg_temp.u('S'), 93713, 1, 9371301, 'cv01/own', false, now() - interval '7 days', null, false, 'own_repo');

-- Endorsements tied to e1: T1-T6 (T6 has the highest tier), H hidden; T1 also on e2; T3 once untied.
insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked, tier, tier_met,
                                   percentile, computed_at, published_at)
values
  (pg_temp.u('S'), 1, '{}', 150, 0, 0, 150, true, 'spark', 'spark', 0.88, now(), now()),
  (pg_temp.u('T6'), 1, '{}', 600, 0, 0, 600, true, 'shine', 'shine', 0.99, now(), now());
insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, evidence_id, note, created_at, hidden, hidden_at)
select pg_temp.u(x.who), pg_temp.u('S'), pg_temp.v(1), pg_temp.sk(x.skill), x.ev, x.note, now() - (x.age || ' days')::interval,
       x.hidden, case when x.hidden then now() end
  from (values
    ('T1', 1, md5('e1')::uuid, 'Solid parser', 9, false),
    ('T1', 2, md5('e2')::uuid, null, 1, false),
    ('T2', 1, md5('e1')::uuid, null, 8, false),
    ('T3', 1, md5('e1')::uuid, null, 7, false),
    ('T3', 3, null, null, 1, false),
    ('T4', 1, md5('e1')::uuid, null, 6, false),
    ('T5', 1, md5('e1')::uuid, null, 5, false),
    ('T6', 1, md5('e1')::uuid, 'Best on the team', 20, false),
    ('H', 1, md5('e1')::uuid, null, 2, true)
  ) as x(who, skill, ev, note, age, hidden);

-- Credentials: approved (recognised issuer), pending, and approved but expired.
insert into public.credentials (user_id, title, issuer, issued_on, expires_on, file_path, file_type, file_bytes, status,
                                recognised_issuer_id, reviewed_at)
select pg_temp.u('S'), x.title, 'Typed issuer', date '2026-01-10', x.expires,
       pg_temp.u('S')::text || '/' || gen_random_uuid()::text || '.pdf', 'pdf', 1000, x.status::public.credential_status,
       x.issuer, case when x.status <> 'pending' then now() end
  from (values
    ('Cloud Practitioner', null::date, 'approved', 'aws'),
    ('Waiting', null, 'pending', null),
    ('Lapsed', date '2026-02-01', 'approved', null)
  ) as x(title, expires, status, issuer);

-- Levels are set last: evidence triggers above recompute user_skills from scratch.
delete from public.user_skills where user_id = pg_temp.u('S');
insert into public.user_skills (user_id, skill_id, level, repos, active_days)
select pg_temp.u('S'), id, case when n = 1 then 4 when n <= 5 then 3 when n <= 20 then 2 when n <= 22 then 1 else 0 end, 25 - n, 30 - n
  from fx_skills;

create temp table snap as select private.cv_snapshot(pg_temp.u('S')) as s;
create function pg_temp.s() returns jsonb language sql stable as $$ select s from snap $$;

-- ---------------------------------------------------------------------------
-- Snapshot: header, summary, sections
-- ---------------------------------------------------------------------------
select is(pg_temp.s()->>'schema', 'skilient.cv/1', 'the snapshot names its schema');
select is(pg_temp.s()->'person'->>'name', 'Student 01', 'header: the student''s name');
select is(pg_temp.s()->'person'->>'department', 'Computer Science', 'header: department');
select is(pg_temp.s()->'person'->'email', 'null'::jsonb, 'no email unless the student shows it');
select is(position('BSCS Hons Unchecked' in pg_temp.s()::text), 0, 'the free-text programme appears nowhere');
select is(pg_temp.s()->'standing', '{"tier": "spark", "top_percent": 12}'::jsonb, 'tier and top 12% (percentile 0.88)');
select is(pg_temp.s()->'sections', to_jsonb(private.cv_all_sections()), 'every section, in the standard order, by default');
select ok(pg_temp.s()->>'summary' like 'Computer Science student at %, class of 2027, with verified work in %, % and % across 3 ventures (2 completed).%',
  'summary: department, university, class, top three skills, ventures');
select ok(pg_temp.s()->>'summary' like '% 2 merged pull requests to other developers'' repositories. Spark tier on Skilient, top 12%.',
  'summary: pull requests and tier');

-- ---------------------------------------------------------------------------
-- Skills: L2+ only, up to 15, strongest first, with evidence counts
-- ---------------------------------------------------------------------------
select is(jsonb_array_length(pg_temp.s()->'skills'), 15, 'up to 15 skills');
select is((select min((x->>'level')::integer) from jsonb_array_elements(pg_temp.s()->'skills') x), 2, 'no L0 or L1 skill');
select is(pg_temp.s()->'skills'->0->>'id', pg_temp.sk(1), 'the L4 skill comes first');
select is((pg_temp.s()->'skills'->0->'evidence'->>'entries')::integer, 1, 'evidence: its one confirmed entry');
select is((pg_temp.s()->'skills'->0->'evidence'->>'endorsements')::integer, 6, 'evidence: its visible endorsements (not the hidden one)');

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
select is((select array_agg(x->>'title' order by ord) from jsonb_array_elements(pg_temp.s()->'projects') with ordinality t(x, ord)),
  array['Timetable', 'Library', 'Canteen'], 'completed ventures first, then in progress; unlisted, recruiting and unverified former ones left out');
select is(pg_temp.s()->'projects'->0->>'repository', 'Private repository', 'a private repository isn''t named');
select is(pg_temp.s()->'projects'->2->>'repository', 'org/public-app', 'a public repository is');
select is((pg_temp.s()->'projects'->0->>'deliverables')::integer, 3, 'deliverables are counted');
select is(position('deliverable.example' in pg_temp.s()::text), 0, 'deliverable links never appear (PRD 5.28)');
select is(pg_temp.s()->'projects'->1->>'role', 'former_member', 'a venture the student left is marked');
select is((pg_temp.s()->'projects'->0->>'verified_entries')::integer, 2, 'peer-verified entries are counted');
select is((pg_temp.s()->'projects'->0->>'team_size')::integer, 3, 'team size');
select ok((pg_temp.s()->'projects'->0->>'owner')::boolean, 'the owner is marked');
select is(pg_temp.s()->'projects'->0->>'description', 'Team-written description of Timetable', 'the team''s description is frozen in');

-- ---------------------------------------------------------------------------
-- Open-source work, endorsements, credentials
-- ---------------------------------------------------------------------------
select is(jsonb_array_length(pg_temp.s()->'open_source'), 2, 'only pull requests that count');
select is(pg_temp.s()->'open_source'->0->>'repository', 'org/lib', 'a public pull request names its repository');
select is(pg_temp.s()->'open_source'->1, jsonb_build_object('repository', 'Private repository', 'number', null,
  'merged', pg_temp.s()->'open_source'->1->>'merged', 'skills', '[]'::jsonb), 'a private one shows neither name nor number');
select is(jsonb_array_length(pg_temp.s()->'endorsements'), 5, 'at most 5 endorsements');
select is(pg_temp.s()->'endorsements'->0->>'endorser', 'Student 16', 'the highest-tier endorser comes first');
select is(pg_temp.s()->'endorsements'->0->>'note', 'Best on the team', 'with the teammate''s note');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.s()->'endorsements') x where x->>'endorser' = 'Student 11'), 1,
  'one endorsement per endorser');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.s()->'endorsements') x where x->>'endorser' = 'Student 17'), 0,
  'hidden endorsements stay off');
select is((select array_agg(x->>'title') from jsonb_array_elements(pg_temp.s()->'credentials') x), array['Cloud Practitioner'],
  'only approved credentials that haven''t expired');
select is(pg_temp.s()->'credentials'->0->>'issuer', (select name from public.recognised_issuers where id = 'aws'), 'the recognised issuer''s name');

-- ---------------------------------------------------------------------------
-- Settings: percentile follows the leaderboard opt-out unless chosen; email is opt-in
-- ---------------------------------------------------------------------------
update public.profiles set leaderboard_opt_out = true where user_id = pg_temp.u('S');
select is(private.cv_snapshot(pg_temp.u('S'))->'standing', '{"tier": "spark", "top_percent": null}'::jsonb,
  'opted out of the leaderboard: tier only, by default');
insert into public.cv_settings (user_id, show_percentile, show_email, sections)
values (pg_temp.u('S'), true, true, array['skills', 'summary']);
select is((private.cv_snapshot(pg_temp.u('S'))->'standing'->>'top_percent')::integer, 12, 'switched back on in CV settings');
select is(private.cv_snapshot(pg_temp.u('S'))->'person'->>'email', 'cv01@nutech.edu.pk', 'the university email, when shown');
select is(private.cv_snapshot(pg_temp.u('S'))->'sections', '["skills", "summary"]'::jsonb, 'chosen sections, in the chosen order');
update public.ranking_scores set percentile = 0.3 where user_id = pg_temp.u('S');
select is(private.cv_snapshot(pg_temp.u('S'))->'standing'->'top_percent', 'null'::jsonb, 'no percentile outside the top half');
select throws_ok($$insert into public.cv_settings (user_id, sections) values (pg_temp.u('O'), array['skills', 'skills'])$$,
  '23514', null, 'sections can''t repeat');
select is(private.cv_snapshot(pg_temp.u('B')), null, 'no CV for a banned account');

-- ---------------------------------------------------------------------------
-- Keys and issuing
-- ---------------------------------------------------------------------------
select private.cv_install_key('cv-20261001-aaaaaaaa', repeat('A', 43), 'private-one');
select private.cv_install_key('cv-20261002-bbbbbbbb', repeat('B', 43), 'private-two');
select is((select array_agg(key_id order by key_id) from public.signing_keys where retired_at is null and key_id like 'cv-2026100%'),
  array['cv-20261002-bbbbbbbb'], 'installing a key retires the old one');
select is((select count(*)::integer from vault.secrets where name = 'cv_signing_key:cv-20261001-aaaaaaaa'), 0,
  'the retired key''s private half is deleted from Vault');
select is((select key_id || ':' || private_key from private.cv_active_key()), 'cv-20261002-bbbbbbbb:private-two', 'the active key signs');

create function pg_temp.commit(p_code text, p_hash text, p_source text) returns uuid language sql as $$
  select private.cv_issue_commit(pg_temp.u('S'), p_code, 'cv-20261001-aaaaaaaa', date_trunc('second', now()),
    date_trunc('second', now()) + interval '12 months', (select s from snap), p_hash, repeat('c', 64), repeat('A', 86), p_source)
$$;
select isnt(pg_temp.commit('AAAAAAAAAA', repeat('1', 64), 'first'), null, 'the first CV is issued (a retired key''s records stay valid)');
select is(pg_temp.commit('AAAAAAAAAB', repeat('2', 64), 'first'), null, '"first" issues nothing once a CV exists');
select is(pg_temp.commit('AAAAAAAAAC', repeat('1', 64), 'monthly'), null, 'the monthly refresh skips an unchanged snapshot');
select isnt(pg_temp.commit('AAAAAAAAAD', repeat('3', 64), 'monthly'), null, 'and issues a changed one');
select is((select array_agg(version || ':' || (superseded_by is not null) order by version) from public.cv_records where user_id = pg_temp.u('S')),
  array['1:true', '2:false'], 'the new version supersedes the old');
select throws_ok($$select pg_temp.commit('AAAAAAAAAD', repeat('4', 64), 'on_demand')$$, '23505', null,
  'a code clash raises, so the worker retries with a new code');

select is(private.cv_refresh_start(true), 1, 'the monthly refresh queues every student with a CV');
select pgmq.purge_queue('cv_jobs');

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
create function pg_temp.as_user(p text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;
select pg_temp.as_user('O');
select is((select count(*)::integer from public.cv_records where user_id = pg_temp.u('S')), 0, 'others can''t read a student''s records');
select pg_temp.as_user('S');
select is((select count(*)::integer from public.cv_records), 2, 'the owner reads their own');
select throws_ok($$insert into public.cv_settings (user_id) values (pg_temp.u('S'))$$, '42501', null, 'settings aren''t written directly');
select throws_ok($$insert into public.signing_keys (key_id, public_key) values ('cv-20261003-cccccccc', repeat('C', 43))$$, '42501', null,
  'nobody adds a signing key over the API');
select throws_ok($$select private.cv_snapshot(pg_temp.u('S'))$$, '42501', null, 'the private functions aren''t reachable');
reset role;
set local role anon;
select ok((select count(*) from public.signing_keys where key_id = 'cv-20261001-aaaaaaaa') = 1, 'anyone reads the public keys');
select throws_ok($$select count(*) from public.cv_records$$, '42501', null, 'anonymous visitors can''t read records');
reset role;

select * from finish();
rollback;
