-- Ventures, join flows and lifecycle (PRD 5.7, 5.15, 5.28). A, B, D-H study at NUTECH,
-- C at FAST. A owns the ventures. The parallel-accept case is in tests/worker (two sessions).
begin;
select plan(56);

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('90000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('90000000-0000-0000-0000-00000000000c', 'c@nu.edu.pk'),
  ('90000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk'),
  ('90000000-0000-0000-0000-00000000000e', 'e@nutech.edu.pk'),
  ('90000000-0000-0000-0000-00000000000f', 'f@nutech.edu.pk'),
  ('90000000-0000-0000-0000-000000000010', 'g@nutech.edu.pk'),
  ('90000000-0000-0000-0000-000000000011', 'h@nutech.edu.pk'),
  ('90000000-0000-0000-0000-000000000012', 'new@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'v_' || right(user_id::text, 2)
 where user_id::text like '90000000-%' and user_id <> '90000000-0000-0000-0000-000000000012';

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

-- ---------------------------------------------------------------------------
-- Create
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.create_venture('{"type":"project","title":"X","description":"y"}') $$, '42501', null,
  'signed-out visitors cannot create ventures');
set local role authenticated;
select pg_temp.as_user('90000000-0000-0000-0000-000000000012');
select throws_ok($$ select public.create_venture('{"type":"project","title":"Robot","description":"y"}') $$, '42501', null,
  'a student who has not finished onboarding cannot create one');

select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select lives_ok($$ select pg_temp.remember('v1', public.create_venture('{
  "type": "project", "title": "Campus Rides", "description": "Carpooling for students", "skill_ids": ["typescript"],
  "roles": [{"title": "Backend developer", "skill_ids": ["python"], "slots": 2}],
  "questions": ["What have you built?", "How many hours a week?"]}')) $$, 'A creates a public project with a role and questions');
select throws_ok($$ select public.create_venture('{"type":"project","title":"Bad","description":"y","skill_ids":["not-a-skill"]}') $$,
  '22023', null, 'unknown skills are refused');
select throws_ok($$ select public.create_venture('{"type":"project","title":"Bad","description":"y","stage":"idea"}') $$,
  '23514', null, 'only startups have a stage');
select lives_ok($$ select pg_temp.remember('v2', public.create_venture('{"type":"startup","title":"Chai Co","description":"d","visibility":"university","stage":"idea"}')) $$,
  'A creates a university-only startup');
select lives_ok($$ select pg_temp.remember('v3', public.create_venture('{"type":"project","title":"Secret","description":"d","visibility":"unlisted"}')) $$,
  'A creates an unlisted project');
select lives_ok($$ select pg_temp.remember('v4', public.create_venture('{"type":"project","title":"Big team","description":"d","team_size":6}')) $$,
  'A creates a venture to fill');
select results_eq($$ select user_id::text, team_role::text from public.venture_members where venture_id = pg_temp.v('v1') $$,
  $$ values ('90000000-0000-0000-0000-00000000000a', 'lead') $$, 'the creator is the first member, as lead');
select throws_ok($$ insert into public.ventures (type, owner_id, university_id, title, description)
  select 'project', '90000000-0000-0000-0000-00000000000a', university_id, 'x', 'y' from public.profiles
   where user_id = '90000000-0000-0000-0000-00000000000a' $$, '42501', null, 'no direct inserts');

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------
select pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
select isnt_empty($$ select 1 from public.ventures where id = pg_temp.v('v1') $$, 'a student at another university sees a public venture');
select is_empty($$ select 1 from public.ventures where id = pg_temp.v('v2') $$, 'but not a university-only one');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
select isnt_empty($$ select 1 from public.ventures where id = pg_temp.v('v2') $$, 'a classmate sees the university-only one');
select is_empty($$ select 1 from public.ventures where id = pg_temp.v('v3') $$, 'unlisted ventures are never listed');
select is((select title from public.venture_by_link(pg_temp.v('v3'))), 'Secret', 'but open by link');
select is((select members from public.venture_counts(pg_temp.v('v3'))), 1, 'with their counts');

-- ---------------------------------------------------------------------------
-- Apply and decide
-- ---------------------------------------------------------------------------
select pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.apply_to_venture(pg_temp.v('v2'), 'hi') $$, 'P0002', null,
  'another university cannot apply to a university-only venture');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.apply_to_venture(pg_temp.v('v3'), 'hi') $$, 'P0002', null,
  'unlisted ventures take members by invite only (an outsider is told it does not exist)');
select throws_ok($$ select public.apply_to_venture(pg_temp.v('v1'), 'hi', array['only one']) $$, '22023', null,
  'every question must be answered');
select lives_ok($$ select pg_temp.remember('t1', public.apply_to_venture(pg_temp.v('v1'), 'I build APIs',
  array['A bus tracker', '10'], (select id from public.venture_roles where venture_id = pg_temp.v('v1')))) $$,
  'B applies to a role, answering both questions');
select throws_ok($$ select public.apply_to_venture(pg_temp.v('v1'), 'again', array['a', 'b']) $$, '23505', null,
  'a second pending application is refused');
select is((select jsonb_array_length(answers) from public.application_threads where id = pg_temp.v('t1')), 2,
  'the answers are kept with their questions');
select throws_ok($$ select public.decide_application(pg_temp.v('t1'), true) $$, '42501', null,
  'the candidate cannot accept her own application');

select pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.application_threads where id = pg_temp.v('t1') $$,
  'nobody else reads the application');
select throws_ok($$ select public.decide_application(pg_temp.v('t1'), true) $$, '42501', null,
  'and a non-owner cannot decide it');

select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select is(public.decide_application(pg_temp.v('t1'), true), 'accepted'::public.application_status, 'the owner accepts');
select is((select filled from public.venture_roles where venture_id = pg_temp.v('v1')), 1::smallint, 'the role fills a slot');
select throws_ok($$ select public.decide_application(pg_temp.v('t1'), false) $$, '55000', null, 'a decision is final');

-- ---------------------------------------------------------------------------
-- Team of at most 6
-- ---------------------------------------------------------------------------
select pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
select pg_temp.remember('j_b', public.apply_to_venture(pg_temp.v('v4'), 'hi'));
select pg_temp.as_user('90000000-0000-0000-0000-00000000000d');
select pg_temp.remember('j_d', public.apply_to_venture(pg_temp.v('v4'), 'hi'));
select pg_temp.as_user('90000000-0000-0000-0000-00000000000e');
select pg_temp.remember('j_e', public.apply_to_venture(pg_temp.v('v4'), 'hi'));
select pg_temp.as_user('90000000-0000-0000-0000-00000000000f');
select pg_temp.remember('j_f', public.apply_to_venture(pg_temp.v('v4'), 'hi'));
select pg_temp.as_user('90000000-0000-0000-0000-000000000010');
select pg_temp.remember('j_g', public.apply_to_venture(pg_temp.v('v4'), 'hi'));
select pg_temp.as_user('90000000-0000-0000-0000-000000000011');
select pg_temp.remember('j_h', public.apply_to_venture(pg_temp.v('v4'), 'hi'));
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select public.decide_application(pg_temp.v(t), true) from unnest(array['j_b', 'j_d', 'j_e', 'j_f', 'j_g']) t;
select is((select members from public.venture_counts(pg_temp.v('v4'))), 6, 'six members, the owner included');
select throws_ok($$ select public.decide_application(pg_temp.v('j_h'), true) $$, '23514', null,
  'a 7th member is refused');
reset role;
select throws_ok($$ insert into public.venture_members (venture_id, user_id)
  values (pg_temp.v('v4'), '90000000-0000-0000-0000-000000000011') $$, '23514', null,
  'even a direct insert cannot make a 7th member');
set local role authenticated;
select pg_temp.as_user('90000000-0000-0000-0000-000000000011');
select throws_ok($$ select public.apply_to_venture(pg_temp.v('v4'), 'again') $$, '23514', null,
  'a full team takes no new applications');

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.invite_to_venture(pg_temp.v('v2'), 'v_0c') $$, '42501', null,
  'a university-only venture cannot invite another university');
select lives_ok($$ select pg_temp.remember('i1', public.invite_to_venture(pg_temp.v('v3'), 'v_0c')) $$,
  'A invites C to the unlisted project');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
select isnt_empty($$ select 1 from public.ventures where id = pg_temp.v('v3') $$, 'the invitee can see it');
select is(public.respond_invite(pg_temp.v('i1'), true), 'accepted'::public.venture_invite_status, 'C accepts');
select throws_ok($$ select public.respond_invite(pg_temp.v('i1'), true) $$, '55000', null, 'an invite is used once');

-- ---------------------------------------------------------------------------
-- Members-only deliverables, team management, lifecycle
-- ---------------------------------------------------------------------------
select pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.add_venture_deliverable(pg_temp.v('v1'), 'Live app', 'https://rides.example.com') $$,
  'a member adds a deliverable');
select throws_ok($$ select public.set_member_role(pg_temp.v('v1'), '90000000-0000-0000-0000-00000000000b', 'lead') $$,
  '42501', null, 'only the owner assigns roles');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.venture_deliverables where venture_id = pg_temp.v('v1') $$,
  'an outsider cannot read deliverables');
select is((select deliverables from public.venture_counts(pg_temp.v('v1'))), 1, 'only their count');
select throws_ok($$ select public.add_venture_deliverable(pg_temp.v('v1'), 'Spam', 'https://x.example') $$, '42501', null,
  'or add one');

select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.leave_venture(pg_temp.v('v1')) $$, '55000', null, 'the owner cannot just leave');
select throws_ok($$ select public.transfer_venture_ownership(pg_temp.v('v1'), '90000000-0000-0000-0000-00000000000c') $$,
  '22023', null, 'ownership goes only to a member');
select throws_ok($$ select public.link_venture_repo(pg_temp.v('v1'), 424242) $$, '42501', null,
  'only a repository the owner shared with Skilient can be linked');
select throws_ok($$ select public.transition_venture(pg_temp.v('v1'), 'completed') $$, '55000', null,
  'recruiting cannot jump to completed');
select lives_ok($$ select public.transition_venture(pg_temp.v('v1'), 'in_progress') $$, 'recruiting to in progress');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.transition_venture(pg_temp.v('v3'), 'in_progress') $$, '42501', null,
  'a member who is not the owner cannot change the status');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.transition_venture(pg_temp.v('v1'), 'completed') $$, '23514',
  'at least 2 members need a peer-verified contribution before completing',
  'completing needs peer-verified contributions from 2 members (slice 6)');
select pg_temp.remember('ca', public.log_contribution(pg_temp.v('v1'), 'code', 'Built the ride matcher'));
select pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
select pg_temp.remember('cb', public.log_contribution(pg_temp.v('v1'), 'design', 'Designed the booking screens'));
select public.confirm_contribution(pg_temp.v('ca'));
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select public.confirm_contribution(pg_temp.v('cb'));
select lives_ok($$ select public.transition_venture(pg_temp.v('v1'), 'completed') $$,
  'completing with 2 members, a deliverable and peer-verified contributions');
select throws_ok($$ select public.log_contribution(pg_temp.v('v1'), 'docs', 'Late entry') $$, '55000', null,
  'a completed venture''s log is locked');
select throws_ok($$ select public.transition_venture(pg_temp.v('v1'), 'abandoned') $$, '55000', null,
  'a completed venture stays completed');
select throws_ok($$ select public.remove_venture_member(pg_temp.v('v1'), '90000000-0000-0000-0000-00000000000b') $$,
  '55000', null, 'a completed venture''s team is locked');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.leave_venture(pg_temp.v('v1')) $$, '55000', null, 'members cannot leave it either');
select pg_temp.as_user('90000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.apply_to_venture(pg_temp.v('v1'), 'late', array['a', 'b']) $$, '55000', null,
  'and it takes no applications');

-- Completing needs at least 2 members.
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select public.transition_venture(pg_temp.v('v2'), 'in_progress');
select throws_ok($$ select public.transition_venture(pg_temp.v('v2'), 'completed') $$, '23514', null,
  'a one-person venture cannot complete');

select * from finish();
rollback;
