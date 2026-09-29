-- L3 and L4 levels (PRD 5.5, 5.16; decisions.md 2026-09-30). B works on two ventures: v1
-- (owner A) and v2 (owner C). D has merged pull requests. Levels come from current evidence.
begin;
select plan(40);

insert into auth.users (id, email) values
  ('92900000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('92900000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('92900000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('92900000-0000-0000-0000-00000000000d', 'd@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'lv_' || right(user_id::text, 2)
 where user_id::text like '92900000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
create function pg_temp.level(p_user text, p_skill text) returns smallint language sql security definer as $$
  select level from public.user_skills where user_id = p_user::uuid and skill_id = p_skill;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

set local role authenticated;
select pg_temp.as_user('92900000-0000-0000-0000-00000000000a');
select pg_temp.remember('v1', public.create_venture(
  '{"type":"project","title":"Timetable","description":"d","skill_ids":["react","typescript"]}'));
select pg_temp.as_user('92900000-0000-0000-0000-00000000000c');
select pg_temp.remember('v2', public.create_venture('{"type":"project","title":"Canteen","description":"d","skill_ids":["react"]}'));
reset role;
insert into public.venture_members (venture_id, user_id) values
  (current_setting('test.v1')::uuid, '92900000-0000-0000-0000-00000000000b'),
  (current_setting('test.v2')::uuid, '92900000-0000-0000-0000-00000000000b');
update public.ventures set status = 'in_progress' where id in (current_setting('test.v1')::uuid, current_setting('test.v2')::uuid);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Skill tags on entries
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92900000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', 'x', null, null, array['django']) $$,
  '22023', null, 'an entry is tagged only with the venture''s own skills');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'code', 'x', null, null,
  array['react','typescript','javascript','html']) $$, '23514', null, 'at most 3 skill tags');
select lives_ok($$ select pg_temp.remember('b1', public.log_contribution(pg_temp.v('v1'), 'code', 'Built the timetable grid',
  null, null, array['react', 'react'])) $$, 'a member tags an entry (duplicates collapse)');
select is((select skill_ids from public.contributions_with_status where id = pg_temp.v('b1')), array['react'],
  'the timeline shows the entry''s skills');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), null::smallint,
  'an unconfirmed entry proves nothing');

-- ---------------------------------------------------------------------------
-- L3 from a teammate's confirmation
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92900000-0000-0000-0000-00000000000a');
select public.confirm_contribution(pg_temp.v('b1'));
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), 3::smallint,
  'a teammate-confirmed tagged entry makes the skill L3, with no GitHub evidence needed');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'typescript'), null::smallint,
  'only the tagged skill');
select pg_temp.as_user('92900000-0000-0000-0000-00000000000b');
select lives_ok($$ select pg_temp.remember('b1fix', public.correct_contribution(pg_temp.v('b1'), 'code',
  'Built the timetable grid and filters', null, null, array['react'])) $$, 'the author corrects the entry');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), null::smallint,
  'a correction needs a fresh confirmation before it proves anything');
select pg_temp.as_user('92900000-0000-0000-0000-00000000000a');
select public.confirm_contribution(pg_temp.v('b1'));
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), 3::smallint, 'confirmed again, L3 again');

-- ---------------------------------------------------------------------------
-- L4 from evidence-tied endorsements by 2 different teammates, across ventures
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92900000-0000-0000-0000-00000000000b');
select pg_temp.remember('b2', public.log_contribution(pg_temp.v('v1'), 'code', 'Typed the API client', null, null, array['typescript']));
select pg_temp.remember('b3', public.log_contribution(pg_temp.v('v2'), 'code', 'Built the menu page', null, null, array['react']));

select pg_temp.as_user('92900000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select public.endorse('92900000-0000-0000-0000-00000000000b', '%s',
  jsonb_build_array(jsonb_build_object('skill', 'typescript', 'evidence', '%s'))) $$, pg_temp.v('v1'), pg_temp.v('b1')),
  '22023', null, 'evidence must show the skill it vouches for');
select is(public.endorse('92900000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  jsonb_build_array(jsonb_build_object('skill', 'react', 'evidence', pg_temp.v('b1')))), 1,
  'a teammate vouches for React, tied to the entry that shows it');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), 3::smallint, 'one vouching teammate isn''t L4');
select is(public.endorse('92900000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  '[{"skill":"typescript"}]'), 1, 'an endorsement without evidence');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'typescript'), null::smallint,
  'an endorsement without evidence doesn''t raise a level');

select pg_temp.as_user('92900000-0000-0000-0000-00000000000c');
select is(public.endorse('92900000-0000-0000-0000-00000000000b', pg_temp.v('v2'),
  jsonb_build_array(jsonb_build_object('skill', 'react', 'evidence', pg_temp.v('b3')))), 1,
  'a teammate from another venture vouches for React too');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), 4::smallint,
  'two different teammates, from any of the student''s ventures, make it L4');
select is((select peer_verified from public.user_skills
            where user_id = '92900000-0000-0000-0000-00000000000b' and skill_id = 'react'), true,
  'and peer-verified');

select pg_temp.as_user('92900000-0000-0000-0000-00000000000b');
select results_eq($$ select kind, level from public.my_skill_proofs('react') order by kind $$,
  $$ values ('contribution'::text, 3::smallint), ('endorsement', 4::smallint), ('endorsement', 4::smallint) $$,
  'the owner sees what each level rests on');
select public.hide_endorsement((select id from public.endorsements
  where endorser_id = '92900000-0000-0000-0000-00000000000c' and skill_id = 'react'));
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), 3::smallint,
  'a hidden endorsement no longer counts toward L4');
select public.hide_endorsement((select id from public.endorsements
  where endorser_id = '92900000-0000-0000-0000-00000000000c' and skill_id = 'react'), false);
select is(pg_temp.level('92900000-0000-0000-0000-00000000000b', 'react'), 4::smallint, 'shown again, L4 again');
select pg_temp.as_user('92900000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.my_skill_proofs('react')), 0, 'nobody else reads the proofs');

-- ---------------------------------------------------------------------------
-- Merged pull requests (the worker records them)
-- ---------------------------------------------------------------------------
reset role;
insert into public.github_accounts (user_id, github_id, login) values ('92900000-0000-0000-0000-00000000000d', 929001, 'dee');
select ok(private.record_pull_request('92900000-0000-0000-0000-00000000000d', jsonb_build_object(
  'repo_github_id', 5001, 'number', 7, 'pr_github_id', 700007, 'repo_full_name', 'numpy/numpy', 'repo_private', false,
  'merged_at', '2026-08-01T10:00:00Z', 'approver_github_id', 42, 'exclusion', null, 'files', 2,
  'skills', jsonb_build_array(jsonb_build_object('skill_id', 'python', 'path', 'numpy/core.py'),
                              jsonb_build_object('skill_id', 'python', 'path', 'numpy/lib.py')))),
  'the worker records a counted pull request');
select ok(private.record_pull_request('92900000-0000-0000-0000-00000000000d', jsonb_build_object(
  'repo_github_id', 5002, 'number', 1, 'pr_github_id', 700008, 'repo_full_name', 'dee/dotfiles', 'repo_private', false,
  'merged_at', '2026-08-02T10:00:00Z', 'exclusion', 'own_repo',
  'skills', jsonb_build_array(jsonb_build_object('skill_id', 'go', 'path', 'main.go')))),
  'and one in the student''s own repository');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000d', 'python'), 3::smallint,
  'a pull request merged by someone else in their repository makes the skill L3');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000d', 'go'), null::smallint,
  'a pull request to your own repository doesn''t');
select is((select paths from public.github_pr_skills where user_id = '92900000-0000-0000-0000-00000000000d' and skill_id = 'python'),
  array['numpy/core.py', 'numpy/lib.py'], 'the paths behind it are kept, not the code');
select throws_ok($$ insert into public.github_pull_requests (user_id, repo_github_id, number, pr_github_id, repo_full_name,
  repo_private, merged_at, counted, exclusion) values ('92900000-0000-0000-0000-00000000000d', 1, 1, 1, 'x/y', false, now(), false, 'nope') $$,
  '23514', null, 'exclusions are a fixed list');
select ok(private.record_pull_request('92900000-0000-0000-0000-00000000000d', jsonb_build_object(
  'repo_github_id', 5001, 'number', 7, 'pr_github_id', 700007, 'repo_full_name', 'numpy/numpy', 'repo_private', false,
  'merged_at', '2026-08-01T10:00:00Z', 'approver_github_id', 42, 'exclusion', null, 'files', 2,
  'skills', jsonb_build_array(jsonb_build_object('skill_id', 'python', 'path', 'numpy/core.py')))),
  'recording again is idempotent');
select is((select count(*)::integer from public.github_pull_requests where user_id = '92900000-0000-0000-0000-00000000000d'), 2,
  'one row per pull request');

set local role authenticated;
select pg_temp.as_user('92900000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.github_pull_requests), 2, 'the owner reads their pull requests');
select results_eq($$ select kind, title from public.my_skill_proofs('python') $$,
  $$ values ('pull_request'::text, 'numpy/numpy #7'::text) $$, 'and sees the pull request behind the level');
select throws_ok($$ insert into public.github_pr_skills (user_id, repo_github_id, number, skill_id)
  values ('92900000-0000-0000-0000-00000000000d', 5002, 1, 'python') $$, '42501', null, 'no direct writes');
select pg_temp.as_user('92900000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.github_pull_requests), 0, 'nobody else reads them');
set local role anon;
select throws_ok($$ select count(*) from public.github_pull_requests $$, '42501', null, 'signed-out visitors read nothing');

-- L3 evidence survives a GitHub disconnect.
reset role;
delete from public.github_accounts where user_id = '92900000-0000-0000-0000-00000000000d';
select private.recompute_user_skills('92900000-0000-0000-0000-00000000000d');
select is(pg_temp.level('92900000-0000-0000-0000-00000000000d', 'python'), 3::smallint, 'L3 survives a disconnect');

-- ---------------------------------------------------------------------------
-- Webhooks queue a pull request for its linked author
-- ---------------------------------------------------------------------------
insert into public.github_accounts (user_id, github_id, login) values ('92900000-0000-0000-0000-00000000000d', 929001, 'dee');
insert into private.github_webhook_events (delivery_id, event, action, payload) values
  ('92900000-0000-0000-0000-000000000001', 'pull_request', 'closed',
   '{"repository":{"full_name":"numpy/numpy"},"pull_request":{"number":9,"merged":true,"user":{"id":929001}}}'),
  ('92900000-0000-0000-0000-000000000002', 'pull_request', 'closed',
   '{"repository":{"full_name":"numpy/numpy"},"pull_request":{"number":10,"merged":false,"user":{"id":929001}}}'),
  ('92900000-0000-0000-0000-000000000003', 'pull_request_review', 'submitted',
   '{"repository":{"full_name":"numpy/numpy"},"review":{"state":"approved"},"pull_request":{"number":11,"user":{"id":929001}}}'),
  ('92900000-0000-0000-0000-000000000004', 'pull_request', 'closed',
   '{"repository":{"full_name":"numpy/numpy"},"pull_request":{"number":12,"merged":true,"user":{"id":5}}}');
select is(private.github_webhook_pr('92900000-0000-0000-0000-000000000001'),
  jsonb_build_array(jsonb_build_object('stage', 'pr', 'user_id', '92900000-0000-0000-0000-00000000000d', 'repo', 'numpy/numpy', 'number', 9)),
  'a merged pull request is queued for its author');
select is(private.github_webhook_pr('92900000-0000-0000-0000-000000000002'), '[]'::jsonb, 'a closed, unmerged one isn''t');
select is(jsonb_array_length(private.github_webhook_pr('92900000-0000-0000-0000-000000000003')), 1,
  'an approving review rechecks the pull request');
select is(private.github_webhook_pr('92900000-0000-0000-0000-000000000004'), '[]'::jsonb,
  'nothing for authors who aren''t Skilient students');

select * from finish();
rollback;
