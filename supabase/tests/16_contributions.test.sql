-- Contribution log (PRD 5.14) and the completion rule (PRD 5.15). A owns a public venture
-- with B as a member; C is a NUTECH outsider; D studies at FAST. A second, university-only
-- venture checks who reads the log.
begin;
select plan(38);

insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('91000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('91000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('91000000-0000-0000-0000-00000000000d', 'd@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'k_' || right(user_id::text, 2)
 where user_id::text like '91000000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

set local role authenticated;
select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select pg_temp.remember('v1', public.create_venture('{"type":"project","title":"Timetable","description":"d"}'));
select pg_temp.remember('v2', public.create_venture('{"type":"project","title":"Inside","description":"d","visibility":"university"}'));
reset role;
insert into public.venture_members (venture_id, user_id) values
  (current_setting('test.v1')::uuid, '91000000-0000-0000-0000-00000000000b'),
  (current_setting('test.v2')::uuid, '91000000-0000-0000-0000-00000000000b');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Logging
-- ---------------------------------------------------------------------------
select pg_temp.as_user('91000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', 'Not mine') $$, '42501', null,
  'a non-member cannot log a contribution');

select pg_temp.as_user('91000000-0000-0000-0000-00000000000b');
select lives_ok($$ select pg_temp.remember('b1', public.log_contribution(pg_temp.v('v1'), 'code',
  'Wrote the timetable parser', 'https://github.com/example/timetable/pull/3', 6)) $$,
  'a member logs a contribution with evidence and hours');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', repeat('x', 501)) $$, '23514', null,
  'descriptions are at most 500 characters');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', 'x', 'javascript:alert(1)') $$, '23514', null,
  'evidence must be an http(s) link');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', 'x', null, 0) $$, '23514', null,
  'hours must be positive');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', '   ') $$, '23514', null,
  'an empty description is refused');

-- Insert-only: no direct writes at all.
select throws_ok($$ insert into public.contributions (venture_id, user_id, kind, description)
  values (pg_temp.v('v1'), '91000000-0000-0000-0000-00000000000b', 'code', 'direct') $$, '42501', null,
  'no direct inserts');
select throws_ok($$ update public.contributions set description = 'edited' where id = pg_temp.v('b1') $$, '42501', null,
  'no updates, even by the author');
select throws_ok($$ delete from public.contributions where id = pg_temp.v('b1') $$, '42501', null,
  'no deletes, even by the author');
select throws_ok($$ insert into public.contribution_confirmations (contribution_id, confirmer_id)
  values (pg_temp.v('b1'), '91000000-0000-0000-0000-00000000000b') $$, '42501', null,
  'no direct confirmations');

-- ---------------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------------
select results_eq($$ select peer_verified, confirmations from public.contributions_with_status where id = pg_temp.v('b1') $$,
  $$ values (false, 0) $$, 'an unconfirmed entry is self-reported');
select throws_ok($$ select public.confirm_contribution(pg_temp.v('b1')) $$, '42501', null,
  'the author cannot confirm their own entry');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.confirm_contribution(pg_temp.v('b1')) $$, '42501', null,
  'a non-member cannot confirm');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.confirm_contribution(pg_temp.v('b1')) $$, 'a teammate confirms');
select lives_ok($$ select public.confirm_contribution(pg_temp.v('b1')) $$, 'confirming twice is harmless');
select results_eq($$ select peer_verified, confirmations, confirmed_by_me from public.contributions_with_status
  where id = pg_temp.v('b1') $$, $$ values (true, 1, true) $$, 'a confirmed entry is peer-verified');

-- ---------------------------------------------------------------------------
-- Corrections
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.correct_contribution(pg_temp.v('b1'), 'code', 'Not my entry') $$, '42501', null,
  'only the author can correct an entry');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000b');
select lives_ok($$ select pg_temp.remember('b1fix', public.correct_contribution(pg_temp.v('b1'), 'code',
  'Wrote the timetable parser and its tests', 'https://github.com/example/timetable/pull/3', 8)) $$,
  'the author corrects within 24 hours');
select results_eq($$ select description, hours, corrected_at is not null, peer_verified
  from public.contributions_with_status where id = pg_temp.v('b1') $$,
  $$ values ('Wrote the timetable parser and its tests'::text, 8.00::numeric, true, false) $$,
  'the timeline shows the correction, which needs its own confirmation');
select is((select count(*)::integer from public.contributions where id in (pg_temp.v('b1'), pg_temp.v('b1fix'))), 2,
  'the original stays on the record');
select throws_ok($$ select public.correct_contribution(pg_temp.v('b1fix'), 'code', 'again') $$, '22023', null,
  'a correction is made against the original');
reset role;
update public.contributions set created_at = now() - interval '25 hours' where id = current_setting('test.b1')::uuid;
set local role authenticated;
select throws_ok($$ select public.correct_contribution(pg_temp.v('b1'), 'code', 'too late') $$, '55000', null,
  'corrections after 24 hours are refused');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.confirm_contribution(pg_temp.v('b1')) $$, 'the teammate confirms the corrected version');
select is((select peer_verified from public.contributions_with_status where id = pg_temp.v('b1')), true,
  'the corrected entry is peer-verified again');

-- ---------------------------------------------------------------------------
-- Who reads the log
-- ---------------------------------------------------------------------------
select pg_temp.as_user('91000000-0000-0000-0000-00000000000b');
select public.log_contribution(pg_temp.v('v2'), 'docs', 'Wrote the README');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.contributions where venture_id = pg_temp.v('v1')), 2,
  'anyone who can see a public venture reads its log');
select is((select count(*)::integer from public.contributions where venture_id = pg_temp.v('v2')), 0,
  'a student at another university cannot read a university-only venture''s log');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000c');
select is((select count(*)::integer from public.contributions_with_status where venture_id = pg_temp.v('v2')), 1,
  'a student at its university can');

-- ---------------------------------------------------------------------------
-- GitHub-sourced entries
-- ---------------------------------------------------------------------------
reset role;
insert into public.github_installations (installation_id, account_id, account_login, account_type) values (9101, 9101, 'kb', 'User');
insert into public.github_repos (repo_id, full_name, owner_id, private) values (91001, 'kb/timetable', 9101, false);
insert into public.github_user_repos (user_id, repo_id, installation_id) values
  ('91000000-0000-0000-0000-00000000000a', 91001, 9101),
  ('91000000-0000-0000-0000-00000000000b', 91001, 9101);
-- Commits from before the venture: within 6 months they come in as "before Skilient".
insert into public.github_commits (user_id, repo_id, sha, occurred_at, seen_via, status, meaningful_lines) values
  ('91000000-0000-0000-0000-00000000000b', 91001, repeat('0', 40), now() - interval '7 months', 'harvest', 'counted', 40),
  ('91000000-0000-0000-0000-00000000000b', 91001, repeat('1', 40), now() - interval '30 days', 'harvest', 'counted', 40),
  ('91000000-0000-0000-0000-00000000000b', 91001, repeat('2', 40), now(), 'harvest', 'counted', 25);
set local role authenticated;
select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.link_venture_repo(pg_temp.v('v1'), 91001) $$, 'the owner links the repository');
select results_eq($$ select user_id::text, commit_sha, before_venture, peer_verified from public.contributions_with_status
  where venture_id = pg_temp.v('v1') and source = 'github' order by commit_sha $$,
  $$ values ('91000000-0000-0000-0000-00000000000b', repeat('1', 40), true, false),
            ('91000000-0000-0000-0000-00000000000b', repeat('2', 40), false, true) $$,
  'linking imports counted commits from 6 months before the venture (unverified) and since (verified); older ones never');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.confirm_contribution(
  (select id from public.contributions where commit_sha = repeat('1', 40))) $$, '42501', null,
  'the author cannot confirm their own pre-venture commit');
select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.confirm_contribution(
  (select id from public.contributions where commit_sha = repeat('1', 40))) $$, 'a teammate confirms a pre-venture commit');
select is((select peer_verified from public.contributions_with_status where commit_sha = repeat('1', 40)), true,
  'which then counts as peer-verified');
reset role;
insert into public.github_commits (user_id, repo_id, sha, occurred_at, seen_via, status, meaningful_lines) values
  ('91000000-0000-0000-0000-00000000000a', 91001, repeat('3', 40), now(), 'push', 'pending', 12);
set local role authenticated;
select is((select count(*)::integer from public.contributions where commit_sha = repeat('3', 40)), 0,
  'a commit waiting to be analysed is not an entry yet');
reset role;
update public.github_commits set status = 'counted' where sha = repeat('3', 40);
update public.github_commits set status = 'counted' where sha = repeat('3', 40);
select private.sync_venture_commits(current_setting('test.v1')::uuid);
set local role authenticated;
select is((select count(*)::integer from public.contributions where commit_sha = repeat('3', 40)), 1,
  'once counted it becomes one entry, however often it syncs');
select throws_ok($$ select public.confirm_contribution(
  (select id from public.contributions where commit_sha = repeat('2', 40))) $$, '22023', null,
  'GitHub entries need no confirmation');

-- ---------------------------------------------------------------------------
-- Completion counts current members only
-- ---------------------------------------------------------------------------
select is(public.venture_verified_contributors(pg_temp.v('v1')), 2, 'A (GitHub) and B (confirmed) are verified');
select lives_ok($$ select public.remove_venture_member(pg_temp.v('v1'), '91000000-0000-0000-0000-00000000000b') $$,
  'the owner removes B');
select is(public.venture_verified_contributors(pg_temp.v('v1')), 1,
  'a removed member''s entries stay but stop counting');

select * from finish();
rollback;
