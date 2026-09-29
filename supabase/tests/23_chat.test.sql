-- Chat (PRD 5.9, 5.28; PRD 8 lesson 1): a non-member can't read, join or post to a thread
-- through the API; DMs need friendship or an accepted application and never cross a
-- block; the venture group chat follows venture membership; 30 messages a minute; edit
-- and delete are the sender's; unread counts and one message notification per thread.
-- A, B, C, D study at NUTECH.
begin;
select plan(36);

insert into auth.users (id, email) values
  ('23000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('23000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('23000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('23000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'ch_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '23000000-%';

create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('23000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_id), 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.n(p_user text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = pg_temp.uid(p_user) and type = 'chat_message'
$$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('b'));

set local role authenticated;
select pg_temp.as_user('a');

-- ---------------------------------------------------------------------------
-- DMs
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.get_or_create_dm('ch_c') $$, '42501', null, 'strangers can''t start a DM');
select throws_ok($$ select public.get_or_create_dm('ch_a') $$, '22023', null, 'nor with themselves');
select set_config('test.dm', public.get_or_create_dm('ch_b')::text, false);
select is(public.get_or_create_dm('CH_B'), pg_temp.v('dm'), 'friends get one DM, reused');
select pg_temp.as_user('b');
select is(public.get_or_create_dm('ch_a'), pg_temp.v('dm'), 'from either side');
-- Everything in this test shares one transaction time: start members' read marks earlier.
reset role;
update public.chat_thread_members set last_read_at = now() - interval '1 minute';
set local role authenticated;

-- Direct writes refused everywhere (PRD 8 lesson 1)
select pg_temp.as_user('c');
select throws_ok($$ insert into public.chat_threads (type, dm_key) values ('dm', 'x:y') $$, '42501', null, 'threads are not inserted directly');
select throws_ok($$ insert into public.chat_thread_members (thread_id, user_id) values (pg_temp.v('dm'), pg_temp.uid('c')) $$,
  '42501', null, 'a non-member can''t add herself to a thread');
select throws_ok($$ insert into public.chat_messages (thread_id, sender_id, body) values (pg_temp.v('dm'), pg_temp.uid('c'), 'hi') $$,
  '42501', null, 'messages are not inserted directly');
select throws_ok($$ select public.send_message(pg_temp.v('dm'), 'let me in') $$, '42501', null, 'a non-member can''t post');
select is_empty($$ select 1 from public.chat_threads where id = pg_temp.v('dm') $$, 'a non-member can''t see the thread');
select is_empty($$ select 1 from public.chat_thread_members where thread_id = pg_temp.v('dm') $$, 'or its members');
select is_empty($$ select * from public.thread_messages(pg_temp.v('dm')) $$, 'or its messages');
select throws_ok($$ select public.mark_thread_read(pg_temp.v('dm')) $$, '42501', null, 'or mark it read');

-- Messages
select pg_temp.as_user('a');
select throws_ok($$ select public.send_message(pg_temp.v('dm'), '   ') $$, '23514', null, 'an empty message is refused');
select throws_ok($$ select public.send_message(pg_temp.v('dm'), repeat('x', 10001)) $$, '23514', null, 'over 10,000 characters is refused');
select throws_ok($$ select public.send_message(pg_temp.v('dm'), '', '{"path":"23000000-0000-0000-0000-00000000000a/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp","width":1,"height":1}') $$,
  '22023', null, 'an image outside the thread''s folder is refused');
select set_config('test.m1', public.send_message(pg_temp.v('dm'), 'Hi B, want to build something?')::text, false);
select is(pg_temp.n('b'), 1, 'B is notified');
select set_config('test.m2', public.send_message(pg_temp.v('dm'), 'Maybe a campus app')::text, false);
select is(pg_temp.n('b'), 1, 'a second message refreshes the same notification');
select pg_temp.as_user('b');
select results_eq($$ select unread from public.my_threads() where id = pg_temp.v('dm') $$, $$ values (2) $$, 'B has 2 unread');
select is((select public.unread_chat_count()), 2, 'and the header count agrees');
select public.mark_thread_read(pg_temp.v('dm'));
select results_eq($$ select unread from public.my_threads() where id = pg_temp.v('dm') $$, $$ values (0) $$, 'opening marks it read');
select is((select count(*)::integer from public.notifications where type = 'chat_message' and read_at is null), 0,
  'and reads its notification');
select throws_ok($$ select public.edit_message(pg_temp.v('m1'), 'hijacked') $$, '42501', null, 'B can''t edit A''s message');
select throws_ok($$ select public.delete_message(pg_temp.v('m1')) $$, '42501', null, 'or delete it');
select pg_temp.as_user('a');
select lives_ok($$ select public.edit_message(pg_temp.v('m1'), 'Hi B! Want to build something?') $$, 'A edits her message');
select is((select delete_message from public.delete_message(pg_temp.v('m2'))), null, 'A deletes a text message (no image to remove)');
select results_eq($$ select body, deleted from public.thread_messages(pg_temp.v('dm')) where id = pg_temp.v('m2') $$,
  $$ values (''::text, true) $$, 'a deleted message keeps its place with the text blanked');

-- 30 messages a minute
select public.send_message(pg_temp.v('dm'), 'msg ' || n) from generate_series(1, 28) as n;
select throws_ok($$ select public.send_message(pg_temp.v('dm'), 'one too many') $$, '54000', null, 'the 31st message in a minute is refused');

-- Blocking closes the DM
reset role;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('b'), pg_temp.uid('a'));
set local role authenticated;
select throws_ok($$ select public.send_message(pg_temp.v('dm'), 'still there?') $$, '42501', null, 'a blocked DM takes no messages');
select is_empty($$ select 1 from public.my_threads() where id = pg_temp.v('dm') $$, 'and leaves the thread list');
select is_empty($$ select 1 from public.chat_messages where thread_id = pg_temp.v('dm') $$, 'and its messages are closed');
select throws_ok($$ select public.get_or_create_dm('ch_b') $$, 'P0002', null, 'and no new DM can start');
reset role;
delete from public.blocks;
set local role authenticated;

-- An accepted application opens a DM between strangers
select pg_temp.as_user('c');
select set_config('test.v', public.create_venture('{"type":"project","title":"Drone club","description":"d","team_size":4}')::text, false);
select pg_temp.as_user('d');
select set_config('test.app', public.apply_to_venture(pg_temp.v('v'), 'I fly drones')::text, false);
select throws_ok($$ select public.get_or_create_dm('ch_c') $$, '42501', null, 'a pending application doesn''t open a DM');
select pg_temp.as_user('c');
select public.decide_application(pg_temp.v('app'), true);
select pg_temp.as_user('d');
select lives_ok($$ select public.get_or_create_dm('ch_c') $$, 'an accepted one does');

-- ---------------------------------------------------------------------------
-- Venture group chat follows membership
-- ---------------------------------------------------------------------------
select isnt(public.venture_chat(pg_temp.v('v')), null, 'the new member is in the venture''s group chat');
select pg_temp.as_user('a');
select is(public.venture_chat(pg_temp.v('v')), null, 'an outsider gets no group chat');
select pg_temp.as_user('d');
select set_config('test.g', public.venture_chat(pg_temp.v('v'))::text, false);
select public.leave_venture(pg_temp.v('v'));
select throws_ok($$ select public.send_message(pg_temp.v('g'), 'bye') $$, '42501', null, 'leaving the venture leaves its chat');

select * from finish();
rollback;
