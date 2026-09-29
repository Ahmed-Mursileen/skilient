-- The nightly ranking run (PRD 5.13; decisions.md 2026-09-30): committed batches, rings,
-- rapid-gain holds (clear and uphold), the completion exemption, formula changes, Sunday
-- snapshots, penalties from /ops, exam periods pausing decay, and who may read what.
--
-- A gains points fast; B is A's teammate; C-D and E-F-G endorse each other with no outside
-- evidence (rings); H-I do the same on a completed venture with a deliverable (not a ring);
-- P and Q complete ventures; X is inactive. T and U are trust reviewers, M a moderator,
-- K accounts staff (all on two-factor).
begin;
select plan(80);

insert into auth.users (id, email)
select ('93400000-0000-0000-0000-0000000000' || x.k)::uuid, x.k || 'nightly@' || x.domain
  from (values ('a1', 'nutech.edu.pk'), ('b1', 'nutech.edu.pk'), ('c1', 'nutech.edu.pk'), ('d1', 'nutech.edu.pk'),
               ('e1', 'nutech.edu.pk'), ('f1', 'nutech.edu.pk'), ('f2', 'nutech.edu.pk'), ('a2', 'nutech.edu.pk'),
               ('b2', 'nutech.edu.pk'), ('c2', 'nutech.edu.pk'), ('d2', 'nutech.edu.pk'), ('e2', 'nutech.edu.pk'),
               ('a3', 'nu.edu.pk'), ('b3', 'nutech.edu.pk'), ('c3', 'nutech.edu.pk'), ('d3', 'nutech.edu.pk')) as x(k, domain);
update public.profiles set onboarding_complete = true, username = 'nt_' || right(user_id::text, 2)
 where user_id::text like '93400000-%';

create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('93400000-0000-0000-0000-0000000000' || case p
    when 'A' then 'a1' when 'B' then 'b1' when 'C' then 'c1' when 'D' then 'd1' when 'E' then 'e1' when 'F' then 'f1'
    when 'G' then 'f2' when 'H' then 'a2' when 'I' then 'b2' when 'P' then 'c2' when 'Q' then 'd2' when 'X' then 'e2'
    when 'T' then 'a3' when 'U' then 'b3' when 'M' then 'c3' when 'K' then 'd3' end)::uuid
$$;
create function pg_temp.v(p text) returns uuid language sql immutable as $$ select md5('venture-' || p)::uuid $$;
create function pg_temp.pkt(p text) returns timestamptz language sql immutable as $$ select (p || ' Asia/Karachi')::timestamptz $$;
create function pg_temp.day(p text) returns text language sql as $$ select private.ranking_run_all(pg_temp.pkt(p || ' 12:00')) $$;
create function pg_temp.as_user(p text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.total(p text) returns numeric language sql security definer as $$
  select total from public.ranking_scores where user_id = pg_temp.u(p)
$$;
create function pg_temp.gain_flag(p text) returns uuid language sql security definer as $$
  select id from public.anti_gaming_flags where kind = 'rapid_gain' and user_id = pg_temp.u(p) and status = 'open'
$$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.staff_roles (user_id, role, granted_by) values
  (pg_temp.u('T'), 'trust_reviewer', pg_temp.u('T')), (pg_temp.u('U'), 'trust_reviewer', pg_temp.u('U')),
  (pg_temp.u('M'), 'moderator', pg_temp.u('M')), (pg_temp.u('K'), 'accounts', pg_temp.u('K'));

-- ---------------------------------------------------------------------------
-- Ventures and entries
-- ---------------------------------------------------------------------------
insert into public.ventures (id, type, owner_id, university_id, title, description, status, created_at)
select pg_temp.v(x.k), 'project', pg_temp.u(x.owner), p.university_id, 'Venture ' || x.k, 'Nightly test', 'in_progress',
       pg_temp.pkt('2026-06-01 12:00')
  from (values ('VA', 'A'), ('VR', 'C'), ('VQ', 'E'), ('VH', 'H'), ('VP', 'P'), ('VP2', 'P'), ('VP3', 'P')) as x(k, owner)
  join public.profiles p on p.user_id = pg_temp.u(x.owner);
insert into public.venture_members (venture_id, user_id)
select pg_temp.v(x.k), pg_temp.u(x.who)
  from (values ('VA', 'A'), ('VA', 'B'), ('VR', 'C'), ('VR', 'D'), ('VQ', 'E'), ('VQ', 'F'), ('VQ', 'G'), ('VH', 'H'), ('VH', 'I'),
               ('VP', 'P'), ('VP', 'Q'), ('VP2', 'P'), ('VP2', 'Q'), ('VP3', 'P'), ('VP3', 'Q')) as x(k, who);
insert into public.venture_deliverables (venture_id, label, url)
select pg_temp.v(k), 'App', 'https://' || lower(k) || '.example' from unnest(array['VH', 'VP', 'VP2', 'VP3']) k;

-- Each (venture, author) has one manual entry confirmed by a teammate, dated 1 June.
insert into public.contributions (id, venture_id, user_id, kind, description, created_at)
select md5(x.k || x.who)::uuid, pg_temp.v(x.k), pg_temp.u(x.who), 'code', 'Built part of it', pg_temp.pkt('2026-06-01 13:00')
  from (values ('VA', 'A'), ('VH', 'H'), ('VH', 'I'), ('VP', 'P'), ('VP', 'Q'), ('VP2', 'P'), ('VP2', 'Q'), ('VP3', 'P'), ('VP3', 'Q')) as x(k, who);
insert into public.contribution_confirmations (contribution_id, confirmer_id, created_at)
select md5(x.k || x.who)::uuid, pg_temp.u(x.by), pg_temp.pkt('2026-06-02 13:00')
  from (values ('VA', 'A', 'B'), ('VH', 'H', 'I'), ('VH', 'I', 'H'), ('VP', 'P', 'Q'), ('VP', 'Q', 'P'), ('VP2', 'P', 'Q'),
               ('VP2', 'Q', 'P'), ('VP3', 'P', 'Q'), ('VP3', 'Q', 'P')) as x(k, who, by);
update public.ventures set status = 'completed', completed_at = pg_temp.pkt('2026-07-01 12:00') where id = pg_temp.v('VH');

-- Mutual endorsements: C-D (VR) and E-F-G (VQ), no outside evidence; H-I on the completed VH.
insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, created_at)
select pg_temp.u(x.a), pg_temp.u(x.b), pg_temp.v(x.k), 'react', pg_temp.pkt(x.at)
  from (values ('C', 'D', 'VR', '2026-06-10 10:00'), ('D', 'C', 'VR', '2026-10-20 10:00'),
               ('E', 'F', 'VQ', '2026-09-01 10:00'), ('F', 'E', 'VQ', '2026-09-02 10:00'), ('E', 'G', 'VQ', '2026-09-03 10:00'),
               ('G', 'E', 'VQ', '2026-09-04 10:00'), ('F', 'G', 'VQ', '2026-09-05 10:00'), ('G', 'F', 'VQ', '2026-09-06 10:00'),
               ('H', 'I', 'VH', '2026-07-02 10:00'), ('I', 'H', 'VH', '2026-07-02 11:00')) as x(a, b, k, at);

-- A's skills are set by hand (A's only points).
delete from public.user_skills where user_id = pg_temp.u('A');
insert into public.user_skills (user_id, skill_id, level) values (pg_temp.u('A'), 'python', 2);

-- Committed batches of 5 (a formula version with a small batch size).
insert into public.platform_config (key, version, value, reason, effective_at)
select 'ranking.formula', 2, jsonb_set(value, '{batch_size}', '5'), 'pgTAP: small batches', now()
  from private.ranking_formula();

-- ---------------------------------------------------------------------------
-- Day 1 (Monday 2 November): the first run
-- ---------------------------------------------------------------------------
select is(pg_temp.day('2026-11-02'), 'done', 'the run finishes');
select is((select row(students, steps, formula_version)::text from public.ranking_runs where run_on = '2026-11-02'), '(16,6,2)',
  '16 students in batches of 5: rings, 4 student steps, tiers');
select is((select row(status, rows)::text from public.job_runs where job = 'ranking-nightly' order by started_at desc limit 1),
  '(succeeded,16)', 'the run is recorded in job_runs');
select is((select count(*)::integer from public.ranking_scores where user_id::text like '93400000-%'), 16, 'every student has a published score');
select is((select row(total, ranked, tier)::text from public.ranking_scores where user_id = pg_temp.u('A')), '(15.00,t,raw)',
  'A: 15 points, ranked, Raw');
select is((select row(ranked, tier)::text from public.ranking_scores where user_id = pg_temp.u('X')), '(f,)', 'X is not ranked yet');
select is((select count(*)::integer from public.anti_gaming_flags where kind = 'rapid_gain'), 0, 'first computations are never held');
select is((select array_agg(cardinality(members) || ':' || cardinality(endorsement_ids) order by cardinality(members))
             from public.anti_gaming_flags where kind = 'ring' and status = 'open'), array['2:2', '3:6'],
  'two rings: C-D (2 endorsements) and E-F-G (6)');
select is((select count(*)::integer from public.anti_gaming_flags where kind = 'ring' and members @> array[pg_temp.u('H')]), 0,
  'H-I endorsed through a completed venture with a deliverable: not a ring');
select is((select components->'endorsements'->'items'->0->>'ring' from public.ranking_scores where user_id = pg_temp.u('C')), 'true',
  'a ring endorsement is marked');
select is((select (components->'endorsements'->>'points')::numeric from public.ranking_scores where user_id = pg_temp.u('C')), 0::numeric,
  'and counts 0');
select is((select (components->'endorsements'->>'points')::numeric from public.ranking_scores where user_id = pg_temp.u('H')), 3.75::numeric,
  'H-I count, halved for being mutual: 15 x 0.5 x 0.5');

-- Staff reads and decisions on rings.
set local role authenticated;
select pg_temp.as_user('M');
select throws_ok($$ select * from public.ranking_flag_queue() $$, '42501', null, 'moderators don''t work ranking flags');
select pg_temp.as_user('T', 'aal1');
select throws_ok($$ select * from public.ranking_flag_queue() $$, '42501', null, 'trust reviewers need two-factor');
select pg_temp.as_user('T');
select is((select count(*)::integer from public.ranking_flag_queue() where kind = 'ring'), 2, 'the queue lists both rings');
select pg_temp.remember('cd', (select id from public.ranking_flag_queue() where kind = 'ring' and endorsements = 2));
select is((select jsonb_array_length(public.ranking_flag_case(pg_temp.id('cd'))->'endorsements')), 2, 'the case shows the endorsements');
select throws_ok($$ select public.review_ranking_flag(pg_temp.id('cd'), false, 'Honest team') $$, '55000', null, 'claim before deciding');
select lives_ok($$ select public.claim_ranking_flag(pg_temp.id('cd'), true) $$, 'T claims the C-D ring');
select pg_temp.as_user('U');
select throws_ok($$ select public.claim_ranking_flag(pg_temp.id('cd'), true) $$, '55000', null, 'U can''t take a claimed flag');
select pg_temp.as_user('T');
select throws_ok($$ select public.review_ranking_flag(pg_temp.id('cd'), false, 'no') $$, '22023', null, 'a reason is needed');
select lives_ok($$ select public.review_ranking_flag(pg_temp.id('cd'), false, 'Real teammates; the venture just started') $$,
  'T clears it');
reset role;
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('E'), 'trust_reviewer', pg_temp.u('T'));
set local role authenticated;
select pg_temp.as_user('E');
select throws_ok($$ select public.claim_ranking_flag((select id from public.ranking_flag_queue() where kind = 'ring' limit 1), true) $$,
  '42501', null, 'nobody reviews a flag about themselves');
reset role;
delete from public.staff_roles where user_id = pg_temp.u('E');
select is((select array_agg(action order by action) from public.ops_audit_log where staff_id = pg_temp.u('T')),
  array['ranking_flag.claim', 'ranking_flag.clear'], 'claim and clear are audited');

-- ---------------------------------------------------------------------------
-- Day 2: A gains 200 points in a day and is held; the cleared ring counts again
-- ---------------------------------------------------------------------------
insert into public.user_skills (user_id, skill_id, level)
select pg_temp.u('A'), s, 4 from unnest(array['html', 'css', 'javascript', 'typescript', 'java', 'go', 'rust', 'kotlin']) s;
select is(pg_temp.day('2026-11-03'), 'done', 'day 2 runs');
select is((select row(total, held, held_total)::text from public.ranking_scores where user_id = pg_temp.u('A')), '(15.00,t,215.00)',
  'A''s gain of 200 is held: the published score stays at the day before');
select is((select detail->>'reason' || ' ' || (detail->>'gain') from public.anti_gaming_flags where id = pg_temp.gain_flag('A')), 'gain 200.00',
  'a rapid-gain flag records the gain');
select is((select (components->'endorsements'->>'points')::numeric from public.ranking_scores where user_id = pg_temp.u('C')), 3.75::numeric,
  'the cleared ring''s endorsement counts again: 15 x 0.5 (D isn''t ranked) x 0.5 (mutual)');

-- A new endorsement between C and D is flagged on its own; day 3 keeps A held.
insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, created_at)
values (pg_temp.u('C'), pg_temp.u('D'), pg_temp.v('VR'), 'vue', pg_temp.pkt('2026-11-03 18:00'));
select is(pg_temp.day('2026-11-04'), 'done', 'day 3 runs');
select is(pg_temp.total('A'), 15.00::numeric, 'still held while the flag is open');
select is((select count(*)::integer from public.anti_gaming_flags where kind = 'rapid_gain' and user_id = pg_temp.u('A')), 1,
  'one open flag at a time');
select is((select cardinality(endorsement_ids) from public.anti_gaming_flags
            where kind = 'ring' and status = 'open' and members @> array[pg_temp.u('C')]), 1,
  'the new C-D endorsement is a new flag; the cleared ones stay cleared');

-- T clears A's gain; E, F and G add GitHub work to VQ (outside evidence).
set local role authenticated;
select pg_temp.as_user('T');
select public.claim_ranking_flag(pg_temp.gain_flag('A'), true);
select lives_ok($$ select public.review_ranking_flag(pg_temp.gain_flag('A'), false, 'Skills verified from real commits') $$, 'T clears A''s gain');
reset role;
insert into public.contributions (venture_id, user_id, kind, description, source, commit_sha, created_at)
select pg_temp.v('VQ'), pg_temp.u(w), 'code', 'Commit', 'github', substr(md5(w) || md5(w || '!'), 1, 40), pg_temp.pkt('2026-11-04 10:00')
  from unnest(array['E', 'F', 'G']) w;

select is(pg_temp.day('2026-11-05'), 'done', 'day 4 runs');
select is((select row(total, held)::text from public.ranking_scores where user_id = pg_temp.u('A')), '(215.00,f)',
  'a cleared gain counts from the next run');
select is((select count(*)::integer from public.anti_gaming_flags where kind = 'rapid_gain' and user_id = pg_temp.u('A') and applied_at is not null), 1,
  'and the decision is marked as applied');
select is((select row(status, reviewed_by is null)::text from public.anti_gaming_flags where kind = 'ring' and members @> array[pg_temp.u('E')]),
  '(cleared,t)', 'the E-F-G ring closes itself once their ventures have outside evidence');

-- ---------------------------------------------------------------------------
-- Days 5-6: another fast gain, upheld
-- ---------------------------------------------------------------------------
insert into public.user_skills (user_id, skill_id, level)
select pg_temp.u('A'), s, 4 from unnest(array['react', 'vue', 'django', 'flask', 'docker', 'kubernetes', 'aws', 'redis']) s;
select is(pg_temp.day('2026-11-06'), 'done', 'day 5 runs');
select is((select (detail->>'gain')::numeric from public.anti_gaming_flags where id = pg_temp.gain_flag('A')), 241.50::numeric,
  'A is held again: (15 + 400) x 1.1 = 456.50, a gain of 241.50');
set local role authenticated;
select pg_temp.as_user('T');
select public.claim_ranking_flag(pg_temp.gain_flag('A'), true);
select lives_ok($$ select public.review_ranking_flag(pg_temp.gain_flag('A'), true, 'Levels set without the evidence behind them') $$,
  'T upholds it');
reset role;
select is((select points from public.ranking_adjustments where user_id = pg_temp.u('A') and kind = 'rapid_gain'), -241.50::numeric,
  'upholding records a negative adjustment equal to the held gain');
select is(pg_temp.day('2026-11-07'), 'done', 'day 6 runs');
select is((select row(total, adjustments, held)::text from public.ranking_scores where user_id = pg_temp.u('A')), '(215.00,-241.50,f)',
  'the upheld gain is cancelled out');

-- ---------------------------------------------------------------------------
-- Days 7-8: completions. One is exempt; three in 7 days are held.
-- ---------------------------------------------------------------------------
update public.ventures set status = 'completed', completed_at = pg_temp.pkt('2026-11-07 18:00') where id = pg_temp.v('VP');
select is(pg_temp.day('2026-11-08'), 'done', 'day 7 (Sunday) runs');
select is((select row(held, (components->'work'->>'points')::numeric)::text from public.ranking_scores where user_id = pg_temp.u('P')),
  '(f,180.38)', 'P''s completion (150 x 0.925 x 1.3) counts at once: completions are exempt');
select is((select count(*)::integer from public.ranking_snapshots where week = '2026-11-08'), 16, 'Sunday: a snapshot of every student');
select is((select components from public.ranking_snapshots where week = '2026-11-08' and user_id = pg_temp.u('A')),
  '{"work": 0, "total": 215.00, "skills": 456.50, "credentials": 0, "momentum": 0.00, "adjustments": -241.50, "endorsements": 0}'::jsonb,
  'snapshots keep the points per component');
select is((select stage from public.ranking_runs where run_on = '2026-11-08'), 'done', 'the Sunday run passes through the snapshot');

update public.ventures set status = 'completed', completed_at = pg_temp.pkt('2026-11-08 18:00') where id in (pg_temp.v('VP2'), pg_temp.v('VP3'));
select is(pg_temp.day('2026-11-09'), 'done', 'day 8 runs');
select is((select detail->>'reason' from public.anti_gaming_flags where id = pg_temp.gain_flag('P')), 'completions',
  'three completions in 7 days are held for review');
select is((select held from public.ranking_scores where user_id = pg_temp.u('P')), true, 'P''s score is held');

-- ---------------------------------------------------------------------------
-- Day 9: a new formula version is applied to everyone without holds
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason, effective_at)
select 'ranking.formula', 3, value, 'pgTAP: a new version', now() from private.ranking_formula();
delete from public.user_skills where user_id = pg_temp.u('B');
insert into public.user_skills (user_id, skill_id, level)
select pg_temp.u('B'), s, 4 from unnest(array['html', 'css', 'javascript', 'typescript', 'java', 'go', 'rust', 'kotlin']) s;
select is(pg_temp.day('2026-11-10'), 'done', 'day 9 runs');
select is((select row(formula_version, held, total >= 200)::text from public.ranking_scores where user_id = pg_temp.u('B')), '(3,f,t)',
  'B''s 200-point gain lands with the formula change, not held');
select is((select held from public.ranking_scores where user_id = pg_temp.u('P')), true, 'an open flag still holds P');

-- ---------------------------------------------------------------------------
-- Penalties: an upheld report costs points by severity
-- ---------------------------------------------------------------------------
insert into public.posts (id, author_id, university_id, audience, type, body, created_at)
select md5('a-post')::uuid, pg_temp.u('A'), p.university_id, 'university', 'general', 'Selling answers', now()
  from public.profiles p where p.user_id = pg_temp.u('A');
set local role authenticated;
select pg_temp.as_user('B', 'aal1');
select public.submit_report('post', md5('a-post')::uuid, 'spam', 'Selling answers');
select pg_temp.as_user('M');
select pg_temp.remember('case', (select id from public.ops_queue() limit 1));
select public.claim_case(pg_temp.id('case'), true);
select throws_ok($$ select public.resolve_case(pg_temp.id('case'), 'remove', 'Selling exam answers') $$, '22023', null,
  'removing needs a severity');
select throws_ok($$ select public.resolve_case(pg_temp.id('case'), 'remove', 'Selling exam answers', 'extreme') $$, '22023', null,
  'low, medium or high only');
select lives_ok($$ select public.resolve_case(pg_temp.id('case'), 'remove', 'Selling exam answers', 'medium') $$, 'removed, medium');
reset role;
select is((select row(kind, severity, case_id = pg_temp.id('case'), staff_id = pg_temp.u('M'))::text from public.ranking_adjustments
            where user_id = pg_temp.u('A') and kind = 'penalty'), '(penalty,medium,t,t)', 'the owner gets a penalty tied to the case');
select is((select after->>'severity' from public.ops_audit_log where action = 'report.remove' and target_id = pg_temp.id('case')::text),
  'medium', 'the severity is in the audit log');
select is((private.compute_ranking(pg_temp.u('A'))->'adjustments'->>'points')::numeric, -391.50::numeric,
  'A''s adjustments: -241.50 upheld gain - 150 penalty');

-- ---------------------------------------------------------------------------
-- Exam periods (accounts staff) pause decay
-- ---------------------------------------------------------------------------
insert into public.posts (author_id, university_id, audience, type, body, created_at)
select pg_temp.u('X'), p.university_id, 'university', 'general', 'An old post', pg_temp.pkt('2026-10-01 10:00')
  from public.profiles p where p.user_id = pg_temp.u('X');
select is((private.compute_ranking(pg_temp.u('X'), pg_temp.pkt('2026-11-10 12:00'), null, 0)->'momentum'->>'points')::numeric, 9.40::numeric,
  'X: 10 points, 40 days inactive -> 3 weeks of decay -> 9.40');

set local role authenticated;
select pg_temp.as_user('T');
select throws_ok($$ select public.add_exam_period((select university_id from public.profiles where user_id = pg_temp.u('X')),
  '2026-10-05', '2026-11-03', 'Mid-terms') $$, '42501', null, 'trust reviewers don''t enter exam periods');
select pg_temp.as_user('K', 'aal1');
select throws_ok($$ select * from public.exam_period_list() $$, '42501', null, 'accounts staff need two-factor');
select pg_temp.as_user('K');
select throws_ok($$ select public.add_exam_period(private.current_university_id(), '2026-10-01', '2026-11-20', 'Too long') $$,
  '22023', null, 'at most 45 days');
select throws_ok($$ select public.add_exam_period(private.current_university_id(), '2026-10-05', '2026-10-01', 'Backwards') $$,
  '22023', null, 'the end is on or after the start');
select lives_ok($$ select pg_temp.remember('exam', public.add_exam_period(private.current_university_id(), '2026-10-05', '2026-11-03', 'Mid-terms')) $$,
  'K enters NUTECH''s mid-terms');
select throws_ok($$ select public.add_exam_period(private.current_university_id(), '2026-11-01', '2026-11-05', 'Overlap') $$,
  '23514', null, 'periods don''t overlap');
select lives_ok($$ select public.add_exam_period((select id from public.universities where name like '%FAST-NUCES%'), '2026-10-05', '2026-10-20', 'FAST mid-terms') $$,
  'and FAST''s');
select is((select count(*)::integer from public.exam_period_list()), 2, 'K lists them');
reset role;
select is((private.compute_ranking(pg_temp.u('X'), pg_temp.pkt('2026-11-10 12:00'), null, 0)->'momentum'->>'points')::numeric, 10.00::numeric,
  'with 30 exam days, X has only 10 inactive days: no decay');
set local role authenticated;
select pg_temp.as_user('X', 'aal1');
select is((select count(*)::integer from public.exam_periods), 1, 'a student sees their own university''s exam periods only');
select pg_temp.as_user('K');
select lives_ok($$ select public.remove_exam_period(pg_temp.id('exam'), 'Entered for the wrong term') $$, 'K removes one');
reset role;
select is((select array_agg(action order by action) from public.ops_audit_log where staff_id = pg_temp.u('K')),
  array['exam_period.add', 'exam_period.add', 'exam_period.remove'], 'every exam-period change is audited');

-- ---------------------------------------------------------------------------
-- Who reads what
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('A', 'aal1');
select is((select array_agg(user_id) from public.ranking_scores), array[pg_temp.u('A')], 'a student reads only their own score');
select is((select count(*)::integer from public.ranking_snapshots where user_id <> pg_temp.u('A')), 0, 'and only their own snapshots');
select throws_ok($$ update public.ranking_scores set total = 2500 $$, '42501', null, 'nobody writes a score');
select throws_ok($$ select 1 from public.anti_gaming_flags $$, '42501', null, 'flags are staff-only, through functions');
select throws_ok($$ select 1 from public.ranking_adjustments $$, '42501', null, 'adjustments are read only through the score');
select throws_ok($$ select 1 from public.ranking_runs $$, '42501', null, 'runs are internal');
select throws_ok($$ select 1 from public.venture_completions $$, '42501', null, 'completion records are internal');
select throws_ok($$ select public.add_exam_period(private.current_university_id(), '2026-12-01', '2026-12-10', 'Mine') $$,
  '42501', null, 'students can''t enter exam periods');
reset role;

select * from finish();
rollback;
