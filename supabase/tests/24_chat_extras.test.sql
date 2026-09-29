-- Chat extras (PRD 5.28 "Chat"): replies stay in their thread; reactions are the fixed
-- six, members only, written only through toggle_reaction; pins are the venture owner's,
-- up to 3, in the team chat only; read receipts show only when both people have them on;
-- search finds only the caller's own threads; the typing channel admits members only;
-- links in messages are queued for previews. A, B, C, D study at NUTECH.
begin;
select plan(41);

insert into auth.users (id, email) values
  ('24000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('24000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('24000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('24000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'cx_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '24000000-%';

create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('24000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_id), 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.set_topic(p_topic text) returns void language sql as $$ select set_config('realtime.topic', p_topic, true) $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('b'));

set local role authenticated;
select pg_temp.as_user('a');
select set_config('test.dm', public.get_or_create_dm('cx_b')::text, false);
select set_config('test.m1', public.send_message(pg_temp.v('dm'), 'Shall we meet about the robotics kit?')::text, false);

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select set_config('test.r1', public.send_message(pg_temp.v('dm'), 'Yes, tomorrow', null, pg_temp.v('m1'))::text, false);
select results_eq($$ select reply_to_id, reply_sender_id, reply_excerpt from public.thread_messages(pg_temp.v('dm')) where id = pg_temp.v('r1') $$,
  $$ values (pg_temp.v('m1'), pg_temp.uid('a'), 'Shall we meet about the robotics kit?'::text) $$, 'a reply carries the quoted message');
select pg_temp.as_user('c');
select set_config('test.v', public.create_venture('{"type":"project","title":"Drone club","description":"d","team_size":4}')::text, false);
select set_config('test.g', public.venture_chat(pg_temp.v('v'))::text, false);
select throws_ok($$ select public.send_message(pg_temp.v('g'), 'quoting', null, pg_temp.v('m1')) $$, '22023', null,
  'a reply can''t quote a message from another thread');

-- ---------------------------------------------------------------------------
-- Reactions
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.message_reactions (message_id, thread_id, user_id, emoji)
                    values (pg_temp.v('m1'), pg_temp.v('dm'), pg_temp.uid('c'), '👍') $$, '42501', null, 'reactions are not inserted directly');
select throws_ok($$ select public.toggle_reaction(pg_temp.v('m1'), '👍') $$, '42501', null, 'a non-member can''t react');
select is_empty($$ select 1 from public.message_reactions where thread_id = pg_temp.v('dm') $$, 'or read reactions');
select pg_temp.as_user('b');
select throws_ok($$ select public.toggle_reaction(pg_temp.v('m1'), '💩') $$, '22023', null, 'only the six reactions');
select is(public.toggle_reaction(pg_temp.v('m1'), '👍'), true, 'a member reacts');
select is(public.toggle_reaction(pg_temp.v('m1'), '🎉'), true, 'and adds another');
select pg_temp.as_user('a');
select is(public.toggle_reaction(pg_temp.v('m1'), '👍'), true, 'the other side adds the same one');
select results_eq($$ select reactions from public.reaction_summary(array[pg_temp.v('m1')]) $$,
  $$ values ('[{"emoji":"👍","count":2,"mine":true},{"emoji":"🎉","count":1,"mine":false}]'::jsonb) $$, 'counts, in the fixed order');
select is(public.toggle_reaction(pg_temp.v('m1'), '👍'), false, 'reacting again takes it back');
select results_eq($$ select reactions from public.thread_messages(pg_temp.v('dm')) where id = pg_temp.v('m1') $$,
  $$ values ('[{"emoji":"👍","count":1,"mine":false},{"emoji":"🎉","count":1,"mine":false}]'::jsonb) $$, 'the page carries them too');
reset role;
delete from public.message_reactions where user_id = pg_temp.uid('b') and emoji = '🎉';
set local role authenticated;
select throws_ok($$ select public.toggle_reaction(pg_temp.v('r1'), '📌') $$, '22023', null, 'no custom emoji');

-- ---------------------------------------------------------------------------
-- Pins: venture owner, team chat, up to 3
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.pin_message(pg_temp.v('m1'), true) $$, '42501', null, 'nothing is pinned in a DM');
select pg_temp.as_user('d');
select set_config('test.app', public.apply_to_venture(pg_temp.v('v'), 'I fly drones')::text, false);
select pg_temp.as_user('c');
select public.decide_application(pg_temp.v('app'), true);
select set_config('test.p1', public.send_message(pg_temp.v('g'), 'Kickoff Friday')::text, false);
select set_config('test.p2', public.send_message(pg_temp.v('g'), 'Budget: 20k')::text, false);
select set_config('test.p3', public.send_message(pg_temp.v('g'), 'Repo is up')::text, false);
select set_config('test.p4', public.send_message(pg_temp.v('g'), 'Parts list')::text, false);
select pg_temp.as_user('d');
select throws_ok($$ select public.pin_message(pg_temp.v('p1'), true) $$, '42501', null, 'a member who isn''t the owner can''t pin');
select throws_ok($$ insert into public.chat_pins (message_id, thread_id, pinned_by) values (pg_temp.v('p1'), pg_temp.v('g'), pg_temp.uid('d')) $$,
  '42501', null, 'pins are not inserted directly');
select pg_temp.as_user('c');
select lives_ok($$ select public.pin_message(pg_temp.v('p1'), true), public.pin_message(pg_temp.v('p2'), true),
                          public.pin_message(pg_temp.v('p3'), true) $$, 'the owner pins three');
select lives_ok($$ select public.pin_message(pg_temp.v('p3'), true) $$, 'pinning a pinned message changes nothing');
select throws_ok($$ select public.pin_message(pg_temp.v('p4'), true) $$, '23514', null, 'a fourth is refused');
select pg_temp.as_user('d');
select results_eq($$ select excerpt from public.thread_pins(pg_temp.v('g')) $$,
  $$ values ('Kickoff Friday'::text), ('Budget: 20k'), ('Repo is up') $$, 'members see the pins, oldest first');
select results_eq($$ select pinned from public.thread_messages(pg_temp.v('g')) where id = pg_temp.v('p1') $$, $$ values (true) $$,
  'and the pinned mark on the message');
select pg_temp.as_user('a');
select is_empty($$ select * from public.thread_pins(pg_temp.v('g')) $$, 'an outsider sees no pins');
select is_empty($$ select 1 from public.chat_pins where thread_id = pg_temp.v('g') $$, 'not even through the table');
select pg_temp.as_user('c');
select lives_ok($$ select public.pin_message(pg_temp.v('p2'), false), public.pin_message(pg_temp.v('p4'), true) $$,
  'unpinning makes room for another');

-- ---------------------------------------------------------------------------
-- Read receipts: DMs only, both people on
-- ---------------------------------------------------------------------------
reset role;
update public.chat_thread_members set last_read_at = '2026-01-01 10:00+00' where thread_id = current_setting('test.dm')::uuid;
update public.chat_thread_members set last_read_at = '2026-01-02 10:00+00'
 where thread_id = current_setting('test.dm')::uuid and user_id = '24000000-0000-0000-0000-00000000000b';
set local role authenticated;
select pg_temp.as_user('a');
select is(public.dm_receipt(pg_temp.v('dm')), '2026-01-02 10:00+00'::timestamptz, 'with both on, A sees when B last read');
select is(public.dm_receipt(pg_temp.v('g')), null, 'no receipts in a group chat');
select pg_temp.as_user('b');
select public.set_read_receipts(false);
select is((select read_receipts from public.my_chat_settings()), false, 'B turns receipts off');
select is(public.dm_receipt(pg_temp.v('dm')), null, 'and no longer sees A''s');
select pg_temp.as_user('a');
select is(public.dm_receipt(pg_temp.v('dm')), null, 'nor does A see B''s');
select pg_temp.as_user('c');
select is(public.dm_receipt(pg_temp.v('dm')), null, 'an outsider sees nothing');

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select results_eq($$ select message_id from public.search_chats('robot') $$, $$ values (pg_temp.v('m1')) $$,
  'a word prefix finds the message across chats');
select results_eq($$ select thread_title, sender_name from public.search_chats('robotics kit', pg_temp.v('dm')) $$,
  $$ values ('Student B'::text, 'You'::text) $$, 'within a thread, with who and where');
select is_empty($$ select * from public.search_chats('r') $$, 'one letter searches nothing');
select is_empty($$ select * from public.search_chats('kickoff') $$, 'another team''s chat is out of reach');
select is_empty($$ select * from public.search_chats('robot'' | budget:*') $$, 'search syntax in the query is just words');
select pg_temp.as_user('c');
select is_empty($$ select * from public.search_chats('robotics', pg_temp.v('dm')) $$, 'naming a thread you''re not in finds nothing');

-- ---------------------------------------------------------------------------
-- Typing channel (Realtime broadcast authorisation)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('d');
select pg_temp.set_topic('thread:' || pg_temp.v('g'));
select is((select private.thread_topic_member(realtime.topic())), true, 'a member may join the thread''s channel');
select pg_temp.as_user('a');
select is((select private.thread_topic_member(realtime.topic())), false, 'an outsider may not');
select is(private.thread_topic_member('chat:' || pg_temp.v('dm')), false, 'nor any other topic');

-- ---------------------------------------------------------------------------
-- Links in messages are queued for a preview
-- ---------------------------------------------------------------------------
select set_config('test.l1', public.send_message(pg_temp.v('dm'), 'Specs at https://example.org/kit.')::text, false);
reset role;
select is((select link_url from public.chat_messages where id = current_setting('test.l1')::uuid), 'https://example.org/kit',
  'the first link is picked out');
select ok(exists (select 1 from pgmq.q_link_previews where message->>'url' = 'https://example.org/kit'), 'and queued for a preview');

select * from finish();
rollback;
