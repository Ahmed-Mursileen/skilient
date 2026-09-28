-- Friends and blocks (PRD 5.8, 8). A, B and C study at NUTECH, D at FAST.
-- Covers the refusals, unfriend/block touching only the pair, friends-only and blocked
-- viewers on profiles (deferred from phase 1), blocks in both directions on venture team
-- cards and application_people, and the append-only ops_audit_log.
begin;
select plan(71);

insert into auth.users (id, email) values
  ('17000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('17000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('17000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('17000000-0000-0000-0000-00000000000d', 'd@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'fr_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '17000000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17000000-0000-0000-0000-00000000000' || p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.uid(p_id text) returns uuid language sql as $$
  select ('17000000-0000-0000-0000-00000000000' || p_id)::uuid
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- Direct writes are refused on every table
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$ insert into public.friend_requests (sender_id, receiver_id) values (pg_temp.uid('a'), pg_temp.uid('b')) $$,
  '42501', null, 'friend requests cannot be inserted directly');
select throws_ok($$ insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('b')) $$,
  '42501', null, 'friendships cannot be inserted directly');
select throws_ok($$ insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('b')) $$,
  '42501', null, 'blocks cannot be inserted directly');
select throws_ok($$ insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason)
                    values (pg_temp.uid('a'), 'x', 'user', 'x', 'because') $$,
  '42501', null, 'students cannot write the audit log');

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from public.send_friend_request('fr_a') $$, '22023', null, 'no request to yourself');
select throws_ok($$ select * from public.send_friend_request('nobody_here') $$, 'P0002', null, 'unknown username');
select results_eq($$ select status::text from public.send_friend_request('FR_B ') $$, $$ values ('pending') $$,
  'A sends B a request (username is trimmed and case-folded)');
select throws_ok($$ select * from public.send_friend_request('fr_c') $$, '54000', null,
  'a second send within 5 seconds is refused');
reset role;
delete from private.rate_limit_events;
set local role authenticated;
select throws_ok($$ select * from public.send_friend_request('fr_b') $$, '23505', null, 'a duplicate request is refused');
select is((select count(*)::integer from public.friend_requests), 1, 'A sees her one request');

select pg_temp.as_user('c');
select is_empty($$ select 1 from public.friend_requests $$, 'C cannot see A and B''s request');
select throws_ok(
  $$ select public.respond_friend_request((select id from public.my_friend_requests() limit 1), true) $$,
  'P0002', null, 'C cannot answer a request that isn''t hers');

-- The reverse pair is the same pair: the database refuses a second live row.
reset role;
select throws_ok($$ insert into public.friend_requests (sender_id, receiver_id) values (pg_temp.uid('b'), pg_temp.uid('a')) $$,
  '23505', null, 'the unique pair index refuses a reverse duplicate even without the function');
set local role authenticated;

select pg_temp.as_user('b');
select is((select public.pending_friend_request_count()), 1, 'B has one pending request');
select results_eq($$ select direction, username from public.my_friend_requests() $$,
  $$ values ('received'::text, 'fr_a'::text) $$, 'B sees it as received from A');
select results_eq($$ select state from public.friendship_state('fr_a') $$, $$ values ('received'::text) $$,
  'B''s state with A is received');
select pg_temp.as_user('a');
select throws_ok(
  $$ select public.respond_friend_request((select id from public.friend_requests limit 1), true) $$,
  'P0002', null, 'the sender cannot accept her own request');
select results_eq($$ select state from public.friendship_state('fr_b') $$, $$ values ('sent'::text) $$,
  'A''s state with B is sent');

-- ---------------------------------------------------------------------------
-- Accepting and the friends-only profile (deferred from phase 1)
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set visibility = 'friends' where user_id = pg_temp.uid('b');
set local role authenticated;
select pg_temp.as_user('a');
select is_empty($$ select 1 from public.profiles where username = 'fr_b' $$,
  'a classmate who isn''t a friend cannot read a friends-only profile');

select pg_temp.as_user('b');
select lives_ok($$ select public.respond_friend_request((select id from public.my_friend_requests() limit 1), true) $$,
  'B accepts');
select is((select count(*)::integer from public.friendships), 1, 'one ordered friendship row');
select pg_temp.as_user('a');
select isnt_empty($$ select 1 from public.profiles where username = 'fr_b' $$,
  'a friend reads the friends-only profile in full');
select results_eq($$ select state from public.friendship_state('fr_b') $$, $$ values ('friends'::text) $$,
  'A and B are friends');
select results_eq($$ select username from public.my_friends() $$, $$ values ('fr_b'::text) $$, 'B is in A''s friends');
select pg_temp.as_user('c');
select is_empty($$ select 1 from public.profiles where username = 'fr_b' $$,
  'another classmate still cannot read it');
select results_eq($$ select username from public.get_profile_card('fr_b') $$, $$ values ('fr_b'::text) $$,
  'but gets the restricted card');
select pg_temp.as_user('a');
select throws_ok($$ select * from public.send_friend_request('fr_b') $$, '23505', null,
  'no request between friends');

-- ---------------------------------------------------------------------------
-- A reverse pending request is accepted instead of duplicated; decline and re-send
-- ---------------------------------------------------------------------------
reset role;
delete from private.rate_limit_events;
set local role authenticated;
select pg_temp.as_user('c');
select results_eq($$ select status::text from public.send_friend_request('fr_a') $$, $$ values ('pending') $$,
  'C asks A');
select pg_temp.as_user('a');
select results_eq($$ select status::text from public.send_friend_request('fr_c') $$, $$ values ('accepted') $$,
  'A asking C back accepts C''s request');
select results_eq($$ select username from public.my_friends() order by username $$,
  $$ values ('fr_b'::text), ('fr_c'::text) $$, 'A is friends with B and C');

reset role;
delete from private.rate_limit_events;
set local role authenticated;
select pg_temp.as_user('c');
select results_eq($$ select status::text from public.send_friend_request('fr_b') $$, $$ values ('pending') $$,
  'C asks B');
select pg_temp.as_user('b');
select lives_ok($$ select public.respond_friend_request((select id from public.my_friend_requests() limit 1), false) $$,
  'B declines');
select is_empty($$ select 1 from public.my_friend_requests() $$, 'nothing pending for B');
reset role;
delete from private.rate_limit_events;
set local role authenticated;
select pg_temp.as_user('c');
select results_eq($$ select status::text from public.send_friend_request('fr_b') $$, $$ values ('pending') $$,
  'a declined request can be sent again');

select pg_temp.as_user('d');
reset role;
delete from private.rate_limit_events;
set local role authenticated;
select results_eq($$ select status::text from public.send_friend_request('fr_c') $$, $$ values ('pending') $$,
  'D (another university) asks C');
select throws_ok($$ select public.cancel_friend_request((select id from public.friend_requests where receiver_id = pg_temp.uid('b'))) $$,
  'P0002', null, 'D cannot cancel a request she didn''t send');
select lives_ok($$ select public.cancel_friend_request((select id from public.my_friend_requests() limit 1)) $$,
  'D cancels her own request');
select is_empty($$ select 1 from public.friend_requests $$, 'D''s request is gone');
select is_empty($$ select 1 from public.profiles where username = 'fr_c' $$,
  'D at another university gets only the card of C''s university-only profile');
reset role;
insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('c'), pg_temp.uid('d'));
set local role authenticated;
select isnt_empty($$ select 1 from public.profiles where username = 'fr_c' $$,
  'once friends, D reads C''s university-only profile in full (one ladder: friends see what classmates see)');
reset role;
delete from public.friendships where user_id_a = pg_temp.uid('c') and user_id_b = pg_temp.uid('d');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Unfriend touches only the pair (PRD 8 lesson 4)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select lives_ok($$ select public.unfriend('fr_b') $$, 'A unfriends B');
select results_eq($$ select username from public.my_friends() $$, $$ values ('fr_c'::text) $$,
  'A is still friends with C');
select pg_temp.as_user('b');
select results_eq($$ select direction, username from public.my_friend_requests() $$,
  $$ values ('received'::text, 'fr_c'::text) $$, 'C''s pending request to B survives');
select pg_temp.as_user('a');
select is_empty($$ select 1 from public.profiles where username = 'fr_b' $$,
  'after unfriending, A no longer reads B''s friends-only profile');
select throws_ok($$ select public.unfriend('fr_b') $$, 'P0002', null, 'unfriending a non-friend is refused');

-- ---------------------------------------------------------------------------
-- Block: touches only the pair, hides both ways, is invisible to the blocked person
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set visibility = 'global' where user_id in (pg_temp.uid('a'), pg_temp.uid('b'), pg_temp.uid('c'));
delete from private.rate_limit_events;
set local role authenticated;
select pg_temp.as_user('c');
select lives_ok($$ select public.block_user('fr_a') $$, 'C blocks A (they were friends)');
select is_empty($$ select 1 from public.friendships where pg_temp.uid('a') in (user_id_a, user_id_b) $$,
  'their friendship is gone');
select pg_temp.as_user('b');
select results_eq($$ select username from public.my_friend_requests() $$, $$ values ('fr_c'::text) $$,
  'C''s request to B is untouched by C''s block of A');
select pg_temp.as_user('c');
select results_eq($$ select username from public.my_blocks() $$, $$ values ('fr_a'::text) $$, 'C sees her block');
select results_eq($$ select state from public.friendship_state('fr_a') $$, $$ values ('blocked'::text) $$,
  'C''s state with A is blocked');
select is_empty($$ select 1 from public.profiles where username = 'fr_a' $$, 'the blocker cannot read the global profile');

select pg_temp.as_user('a');
select is_empty($$ select 1 from public.blocks $$, 'A cannot see that C blocked her');
select is_empty($$ select 1 from public.profiles where username = 'fr_c' $$, 'the blocked person cannot read the global profile');
select is_empty($$ select * from public.get_profile_card('fr_c') $$, 'or the restricted card');
select is_empty($$ select * from public.friendship_state('fr_c') $$, 'or learn anything from friendship_state');
select throws_ok($$ select * from public.send_friend_request('fr_c') $$, 'P0002', null,
  'a blocked person cannot send a request (told the username doesn''t exist)');
select isnt_empty($$ select 1 from public.profiles where username = 'fr_b' $$, 'A still reads B''s global profile');

-- ---------------------------------------------------------------------------
-- Blocks on venture team cards and application_people, both directions
-- ---------------------------------------------------------------------------
-- B owns a public venture; A applies; C joins by invite.
select pg_temp.as_user('b');
select set_config('test.v', public.create_venture('{"type":"project","title":"Robots","description":"d"}')::text, false);
select public.invite_to_venture(pg_temp.v('v'), 'fr_c');
select pg_temp.as_user('c');
select public.respond_invite((select id from public.venture_invites where invitee_id = pg_temp.uid('c')), true);
select pg_temp.as_user('a');
select public.apply_to_venture(pg_temp.v('v'), 'hi');
select results_eq($$ select username from public.venture_team(pg_temp.v('v')) order by username $$,
  $$ values ('fr_b'::text) $$, 'A (blocked by C) does not see C on the team');
select pg_temp.as_user('c');
select results_eq($$ select username from public.venture_team(pg_temp.v('v')) order by username $$,
  $$ values ('fr_b'::text), ('fr_c'::text) $$, 'C (the blocker) sees the team without A');

select pg_temp.as_user('b');
select lives_ok($$ select public.block_user('fr_a') $$, 'B, the owner, blocks the applicant A');
select is_empty($$ select 1 from public.application_people(array[pg_temp.uid('a')]) $$,
  'the owner no longer gets the blocked applicant''s card');
select pg_temp.as_user('a');
select is_empty($$ select 1 from public.application_people(array[pg_temp.uid('b')]) $$,
  'and the applicant no longer gets the owner''s card');
select is_empty($$ select 1 from public.ventures where id = pg_temp.v('v') $$,
  'nor can she see the venture of someone who blocked her');

select pg_temp.as_user('b');
select lives_ok($$ select public.unblock_user('fr_a') $$, 'B unblocks A');
select throws_ok($$ select public.unblock_user('fr_a') $$, 'P0002', null, 'unblocking twice is refused');
select pg_temp.as_user('a');
select isnt_empty($$ select 1 from public.application_people(array[pg_temp.uid('b')]) $$,
  'after the unblock A gets B''s card again');

-- ---------------------------------------------------------------------------
-- ops_audit_log: staff read, nobody changes a row
-- ---------------------------------------------------------------------------
reset role;
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.uid('d'), 'moderator', pg_temp.uid('d'));
insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason)
values (pg_temp.uid('d'), 'emergency_ban', 'user', pg_temp.uid('a')::text, 'harassment: test');
select throws_ok($$ update public.ops_audit_log set reason = 'edited' $$, '42501', null,
  'not even the table owner can edit an audit row');
select throws_ok($$ delete from public.ops_audit_log $$, '42501', null, 'or delete one');
set local role authenticated;
select pg_temp.as_user('a');
select is_empty($$ select 1 from public.ops_audit_log $$, 'students cannot read the audit log');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('d'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
select is((select count(*)::integer from public.ops_audit_log), 1, 'staff on an aal2 session read it');

set local role anon;
select throws_ok($$ select * from public.my_friends() $$, '42501', null, 'signed-out visitors call nothing');
reset role;

select * from finish();
rollback;
