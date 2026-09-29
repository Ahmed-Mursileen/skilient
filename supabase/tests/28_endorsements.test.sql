-- Peer endorsements (PRD 5.16): every limit is refused when endorse() is called directly,
-- the endorsee hides but nobody edits, and only people who may see the profile read them.
-- A owns a public venture with B and C as members; D studies at FAST and isn't on the team.
begin;
select plan(49);

insert into auth.users (id, email) values
  ('92800000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('92800000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('92800000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('92800000-0000-0000-0000-00000000000d', 'd@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'en_' || right(user_id::text, 2)
 where user_id::text like '92800000-%';

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
select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select pg_temp.remember('v1', public.create_venture(
  '{"type":"project","title":"Timetable","description":"d","skill_ids":["react","typescript","javascript","html","css","nodejs"]}'));
reset role;
insert into public.venture_members (venture_id, user_id) values
  (current_setting('test.v1')::uuid, '92800000-0000-0000-0000-00000000000b'),
  (current_setting('test.v1')::uuid, '92800000-0000-0000-0000-00000000000c');
-- B has Python from GitHub (not a venture tag).
insert into public.user_skills (user_id, skill_id, level) values ('92800000-0000-0000-0000-00000000000b', 'python', 2);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- When and between whom
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"react"}]') $$,
  '55000', null, 'a recruiting venture can''t endorse yet');
reset role;
update public.ventures set status = 'in_progress' where id = current_setting('test.v1')::uuid;
set local role authenticated;

select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000a', pg_temp.v('v1'), '[{"skill":"react"}]') $$,
  '42501', null, 'no self-endorsement');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000d', pg_temp.v('v1'), '[{"skill":"react"}]') $$,
  'P0002', null, 'someone outside the team can''t be endorsed');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"react"}]') $$,
  'P0002', null, 'an outsider can''t endorse a member');

-- ---------------------------------------------------------------------------
-- A endorses B
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92800000-0000-0000-0000-00000000000b');
select pg_temp.remember('b_entry', public.log_contribution(pg_temp.v('v1'), 'code', 'Built the timetable grid'));
select pg_temp.as_user('92800000-0000-0000-0000-00000000000c');
select pg_temp.remember('c_entry', public.log_contribution(pg_temp.v('v1'), 'design', 'Drew the screens'));

select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select is(public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  jsonb_build_array(jsonb_build_object('skill', 'react', 'evidence', pg_temp.v('b_entry'))), 'Solid work on the grid'),
  1, 'a teammate endorses a venture skill, tied to the endorsee''s entry');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"react"}]') $$,
  '23505', null, 'the same skill twice in one venture is refused');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"django"}]') $$,
  '22023', null, 'a skill outside the venture''s tags and the endorsee''s skills is refused');
select is(public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"python"}]'), 1,
  'a skill the endorsee has from their own work can be endorsed');
select throws_ok(format($$ select public.endorse('92800000-0000-0000-0000-00000000000b', '%s',
  jsonb_build_array(jsonb_build_object('skill', 'html', 'evidence', '%s'))) $$, pg_temp.v('v1'), pg_temp.v('c_entry')),
  '22023', null, 'evidence must be the endorsee''s own entry');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  '[{"skill":"html","evidence":"not-a-uuid"}]') $$, '22023', null, 'malformed evidence is refused');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"html"}]',
  repeat('x', 281)) $$, '23514', null, 'notes are at most 280 characters');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[]') $$,
  '22023', null, 'at least one skill');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '{"skill":"html"}') $$,
  '22023', null, 'items must be a list');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  '[{"skill":"html"},{"skill":"html"}]') $$, '22023', null, 'each skill once per call');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  '[{"skill":"html"},{"skill":"css"},{"skill":"nodejs"},{"skill":"javascript"}]') $$,
  '23514', null, 'more than 5 skills per teammate per venture is refused (2 given + 4)');
select is(public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'),
  '[{"skill":"html"},{"skill":"css"},{"skill":"nodejs"}]'), 3, 'up to 5 per teammate per venture is fine');
select is((select count(*)::integer from public.endorsements where endorser_id = '92800000-0000-0000-0000-00000000000a'),
  5, 'the refused calls wrote nothing');

-- ---------------------------------------------------------------------------
-- Monthly limit (lowered to 6 for the test) and blocks
-- ---------------------------------------------------------------------------
reset role;
insert into public.platform_config (key, version, value, reason)
values ('endorsements.limits', 99, '{"per_teammate_per_venture": 5, "per_month": 6, "peer_verified_min": 2}', 'pgTAP');
set local role authenticated;
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000c', pg_temp.v('v1'),
  '[{"skill":"react"},{"skill":"css"}]') $$, '23514', null, 'the monthly limit counts every endorsement given this month');
reset role;
update public.endorsements set created_at = date_trunc('month', now() at time zone 'Asia/Karachi') - interval '2 days'
 where endorser_id = '92800000-0000-0000-0000-00000000000a' and skill_id = 'python';
set local role authenticated;
select is(public.endorse('92800000-0000-0000-0000-00000000000c', pg_temp.v('v1'), '[{"skill":"react"},{"skill":"css"}]'),
  2, 'last month''s endorsements don''t count toward this month');
reset role;
insert into public.blocks (blocker_id, blocked_id)
values ('92800000-0000-0000-0000-00000000000c', '92800000-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000c', pg_temp.v('v1'), '[{"skill":"html"}]') $$,
  'P0002', null, 'a teammate who blocked you can''t be endorsed');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000a', pg_temp.v('v1'), '[{"skill":"html"}]') $$,
  'P0002', null, 'nor can the blocker endorse them');
reset role;
delete from public.blocks where blocker_id = '92800000-0000-0000-0000-00000000000c';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- No direct writes; the endorser can't see whether it was hidden
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id)
  values ('92800000-0000-0000-0000-00000000000a', '92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), 'typescript') $$,
  '42501', null, 'no direct inserts');
select throws_ok($$ update public.endorsements set note = 'edited' where endorser_id = '92800000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'nobody edits an endorsement, not even its author');
select throws_ok($$ delete from public.endorsements where endorser_id = '92800000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'no deletes');
select throws_ok($$ select hidden from public.endorsements $$, '42501', null, 'the hidden flag isn''t readable from the table');
select is((select count(*)::integer from public.endorsements), 7, 'the endorser reads what they gave');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.endorsements), 0, 'outsiders read nothing from the table');
set local role anon;
select throws_ok($$ select count(*) from public.endorsements $$, '42501', null, 'signed-out visitors read nothing');
select throws_ok($$ select public.endorse('92800000-0000-0000-0000-00000000000b', gen_random_uuid(), '[]') $$,
  '42501', null, 'signed-out visitors can''t endorse');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Peer-verified: 2 different teammates on a skill
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select is((select peer_verified from public.user_skills where user_id = '92800000-0000-0000-0000-00000000000b' and skill_id = 'python'),
  false, 'one endorser isn''t enough for peer-verified');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000c');
select is(public.endorse('92800000-0000-0000-0000-00000000000b', pg_temp.v('v1'), '[{"skill":"python"}]'), 1,
  'a second teammate endorses the same skill');
select is((select peer_verified from public.user_skills where user_id = '92800000-0000-0000-0000-00000000000b' and skill_id = 'python'),
  true, 'two different teammates make it peer-verified');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000b');
select is((select count(*)::integer from public.notifications
            where user_id = '92800000-0000-0000-0000-00000000000b' and type = 'endorsement_received'), 4,
  'the endorsee is notified once per endorse call (3 from A, 1 from C)');
select is((select data -> 'skills' from public.notifications
            where user_id = '92800000-0000-0000-0000-00000000000b' and type = 'endorsement_received'
              and actor_id = '92800000-0000-0000-0000-00000000000c'), '["Python"]'::jsonb,
  'the notification names the skills');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000c');

-- ---------------------------------------------------------------------------
-- Hiding and reading
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.hide_endorsement((select id from public.endorsements
  where endorser_id = '92800000-0000-0000-0000-00000000000c' and skill_id = 'python')) $$,
  'P0002', null, 'only the endorsee can hide an endorsement');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000b');
select is(public.hide_endorsement((select id from public.endorsements
  where endorser_id = '92800000-0000-0000-0000-00000000000c' and skill_id = 'python')), true, 'the endorsee hides one');
select is((select peer_verified from public.user_skills where user_id = '92800000-0000-0000-0000-00000000000b' and skill_id = 'python'),
  false, 'a hidden endorsement doesn''t count');
select is((select count(*)::integer from public.endorsements_for('92800000-0000-0000-0000-00000000000b')), 6,
  'the endorsee reads all of theirs, hidden too');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.endorsements_for('92800000-0000-0000-0000-00000000000b')), 5,
  'a classmate reads the shown ones only');
select is((select endorser_username from public.endorsements_for('92800000-0000-0000-0000-00000000000b') where skill_id = 'react'),
  'en_0a', 'with the endorser''s profile link where visible');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.endorsements_for('92800000-0000-0000-0000-00000000000b')), 0,
  'a student at another university can''t read a university-only profile''s endorsements');
reset role;
update public.profiles set visibility = 'global' where user_id = '92800000-0000-0000-0000-00000000000b';
set local role authenticated;
select is((select count(*)::integer from public.endorsements_for('92800000-0000-0000-0000-00000000000b')), 5,
  'a global profile''s endorsements are readable');
select is((select endorser_username from public.endorsements_for('92800000-0000-0000-0000-00000000000b') where skill_id = 'react'),
  null, 'but not the endorser''s profile link when their own profile isn''t visible');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000b');
select is(public.hide_endorsement((select id from public.endorsements
  where endorser_id = '92800000-0000-0000-0000-00000000000c' and skill_id = 'python'), false), false, 'and shows it again');
select is((select peer_verified from public.user_skills where user_id = '92800000-0000-0000-0000-00000000000b' and skill_id = 'python'),
  true, 'shown again, it counts again');

-- ---------------------------------------------------------------------------
-- The endorse sheet and completion
-- ---------------------------------------------------------------------------
select pg_temp.as_user('92800000-0000-0000-0000-00000000000a');
select results_eq($$ select username, given from public.endorse_options(pg_temp.v('v1')) order by username $$,
  $$ values ('en_0b'::text, array['css','html','nodejs','python','react']::text[]), ('en_0c'::text, array['css','react']::text[]) $$,
  'the sheet lists each teammate with what you already gave them');
select is((select month_left from public.endorse_options(pg_temp.v('v1')) limit 1), 0, 'and how many are left this month');
select pg_temp.as_user('92800000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.endorse_options(pg_temp.v('v1'))), 0, 'outsiders get no options');

reset role;
insert into public.venture_deliverables (venture_id, label, url, added_by)
values (current_setting('test.v1')::uuid, 'App', 'https://example.com', '92800000-0000-0000-0000-00000000000a');
update public.ventures set status = 'completed', completed_at = now() where id = current_setting('test.v1')::uuid;
select is((select count(*)::integer from public.notifications
            where type = 'endorse_teammates' and entity_id = current_setting('test.v1')::uuid), 3,
  'completion prompts every member, the owner included, to endorse');

select * from finish();
rollback;
