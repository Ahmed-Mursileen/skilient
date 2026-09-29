-- Formula v1 on 10 reference students (PRD 5.13 "Done when"). Every number below is worked
-- out by hand in docs/ranking-reference.md; this file builds exactly that data and checks
-- compute_ranking() gives the same points, component by component, as of Wednesday
-- 9 December 2026, 12:00 PKT.
begin;
select plan(92);

-- R1-R10 are the reference students (R7 at FAST-NUCES, the rest at NUTECH); Q1-Q10 answer
-- surveys, apply to ventures and (for R10) endorse.
insert into auth.users (id, email)
select ('93200000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'rr' || i || case when i = 7 then '@nu.edu.pk' else '@nutech.edu.pk' end
  from generate_series(1, 10) i;
insert into auth.users (id, email)
select ('93200000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'rq' || i || '@nutech.edu.pk'
  from generate_series(1, 10) i;
update public.profiles set onboarding_complete = true, username = 'rf_' || right(user_id::text, 4)
 where user_id::text like '93200000-%';

create function pg_temp.r(i integer) returns uuid language sql immutable as $$
  select ('93200000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid
$$;
create function pg_temp.q(i integer) returns uuid language sql immutable as $$
  select ('93200000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
$$;
create function pg_temp.v(i integer) returns uuid language sql immutable as $$
  select ('93200000-0000-0000-0000-00000000a00' || i)::uuid
$$;
create function pg_temp.sha(p text) returns text language sql immutable as $$ select substr(md5(p) || md5(p || '!'), 1, 40) $$;
create function pg_temp.pkt(p text) returns timestamptz language sql immutable as $$ select (p || ' Asia/Karachi')::timestamptz $$;
create function pg_temp.score(p_user uuid, p_peak numeric default 0) returns jsonb language sql as $$
  select private.compute_ranking(p_user, pg_temp.pkt('2026-12-09 12:00'), null, p_peak)
$$;
create function pg_temp.pts(p jsonb, p_component text) returns numeric language sql immutable as $$
  select (p->p_component->>'points')::numeric
$$;

-- ---------------------------------------------------------------------------
-- Ventures. V1 (owner R1; R2, R3, R4) and V2 (owner R5; R6) complete; V3 (owner R2; R3, R9,
-- R10) is in progress; V4 (owner R7; R8) is completed without a second verified member, so
-- it fails the completion rules; V5 and V8 are recruiting ventures of R5 and R8.
-- ---------------------------------------------------------------------------
insert into public.ventures (id, type, owner_id, university_id, title, description, status, skill_ids, created_at)
select pg_temp.v(x.i), 'project', x.owner, p.university_id, x.title, 'Reference venture', 'in_progress', x.skills, pg_temp.pkt(x.created)
  from (values
    (1, pg_temp.r(1), 'Timetable', array['react', 'typescript', 'python', 'docker'], '2026-06-01 12:00'),
    (2, pg_temp.r(5), 'Canteen', array['python', 'django', 'postgresql', 'pytest', 'go', 'gin', 'docker', 'redis'], '2026-07-01 12:00'),
    (3, pg_temp.r(2), 'Library', array['react'], '2026-05-01 12:00'),
    (4, pg_temp.r(7), 'Hostel', array['html', 'css'], '2026-08-01 12:00'),
    (5, pg_temp.r(5), 'Bus routes', array['python'], '2026-11-01 12:00'),
    (8, pg_temp.r(8), 'Study groups', array['sql'], '2026-09-01 12:00')
  ) as x(i, owner, title, skills, created)
  join public.profiles p on p.user_id = x.owner;
update public.ventures set status = 'recruiting' where id in (pg_temp.v(5), pg_temp.v(8));
insert into public.venture_members (venture_id, user_id) values
  (pg_temp.v(1), pg_temp.r(1)), (pg_temp.v(1), pg_temp.r(2)), (pg_temp.v(1), pg_temp.r(3)), (pg_temp.v(1), pg_temp.r(4)),
  (pg_temp.v(2), pg_temp.r(5)), (pg_temp.v(2), pg_temp.r(6)),
  (pg_temp.v(3), pg_temp.r(2)), (pg_temp.v(3), pg_temp.r(3)), (pg_temp.v(3), pg_temp.r(9)), (pg_temp.v(3), pg_temp.r(10)),
  (pg_temp.v(4), pg_temp.r(7)), (pg_temp.v(4), pg_temp.r(8)),
  (pg_temp.v(5), pg_temp.r(5)), (pg_temp.v(8), pg_temp.r(8));
insert into public.venture_deliverables (venture_id, label, url) values
  (pg_temp.v(1), 'App', 'https://timetable.example'),
  (pg_temp.v(2), 'App', 'https://canteen.example'), (pg_temp.v(2), 'Repo', 'https://canteen.example/repo'),
  (pg_temp.v(2), 'Demo', 'https://canteen.example/demo'), (pg_temp.v(2), 'Docs', 'https://canteen.example/docs'),
  (pg_temp.v(4), 'App', 'https://hostel.example');

-- Contribution entries: (who, venture, source, when, confirmed by, confirmed when).
create temp table fx_entries (tag text, author uuid, venture uuid, source text, at timestamptz, confirmer uuid, confirmed_at timestamptz);
insert into fx_entries values
  -- V1: R1 4 verified; R2 2 GitHub days + 2 unconfirmed; R3 1 verified + 2 unconfirmed; R4 2 unconfirmed.
  ('r1a', pg_temp.r(1), pg_temp.v(1), 'manual', pg_temp.pkt('2026-06-10 10:00'), pg_temp.r(2), pg_temp.pkt('2026-09-21 10:00')),
  ('r1b', pg_temp.r(1), pg_temp.v(1), 'manual', pg_temp.pkt('2026-07-15 10:00'), pg_temp.r(2), pg_temp.pkt('2026-09-21 10:00')),
  ('r1c', pg_temp.r(1), pg_temp.v(1), 'manual', pg_temp.pkt('2026-09-14 10:00'), pg_temp.r(2), pg_temp.pkt('2026-09-21 10:00')),
  ('r1d', pg_temp.r(1), pg_temp.v(1), 'manual', pg_temp.pkt('2026-09-21 09:00'), pg_temp.r(2), pg_temp.pkt('2026-09-21 10:00')),
  ('r2a', pg_temp.r(2), pg_temp.v(1), 'github', pg_temp.pkt('2026-09-10 10:00'), null, null),
  ('r2b', pg_temp.r(2), pg_temp.v(1), 'github', pg_temp.pkt('2026-09-10 16:00'), null, null),
  ('r2c', pg_temp.r(2), pg_temp.v(1), 'github', pg_temp.pkt('2026-09-11 10:00'), null, null),
  ('r2d', pg_temp.r(2), pg_temp.v(1), 'manual', pg_temp.pkt('2026-09-12 10:00'), null, null),
  ('r2e', pg_temp.r(2), pg_temp.v(1), 'manual', pg_temp.pkt('2026-09-13 10:00'), null, null),
  ('r3a', pg_temp.r(3), pg_temp.v(1), 'manual', pg_temp.pkt('2026-08-20 10:00'), pg_temp.r(1), pg_temp.pkt('2026-09-15 10:00')),
  ('r3b', pg_temp.r(3), pg_temp.v(1), 'manual', pg_temp.pkt('2026-08-21 10:00'), null, null),
  ('r3c', pg_temp.r(3), pg_temp.v(1), 'manual', pg_temp.pkt('2026-08-22 10:00'), null, null),
  ('r4a', pg_temp.r(4), pg_temp.v(1), 'manual', pg_temp.pkt('2026-09-01 10:00'), null, null),
  ('r4b', pg_temp.r(4), pg_temp.v(1), 'manual', pg_temp.pkt('2026-09-05 10:00'), null, null),
  -- V2: R5 3 verified; R6 3 GitHub days.
  ('r5a', pg_temp.r(5), pg_temp.v(2), 'manual', pg_temp.pkt('2026-07-10 10:00'), pg_temp.r(6), pg_temp.pkt('2026-07-25 10:00')),
  ('r5b', pg_temp.r(5), pg_temp.v(2), 'manual', pg_temp.pkt('2026-07-15 10:00'), pg_temp.r(6), pg_temp.pkt('2026-07-25 10:00')),
  ('r5c', pg_temp.r(5), pg_temp.v(2), 'manual', pg_temp.pkt('2026-07-20 10:00'), pg_temp.r(6), pg_temp.pkt('2026-07-25 10:00')),
  ('r6a', pg_temp.r(6), pg_temp.v(2), 'github', pg_temp.pkt('2026-07-05 10:00'), null, null),
  ('r6b', pg_temp.r(6), pg_temp.v(2), 'github', pg_temp.pkt('2026-07-06 10:00'), null, null),
  ('r6c', pg_temp.r(6), pg_temp.v(2), 'github', pg_temp.pkt('2026-07-07 10:00'), null, null),
  -- V3 (in progress).
  ('r2f', pg_temp.r(2), pg_temp.v(3), 'github', pg_temp.pkt('2026-11-10 10:00'), null, null),
  ('r2g', pg_temp.r(2), pg_temp.v(3), 'manual', pg_temp.pkt('2026-11-24 10:00'), null, null),
  ('r3d', pg_temp.r(3), pg_temp.v(3), 'manual', pg_temp.pkt('2026-10-12 10:00'), pg_temp.r(2), pg_temp.pkt('2026-10-13 10:00')),
  ('r9a', pg_temp.r(9), pg_temp.v(3), 'manual', pg_temp.pkt('2026-12-02 10:00'), pg_temp.r(2), pg_temp.pkt('2026-12-03 10:00')),
  ('r10a', pg_temp.r(10), pg_temp.v(3), 'github', pg_temp.pkt('2026-06-01 10:00'), null, null),
  -- V4: R8's five unconfirmed entries (R7's 20 confirmed ones are added below).
  ('r8a', pg_temp.r(8), pg_temp.v(4), 'manual', pg_temp.pkt('2026-09-29 10:00'), null, null),
  ('r8b', pg_temp.r(8), pg_temp.v(4), 'manual', pg_temp.pkt('2026-10-13 10:00'), null, null),
  ('r8c', pg_temp.r(8), pg_temp.v(4), 'manual', pg_temp.pkt('2026-10-27 10:00'), null, null),
  ('r8d', pg_temp.r(8), pg_temp.v(4), 'manual', pg_temp.pkt('2026-11-10 10:00'), null, null),
  ('r8e', pg_temp.r(8), pg_temp.v(4), 'manual', pg_temp.pkt('2026-11-24 10:00'), null, null);
insert into fx_entries
select 'r7_' || i, pg_temp.r(7), pg_temp.v(4), 'manual', pg_temp.pkt('2026-09-15 10:00'), pg_temp.r(8), pg_temp.pkt('2026-09-16 10:00')
  from generate_series(1, 20) i;

insert into public.contributions (id, venture_id, user_id, kind, description, source, commit_sha, created_at)
select md5(e.tag)::uuid, e.venture, e.author, 'code', 'Reference entry ' || e.tag, e.source::public.contribution_source,
       case when e.source = 'github' then pg_temp.sha(e.tag) end, e.at
  from fx_entries e;
insert into public.contribution_confirmations (contribution_id, confirmer_id, created_at)
select md5(e.tag)::uuid, e.confirmer, e.confirmed_at from fx_entries e where e.confirmer is not null;

update public.ventures set status = 'completed', completed_at = pg_temp.pkt('2026-09-21 12:00') where id = pg_temp.v(1);
update public.ventures set status = 'completed', completed_at = pg_temp.pkt('2026-07-29 12:00') where id = pg_temp.v(2);
update public.ventures set status = 'completed', completed_at = pg_temp.pkt('2026-12-01 12:00') where id = pg_temp.v(4);
-- Completion posts "Shipped" with today's date; the reference dates everything by hand.
delete from public.posts where type = 'shipped' and venture_id in (pg_temp.v(1), pg_temp.v(2), pg_temp.v(4));

-- ---------------------------------------------------------------------------
-- Pull requests: R2 3 counted (+1 in their own repo); R6 25 counted.
-- ---------------------------------------------------------------------------
insert into public.github_pull_requests (user_id, repo_github_id, number, pr_github_id, repo_full_name, repo_private, merged_at,
                                         approver_github_id, counted, exclusion)
values
  (pg_temp.r(2), 93201, 1, 9320101, 'org/one', false, pg_temp.pkt('2026-10-05 10:00'), 77, true, null),
  (pg_temp.r(2), 93201, 2, 9320102, 'org/one', false, pg_temp.pkt('2026-10-06 10:00'), 77, true, null),
  (pg_temp.r(2), 93202, 1, 9320201, 'org/two', false, pg_temp.pkt('2026-11-11 10:00'), 77, true, null),
  (pg_temp.r(2), 93203, 1, 9320301, 'rr2/own', false, pg_temp.pkt('2026-11-12 10:00'), null, false, 'own_repo');
insert into public.github_pull_requests (user_id, repo_github_id, number, pr_github_id, repo_full_name, repo_private, merged_at,
                                         approver_github_id, counted, exclusion)
select pg_temp.r(6), 93206, i, 9320600 + i, 'org/six', false,
       case when i <= 13 then pg_temp.pkt('2026-10-01 10:00') else pg_temp.pkt('2026-10-28 10:00') end, 77, true, null
  from generate_series(1, 25) i;

-- ---------------------------------------------------------------------------
-- Posts and survey answers: (post, author, when, answers). Each answer is an Informative
-- tick unless it's one of p5b's five crosses.
-- ---------------------------------------------------------------------------
create temp table fx_posts (tag text, author uuid, at timestamptz, answers integer);
insert into fx_posts values
  ('p1', pg_temp.r(1), pg_temp.pkt('2026-12-01 10:00'), 10),
  ('p2', pg_temp.r(2), pg_temp.pkt('2026-10-20 10:00'), 4),
  ('p5a', pg_temp.r(5), pg_temp.pkt('2026-11-02 10:00'), 10),
  ('p5b', pg_temp.r(5), pg_temp.pkt('2026-11-03 10:00'), 10),
  ('p5c', pg_temp.r(5), pg_temp.pkt('2026-11-20 10:00'), 6),
  ('p7', pg_temp.r(7), pg_temp.pkt('2026-09-30 12:00'), 10),
  ('p8a', pg_temp.r(8), pg_temp.pkt('2026-09-22 10:00'), 10),
  ('p8b', pg_temp.r(8), pg_temp.pkt('2026-10-06 10:00'), 10),
  ('p8c', pg_temp.r(8), pg_temp.pkt('2026-10-20 10:00'), 10),
  ('p8d', pg_temp.r(8), pg_temp.pkt('2026-11-03 10:00'), 10),
  ('p8e', pg_temp.r(8), pg_temp.pkt('2026-11-17 10:00'), 10),
  ('p8f', pg_temp.r(8), pg_temp.pkt('2026-12-01 10:00'), 10),
  ('p8g', pg_temp.r(8), pg_temp.pkt('2026-12-08 10:00'), 10);
insert into public.posts (id, author_id, university_id, audience, type, body, created_at)
select md5(x.tag)::uuid, x.author, p.university_id, 'university', 'general', 'Reference post ' || x.tag, x.at
  from fx_posts x join public.profiles p on p.user_id = x.author;
insert into public.micro_survey_assignments (post_id, user_id, question_id, dimension)
select md5(x.tag)::uuid, pg_temp.q(i), (select min(id) from public.micro_survey_questions where dimension = 'informative'), 'informative'
  from fx_posts x cross join generate_series(1, 10) i
 where i <= x.answers;
insert into public.micro_survey_responses (post_id, user_id, question_id, dimension, answer, latency_ms, weight, created_at, locked_at)
select a.post_id, a.user_id, a.question_id, a.dimension,
       not (a.post_id = md5('p5b')::uuid and a.user_id in (pg_temp.q(6), pg_temp.q(7), pg_temp.q(8), pg_temp.q(9), pg_temp.q(10))),
       1500, 1, x.at + interval '1 hour', x.at + interval '70 minutes'
  from public.micro_survey_assignments a join fx_posts x on md5(x.tag)::uuid = a.post_id;
-- Q1-Q4 are R5's friends: p5c's six answers include only two from non-friends.
insert into public.friendships (user_id_a, user_id_b) select pg_temp.r(5), pg_temp.q(i) from generate_series(1, 4) i;

-- ---------------------------------------------------------------------------
-- Join requests answered (R1: 3 within 72 h + 1 after; R5: 12; R8: 11), credentials,
-- endorsements, penalties, an exam period at FAST-NUCES.
-- ---------------------------------------------------------------------------
insert into public.application_threads (venture_id, candidate_id, owner_id, status, message, created_at, decided_at)
select pg_temp.v(1), pg_temp.q(i), pg_temp.r(1), case when i % 2 = 0 then 'accepted' else 'declined' end::public.application_status,
       'Can I join?', pg_temp.pkt('2026-06-05 10:00'), pg_temp.pkt('2026-06-05 10:00') + case when i = 4 then interval '80 hours' else interval '1 day' end
  from generate_series(1, 4) i;
insert into public.application_threads (venture_id, candidate_id, owner_id, status, message, created_at, decided_at)
select pg_temp.v(5), case when i <= 10 then pg_temp.q(i) else pg_temp.r(i - 10) end, pg_temp.r(5), 'declined', 'Can I join?',
       pg_temp.pkt('2026-11-24 10:00') + make_interval(days => i - 1), pg_temp.pkt('2026-11-24 10:00') + make_interval(days => i - 1, hours => 20)
  from generate_series(1, 12) i;
insert into public.application_threads (venture_id, candidate_id, owner_id, status, message, created_at, decided_at)
select pg_temp.v(8), case when i <= 10 then pg_temp.q(i) else pg_temp.r(1) end, pg_temp.r(8), 'declined', 'Can I join?',
       pg_temp.pkt('2026-10-01 10:00'), pg_temp.pkt('2026-10-02 10:00')
  from generate_series(1, 11) i;

insert into public.credentials (user_id, title, issuer, issued_on, expires_on, file_path, file_type, file_bytes, status,
                                recognised_issuer_id, reviewed_at)
select x.u, x.title, 'Issuer', date '2026-01-10', x.expires, x.u::text || '/' || gen_random_uuid()::text || '.pdf', 'pdf', 1000,
       x.status::public.credential_status, x.issuer, case when x.status <> 'pending' then pg_temp.pkt('2026-02-01 10:00') end
  from (values
    (pg_temp.r(1), 'Cloud Practitioner', null::date, 'approved', 'aws'),
    (pg_temp.r(1), 'Local course', null, 'approved', null),
    (pg_temp.r(1), 'Old course', date '2026-12-08', 'approved', null),
    (pg_temp.r(1), 'Waiting', null, 'pending', null),
    (pg_temp.r(5), 'Python', null, 'approved', 'google'),
    (pg_temp.r(5), 'Django', null, 'approved', 'microsoft'),
    (pg_temp.r(5), 'SQL', null, 'approved', 'oracle'),
    (pg_temp.r(8), 'Freelancing', date '2026-12-09', 'approved', 'nftp')
  ) as x(u, title, expires, status, issuer);

insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, created_at, hidden, hidden_at) values
  (pg_temp.r(2), pg_temp.r(1), pg_temp.v(1), 'react', pg_temp.pkt('2026-09-22 10:00'), false, null),
  (pg_temp.r(3), pg_temp.r(1), pg_temp.v(1), 'typescript', pg_temp.pkt('2026-09-22 10:00'), false, null),
  (pg_temp.r(1), pg_temp.r(2), pg_temp.v(1), 'react', pg_temp.pkt('2026-09-22 10:00'), false, null),
  (pg_temp.r(4), pg_temp.r(2), pg_temp.v(1), 'javascript', pg_temp.pkt('2026-09-22 10:00'), false, null),
  (pg_temp.r(3), pg_temp.r(2), pg_temp.v(1), 'python', pg_temp.pkt('2026-09-22 10:00'), true, pg_temp.pkt('2026-09-23 10:00')),
  (pg_temp.r(6), pg_temp.r(5), pg_temp.v(2), 'python', pg_temp.pkt('2026-07-30 10:00'), false, null),
  (pg_temp.r(5), pg_temp.r(6), pg_temp.v(2), 'go', pg_temp.pkt('2026-07-30 10:00'), false, null),
  (pg_temp.r(7), pg_temp.r(8), pg_temp.v(4), 'sql', pg_temp.pkt('2026-12-02 10:00'), false, null);
insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, created_at)
select pg_temp.q(i), pg_temp.r(10), pg_temp.v(3), s.skill, pg_temp.pkt('2026-11-01 10:00')
  from generate_series(1, 10) i cross join (values ('rust'), ('go')) as s(skill);

insert into public.ranking_adjustments (user_id, kind, severity, reason, created_at) values
  (pg_temp.r(3), 'penalty', 'low', 'Spam in comments', pg_temp.pkt('2026-11-01 10:00')),
  (pg_temp.r(3), 'penalty', 'medium', 'Older, expired', pg_temp.pkt('2025-11-01 10:00')),
  (pg_temp.r(9), 'penalty', 'high', 'Harassment', pg_temp.pkt('2026-12-01 10:00'));

insert into public.exam_periods (university_id, starts_on, ends_on, reason)
select p.university_id, date '2026-10-15', date '2026-11-13', 'Mid-terms' from public.profiles p where p.user_id = pg_temp.r(7);

-- Endorsers' tiers from "the previous run".
insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked, tier,
                                   computed_at, published_at)
select x.u, 1, '{}'::jsonb, 0, 0, 0, 0, true, x.tier::public.ranking_tier, now(), now()
  from (values (pg_temp.r(1), 'shine'), (pg_temp.r(2), 'spark'), (pg_temp.r(5), 'flare'), (pg_temp.r(6), 'radiant')) as x(u, tier)
union all
select pg_temp.q(i), 1, '{}'::jsonb, 0, 0, 0, 0, true, 'luminary', now(), now() from generate_series(1, 10) i;

-- Skill levels last: the triggers above recompute them from evidence.
delete from public.user_skills where user_id::text like '93200000-%';
insert into public.user_skills (user_id, skill_id, level)
select x.u, x.skill, x.level
  from (values
    (pg_temp.r(1), 'react', 3), (pg_temp.r(1), 'typescript', 2), (pg_temp.r(1), 'python', 4), (pg_temp.r(1), 'docker', 2),
    (pg_temp.r(1), 'rust', 1),
    (pg_temp.r(2), 'react', 2), (pg_temp.r(2), 'javascript', 2),
    (pg_temp.r(3), 'sql', 2),
    (pg_temp.r(5), 'python', 3), (pg_temp.r(5), 'django', 3), (pg_temp.r(5), 'postgresql', 2), (pg_temp.r(5), 'pytest', 2),
    (pg_temp.r(6), 'go', 4), (pg_temp.r(6), 'gin', 3), (pg_temp.r(6), 'docker', 3), (pg_temp.r(6), 'redis', 2),
    (pg_temp.r(6), 'kubernetes', 2),
    (pg_temp.r(7), 'html', 2), (pg_temp.r(7), 'css', 2),
    (pg_temp.r(9), 'rust', 2)
  ) as x(u, skill, level);
insert into public.user_skills (user_id, skill_id, level)
select pg_temp.r(10), s, 4
  from unnest(array['rust', 'go', 'python', 'java', 'kotlin', 'swift', 'react', 'vue', 'django', 'flask', 'numpy', 'pandas',
                    'pytorch', 'docker', 'kubernetes', 'terraform', 'aws', 'postgresql', 'redis', 'linting', 'jest']) as s;

create temp table fx_scores as
select i, pg_temp.score(pg_temp.r(i), case i when 7 then 220 else 0 end) as s from generate_series(1, 10) i;
create function pg_temp.s(i integer) returns jsonb language sql as $$ select s from fx_scores where fx_scores.i = $1 $$;

-- ---------------------------------------------------------------------------
-- Completion records and complexity
-- ---------------------------------------------------------------------------
select is((select row(team_size, weeks, skill_tags, deliverables, verified_members)::text from public.venture_completions where venture_id = pg_temp.v(1)),
  '(4,16.00,4,1,3)', 'V1 is frozen at completion: 4 members, 16 weeks, 4 tags, 1 deliverable, 3 verified members');
select is(private.venture_complexity(4, 16, 4, 1, (select value from private.ranking_formula())), 1.05,
  'V1 complexity = 0.8 + 0.5 x avg(0.5, 1, 0.5, 0) = 1.05');
select is(private.venture_complexity(2, 4, 8, 4, (select value from private.ranking_formula())), 1.075,
  'V2 complexity = 0.8 + 0.5 x avg(0, 0.2, 1, 1) = 1.075');
select is((select array_agg(row(github_days, verified_entries, unconfirmed_entries)::text order by user_id)
             from public.venture_completion_members where venture_id = pg_temp.v(1)),
  array['(0,4,0)', '(2,0,2)', '(0,1,2)', '(0,0,2)'], 'V1 units: R1 4, R2 2 GitHub days + 2 x 0.25, R3 1 + 2 x 0.25, R4 2 x 0.25');
select is((select verified_members from public.venture_completions where venture_id = pg_temp.v(4)), 1::smallint,
  'V4 was completed with one verified member');

-- ---------------------------------------------------------------------------
-- R1: creator, skills across 3 categories, a mutual and a one-way endorsement, credentials.
-- ---------------------------------------------------------------------------
select is(pg_temp.pts(pg_temp.s(1), 'work'), 204.75, 'R1 work: 150 x 1.05 x 1.3 x share 1');
select is(pg_temp.pts(pg_temp.s(1), 'skills'), 82.50, 'R1 skills: (20 + 15 + 25 + 15) x 1.1; L1 counts 0');
select is(pg_temp.pts(pg_temp.s(1), 'endorsements'), 12.75, 'R1 endorsements: 15 x 0.7 x 0.5 (mutual) + 15 x 0.5');
select is(pg_temp.pts(pg_temp.s(1), 'credentials'), 100.00, 'R1 credentials: 60 (AWS) + 40; expired and pending ones don''t count');
select is(pg_temp.pts(pg_temp.s(1), 'momentum'), 114.00, 'R1 momentum: content 80 + 2 active weeks + 3 quick answers and 1 confirmation');
select is(pg_temp.pts(pg_temp.s(1), 'adjustments'), 0::numeric, 'R1 has no adjustments');
select is((pg_temp.s(1)->>'total')::numeric, 514.00, 'R1 total 514.00');
select is(pg_temp.s(1)->'momentum'->'citizenship', '{"joins": 3, "points": 14, "confirmations": 1}'::jsonb,
  'R1 citizenship: an answer after 80 hours doesn''t count');

-- R2: GitHub member of V1, pull requests, a hidden endorsement.
select is(pg_temp.pts(pg_temp.s(2), 'work'), 187.50, 'R2 work: 157.50 (share 2.5 / 2 capped at 1) + 3 PRs x 10');
select is(pg_temp.pts(pg_temp.s(2), 'skills'), 30.00, 'R2 skills: 2 categories, no bonus');
select is(pg_temp.pts(pg_temp.s(2), 'endorsements'), 15.75, 'R2 endorsements: 15 x 1.1 x 0.5 + 15 x 0.5; the hidden one counts 0');
select is(pg_temp.pts(pg_temp.s(2), 'credentials'), 0::numeric, 'R2 has no credentials');
select is(pg_temp.pts(pg_temp.s(2), 'momentum'), 52.00, 'R2 momentum: 4 active weeks + 6 confirmations; a post with 4 answers is not scored');
select is(pg_temp.pts(pg_temp.s(2), 'adjustments'), 0::numeric, 'R2 has no adjustments');
select is((pg_temp.s(2)->>'total')::numeric, 285.25, 'R2 total 285.25');
select is((pg_temp.s(2)->'work'->'prs'->>'count')::integer, 3, 'a PR in the student''s own repository doesn''t count');

-- R3: partial share, decay, an active and an expired penalty.
select is(pg_temp.pts(pg_temp.s(3), 'work'), 118.13, 'R3 work: 157.50 x 1.5 / 2 = 118.125');
select is(pg_temp.pts(pg_temp.s(3), 'skills'), 15.00, 'R3 skills');
select is(pg_temp.pts(pg_temp.s(3), 'endorsements'), 0::numeric, 'R3 endorsements');
select is(pg_temp.pts(pg_temp.s(3), 'credentials'), 0::numeric, 'R3 credentials');
select is(pg_temp.pts(pg_temp.s(3), 'momentum'), 8.80, 'R3 momentum: 10, 58 days inactive = 6 full weeks after day 14 -> x 0.88');
select is(pg_temp.pts(pg_temp.s(3), 'adjustments'), -50::numeric, 'R3 adjustments: the low penalty; the 13-month-old one expired');
select is((pg_temp.s(3)->>'total')::numeric, 91.93, 'R3 total 91.93');
select is((pg_temp.s(3)->'momentum'->'decay'->>'weeks')::integer, 6, 'R3 decays 6 weeks');

-- R4: unconfirmed entries only.
select is(pg_temp.pts(pg_temp.s(4), 'work'), 39.38, 'R4 work: 157.50 x 0.5 / 2 = 39.375');
select is(pg_temp.pts(pg_temp.s(4), 'skills'), 0::numeric, 'R4 skills');
select is(pg_temp.pts(pg_temp.s(4), 'endorsements'), 0::numeric, 'R4 endorsements');
select is(pg_temp.pts(pg_temp.s(4), 'credentials'), 0::numeric, 'R4 credentials');
select is(pg_temp.pts(pg_temp.s(4), 'momentum'), 0::numeric, 'R4 momentum: nothing in the last 12 weeks');
select is(pg_temp.pts(pg_temp.s(4), 'adjustments'), 0::numeric, 'R4 adjustments');
select is((pg_temp.s(4)->>'total')::numeric, 39.38, 'R4 total 39.38');
select is((pg_temp.s(4)->'facts'->>'peer_verified_entries')::integer, 0, 'R4 has no peer-verified contribution: not ranked yet');

-- R5: two-person creator, content quality with friends' answers set aside, citizenship cap.
select is(pg_temp.pts(pg_temp.s(5), 'work'), 209.63, 'R5 work: 150 x 1.075 x 1.3 = 209.625');
select is(pg_temp.pts(pg_temp.s(5), 'skills'), 77.00, 'R5 skills: 70 x 1.1 (4 categories)');
select is(pg_temp.pts(pg_temp.s(5), 'endorsements'), 9.75, 'R5 endorsements: 15 x 1.3 x 0.5');
select is(pg_temp.pts(pg_temp.s(5), 'credentials'), 125.00, 'R5 credentials: 3 x 60 capped at 125');
select is(pg_temp.pts(pg_temp.s(5), 'momentum'), 166.98, 'R5 momentum: 67.5 x log2(3) + 20 + 40');
select is(pg_temp.pts(pg_temp.s(5), 'adjustments'), 0::numeric, 'R5 adjustments');
select is((pg_temp.s(5)->>'total')::numeric, 588.36, 'R5 total 588.36');
select is((select array_agg((x->>'index')::numeric order by x->>'index') from jsonb_array_elements(pg_temp.s(5)->'momentum'->'content'->'posts') x),
  array[55.00, 80.00], 'R5''s scored posts: indexes 80 and 55; the one with 2 non-friend answers is left out');

-- R6: member of V2, pull requests capped, decay.
select is(pg_temp.pts(pg_temp.s(6), 'work'), 361.25, 'R6 work: 161.25 + 25 PRs capped at 200');
select is(pg_temp.pts(pg_temp.s(6), 'skills'), 104.50, 'R6 skills: 95 x 1.1');
select is(pg_temp.pts(pg_temp.s(6), 'endorsements'), 6.75, 'R6 endorsements: 15 x 0.9 x 0.5');
select is(pg_temp.pts(pg_temp.s(6), 'credentials'), 0::numeric, 'R6 credentials');
select is(pg_temp.pts(pg_temp.s(6), 'momentum'), 23.92, 'R6 momentum: 2 active weeks + 3 confirmations = 26, 42 days inactive = 4 weeks -> x 0.92');
select is(pg_temp.pts(pg_temp.s(6), 'adjustments'), 0::numeric, 'R6 adjustments');
select is((pg_temp.s(6)->>'total')::numeric, 496.42, 'R6 total 496.42');
select is((pg_temp.s(6)->'work'->'prs'->>'points')::numeric, 200::numeric, 'R6 PR points are capped at 200');

-- R7: a venture that fails the completion rules; decay paused by exams, held up by the floor.
select is(pg_temp.pts(pg_temp.s(7), 'work'), 0::numeric, 'R7 work: V4 had one verified member, so it doesn''t count');
select is(pg_temp.pts(pg_temp.s(7), 'skills'), 30.00, 'R7 skills');
select is(pg_temp.pts(pg_temp.s(7), 'endorsements'), 0::numeric, 'R7 endorsements');
select is(pg_temp.pts(pg_temp.s(7), 'credentials'), 0::numeric, 'R7 credentials');
select is(pg_temp.pts(pg_temp.s(7), 'momentum'), 88.00, 'R7 momentum: 90 x 0.94 = 84.60, but never below 40% of the 220 peak');
select is(pg_temp.pts(pg_temp.s(7), 'adjustments'), 0::numeric, 'R7 adjustments');
select is((pg_temp.s(7)->>'total')::numeric, 118.00, 'R7 total 118.00');
select is(pg_temp.s(7)->'momentum'->'decay'->'exam_days', '30'::jsonb, 'R7: 30 of the 70 days since the last activity were exam days');
select is(pg_temp.pts(pg_temp.score(pg_temp.r(7), 0), 'momentum'), 84.60, 'R7 without the floor: 40 inactive days -> 3 weeks -> 84.60');

-- R8: content, consistency and citizenship all capped; a credential expiring today.
select is(pg_temp.pts(pg_temp.s(8), 'work'), 0::numeric, 'R8 work');
select is(pg_temp.pts(pg_temp.s(8), 'skills'), 0::numeric, 'R8 skills');
select is(pg_temp.pts(pg_temp.s(8), 'endorsements'), 7.50, 'R8 endorsements: 15 x 0.5 from an unranked endorser');
select is(pg_temp.pts(pg_temp.s(8), 'credentials'), 60.00, 'R8 credentials: recognised, expiring today still counts');
select is(pg_temp.pts(pg_temp.s(8), 'momentum'), 375.00, 'R8 momentum: 175 + 120 + 80 = 375 (every cap)');
select is(pg_temp.pts(pg_temp.s(8), 'adjustments'), 0::numeric, 'R8 adjustments');
select is((pg_temp.s(8)->>'total')::numeric, 442.50, 'R8 total 442.50');
select is(pg_temp.s(8)->'momentum'->'content'->'points', '175.00'::jsonb, 'R8 content: 80 x log2(8) = 240 capped at 175');

-- R9: a high penalty takes the total to 0, never below.
select is(pg_temp.pts(pg_temp.s(9), 'work'), 0::numeric, 'R9 work');
select is(pg_temp.pts(pg_temp.s(9), 'skills'), 15.00, 'R9 skills');
select is(pg_temp.pts(pg_temp.s(9), 'endorsements'), 0::numeric, 'R9 endorsements');
select is(pg_temp.pts(pg_temp.s(9), 'credentials'), 0::numeric, 'R9 credentials');
select is(pg_temp.pts(pg_temp.s(9), 'momentum'), 10.00, 'R9 momentum');
select is(pg_temp.pts(pg_temp.s(9), 'adjustments'), -300::numeric, 'R9 adjustments: high severity');
select is((pg_temp.s(9)->>'total')::numeric, 0.00, 'R9 total 0.00 (25 - 300, floored)');

-- R10: skills and endorsements capped.
select is(pg_temp.pts(pg_temp.s(10), 'work'), 0::numeric, 'R10 work');
select is(pg_temp.pts(pg_temp.s(10), 'skills'), 500.00, 'R10 skills: 21 x 25 x 1.1 capped at 500');
select is(pg_temp.pts(pg_temp.s(10), 'endorsements'), 375.00, 'R10 endorsements: 20 x 15 x 1.5 capped at 375');
select is(pg_temp.pts(pg_temp.s(10), 'credentials'), 0::numeric, 'R10 credentials');
select is(pg_temp.pts(pg_temp.s(10), 'momentum'), 0::numeric, 'R10 momentum');
select is(pg_temp.pts(pg_temp.s(10), 'adjustments'), 0::numeric, 'R10 adjustments');
select is((pg_temp.s(10)->>'total')::numeric, 875.00, 'R10 total 875.00');

-- ---------------------------------------------------------------------------
-- Facts the tiers read, and evidence the score page links to
-- ---------------------------------------------------------------------------
select is(pg_temp.s(1)->'facts', '{"hire": false, "max_level": 4, "active_ventures": 1, "completed_ventures": 1, "teacher_endorsement": false, "counting_endorsements": 2, "peer_verified_entries": 4}'::jsonb,
  'R1 facts');
select is(pg_temp.s(2)->'facts'->'active_ventures', '2'::jsonb, 'R2 is active in V1 and V3');
select is((pg_temp.s(1)->'work'->'ventures'->0->>'venture_id')::uuid, pg_temp.v(1), 'Work lists the venture behind its points');
select is((pg_temp.s(3)->'adjustments'->'items'->0->>'severity'), 'low', 'Adjustments list each penalty');
select is(jsonb_array_length(pg_temp.s(1)->'credentials'->'items'), 2, 'Credentials list the two that count');
select is((select sum((x->>'points')::numeric) from jsonb_array_elements(pg_temp.s(2)->'endorsements'->'items') x), 15.75,
  'the endorsement items add up to the component');

-- ---------------------------------------------------------------------------
-- Reproducible: the same data gives the same score; the exam period is what paused R7
-- ---------------------------------------------------------------------------
select is(pg_temp.score(pg_temp.r(5)), pg_temp.s(5), 'computing again gives the same result');
delete from public.exam_periods;
select is(pg_temp.pts(pg_temp.score(pg_temp.r(7), 0), 'momentum'), 75.60, 'without the exam period R7 decays 8 weeks: 75.60');

select * from finish();
rollback;
