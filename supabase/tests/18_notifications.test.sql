-- Notifications (PRD 5.11): written only by triggers, exactly once per event, readable
-- and markable by their owner only; instant emails only for the four allowed categories;
-- digests only for people with unread digest items who weren't active in 24 hours.
-- A owns a venture; B and C are students; D is at FAST.
begin;
select plan(51);

insert into auth.users (id, email) values
  ('18000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('18000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('18000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('18000000-0000-0000-0000-00000000000d', 'd@nu.edu.pk');
update public.profiles set onboarding_complete = true, username = 'nt_' || right(user_id::text, 1),
       full_name = 'Student ' || upper(right(user_id::text, 1))
 where user_id::text like '18000000-%';

create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '18000000-0000-0000-0000-00000000000' || p_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.uid(p_id text) returns uuid language sql as $$
  select ('18000000-0000-0000-0000-00000000000' || p_id)::uuid
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
-- Notifications of a type for a user, and instant emails queued for them (as postgres).
create function pg_temp.n(p_user text, p_type text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = pg_temp.uid(p_user) and type = p_type
$$;
create function pg_temp.status_of(p_user text, p_type text) returns text language sql security definer as $$
  select data->>'status' from public.notifications where user_id = pg_temp.uid(p_user) and type = p_type
$$;
create function pg_temp.queued_type(p_user text, p_type text) returns integer language sql security definer as $$
  select count(*)::integer from pgmq.q_notification_emails q
    join public.notifications n on n.id = (q.message->>'notification_id')::uuid
   where n.user_id = pg_temp.uid(p_user) and n.type = p_type
$$;
create function pg_temp.queued(p_user text) returns integer language sql security definer as $$
  select count(*)::integer from pgmq.q_notification_emails q
    join public.notifications n on n.id = (q.message->>'notification_id')::uuid
   where n.user_id = pg_temp.uid(p_user)
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- Nobody writes notifications or preferences directly
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$ insert into public.notifications (user_id, type, entity_type, entity_id)
                    values (pg_temp.uid('b'), 'friend_request', 'x', gen_random_uuid()) $$,
  '42501', null, 'a user cannot insert a notification for someone else');
select throws_ok($$ insert into public.notifications (user_id, type, entity_type, entity_id)
                    values (pg_temp.uid('a'), 'friend_request', 'x', gen_random_uuid()) $$,
  '42501', null, 'or for herself');
select throws_ok($$ insert into public.notification_prefs (user_id, category, channel)
                    values (pg_temp.uid('a'), 'team', 'instant_email') $$,
  '42501', null, 'preferences are not written directly');
select throws_ok($$ insert into public.notification_types (type, category) values ('x', 'team') $$,
  '42501', null, 'types are not written over the API');
select throws_ok($$ update public.notification_categories set allow_instant = true $$,
  '42501', null, 'categories are not changed over the API');

-- ---------------------------------------------------------------------------
-- Friend requests: exactly once, instant email for the request, none for the accept
-- ---------------------------------------------------------------------------
select public.send_friend_request('nt_b');
select pg_temp.as_user('b');
select is(pg_temp.n('b', 'friend_request'), 1, 'B gets one friend_request notification');
select is(pg_temp.queued('b'), 1, 'and one instant email is queued (friend requests default to instant)');
select is((select public.unread_notification_count()), 1, 'B has one unread');
select results_eq($$ select type, actor_username, entity_type from public.my_notifications() $$,
  $$ values ('friend_request'::text, 'nt_a'::text, 'friend_request'::text) $$, 'B lists it with A as the actor');
select lives_ok($$ select public.respond_friend_request((select id from public.friend_requests limit 1), true) $$, 'B accepts');
select is(pg_temp.n('a', 'friend_accepted'), 1, 'A hears the request was accepted, once');
select is(pg_temp.queued('a'), 0, 'acceptances stay in-app (no email)');
select is(pg_temp.n('b', 'friend_request'), 1, 'accepting doesn''t add another request notification');

select pg_temp.as_user('a');
select is_empty($$ select 1 from public.notifications where user_id = pg_temp.uid('b') $$,
  'A cannot read B''s notifications');
select throws_ok($$ select public.mark_notification_read((select id from public.notifications where user_id = pg_temp.uid('b') limit 1)) $$,
  'P0002', null, 'or mark them read');

-- A cancelled request takes its unread notification with it.
reset role;
delete from private.rate_limit_events;
set local role authenticated;
select pg_temp.as_user('c');
select public.send_friend_request('nt_d');
select is(pg_temp.n('d', 'friend_request'), 1, 'D gets C''s request');
select public.cancel_friend_request((select id from public.friend_requests where sender_id = pg_temp.uid('c')));
select is(pg_temp.n('d', 'friend_request'), 0, 'cancelling removes the unread notification');

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select set_config('test.v', public.create_venture('{"type":"project","title":"Robots","description":"d","team_size":6}')::text, false);
select pg_temp.as_user('c');
select set_config('test.app_c', public.apply_to_venture(pg_temp.v('v'), 'hi')::text, false);
select is(pg_temp.n('a', 'application_received'), 1, 'the owner hears about the application');
select pg_temp.as_user('a');
select results_eq($$ select data->>'venture_title' from public.my_notifications() where type = 'application_received' $$,
  $$ values ('Robots'::text) $$, 'with the venture title');
select public.decide_application(pg_temp.v('app_c'), true);
select is(pg_temp.n('c', 'application_decided'), 1, 'the candidate hears the decision once');
select is(pg_temp.status_of('c', 'application_decided'), 'accepted', 'as accepted');
select is(pg_temp.queued('c'), 1, 'and gets an instant email (applications default to instant)');

select pg_temp.as_user('d');
select set_config('test.app_d', public.apply_to_venture(pg_temp.v('v'), 'me too')::text, false);
select public.withdraw_application(pg_temp.v('app_d'));
select is(pg_temp.n('a', 'application_withdrawn'), 1, 'the owner hears about a withdrawal');
select is(pg_temp.n('a', 'application_received'), 2, 'and the second application was notified once');

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select set_config('test.inv_b', public.invite_to_venture(pg_temp.v('v'), 'nt_b')::text, false);
select is(pg_temp.n('b', 'invite_received'), 1, 'the invitee hears');
select pg_temp.as_user('b');
select public.respond_invite(pg_temp.v('inv_b'), true);
select is(pg_temp.n('a', 'invite_answered'), 1, 'the inviter hears the answer');
select pg_temp.as_user('a');
select set_config('test.inv_d', public.invite_to_venture(pg_temp.v('v'), 'nt_d')::text, false);
select is(pg_temp.n('d', 'invite_received'), 1, 'D is invited');
select public.revoke_invite(pg_temp.v('inv_d'));
select is(pg_temp.n('d', 'invite_received'), 0, 'a revoked invite takes its unread notification');

-- ---------------------------------------------------------------------------
-- Team changes and ownership
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select public.leave_venture(pg_temp.v('v'));
select is(pg_temp.n('a', 'member_left'), 1, 'the owner hears when a member leaves');
select is(pg_temp.n('b', 'member_removed'), 0, 'leaving is not "removed"');
select pg_temp.as_user('a');
select public.transfer_venture_ownership(pg_temp.v('v'), pg_temp.uid('c'));
select is(pg_temp.n('c', 'ownership_transferred'), 1, 'the new owner hears');
select is(pg_temp.n('a', 'ownership_transferred'), 0, 'the old owner, who made the change, doesn''t');
select pg_temp.as_user('c');
select public.remove_venture_member(pg_temp.v('v'), pg_temp.uid('a'));
select is(pg_temp.n('a', 'member_removed'), 1, 'a removed member hears');
select is(pg_temp.n('c', 'member_left'), 0, 'removal is not "left"');

-- Abandoning tells every other member (A and B are gone; D joins by invite first).
select set_config('test.inv_d2', public.invite_to_venture(pg_temp.v('v'), 'nt_d')::text, false);
select pg_temp.as_user('d');
select public.respond_invite(pg_temp.v('inv_d2'), true);
select pg_temp.as_user('c');
select public.transition_venture(pg_temp.v('v'), 'abandoned');
select is(pg_temp.n('d', 'venture_abandoned'), 1, 'members hear the venture was abandoned');
select is(pg_temp.n('c', 'venture_abandoned'), 0, 'but not the owner who did it');
select is(pg_temp.queued_type('d', 'venture_abandoned'), 0, 'team news is in-app only by default');

-- ---------------------------------------------------------------------------
-- Blocks, marking read, preferences
-- ---------------------------------------------------------------------------
reset role;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid('d'), pg_temp.uid('c'));
select is(private.notify(pg_temp.uid('d'), pg_temp.uid('c'), 'friend_request', 'friend_request', gen_random_uuid()), null,
  'nothing is sent between a blocked pair');
set local role authenticated;
select pg_temp.as_user('d');
select is_empty($$ select 1 from public.my_notifications() where actor_username = 'nt_c' or actor_name = 'Student C' $$,
  'earlier notifications from someone D has blocked are hidden');

select pg_temp.as_user('a');
select ok((select public.unread_notification_count()) >= 2, 'A has unread notifications');
select is((select public.mark_all_notifications_read()) > 0, true, 'mark all read');
select is((select public.unread_notification_count()), 0, 'nothing unread afterwards');

select throws_ok($$ select public.set_notification_pref('team', 'instant_email') $$, '22023', null,
  'team news cannot be emailed instantly');
select throws_ok($$ select public.set_notification_pref('nope', 'off') $$, 'P0002', null, 'unknown category');
select lives_ok($$ select public.set_notification_pref('friend_requests', 'digest') $$, 'A moves friend requests to the digest');
select results_eq($$ select channel::text from public.my_notification_settings() where category = 'friend_requests' $$,
  $$ values ('digest'::text) $$, 'and sees it saved');
reset role;
delete from private.rate_limit_events;
set local role authenticated;
select pg_temp.as_user('c');
select public.send_friend_request('nt_a');
select is(pg_temp.queued_type('a', 'friend_request'), 0, 'a digest-channel request queues no instant email');

-- ---------------------------------------------------------------------------
-- Digests: unread digest items, inactive for 24 h, never empty
-- ---------------------------------------------------------------------------
reset role;
insert into private.user_activity (user_id, last_active_at) values
  (pg_temp.uid('a'), now() - interval '2 days'),
  (pg_temp.uid('b'), now() - interval '1 hour');
select is(private.queue_notification_digests() >= 1, true, 'digests are queued');
select is((select count(*)::integer from pgmq.q_notification_emails where message->>'kind' = 'digest' and message->>'user_id' = pg_temp.uid('a')::text),
  1, 'A (inactive, unread digest item) gets a digest');
select is((select count(*)::integer from pgmq.q_notification_emails where message->>'kind' = 'digest' and message->>'user_id' = pg_temp.uid('b')::text),
  0, 'B (active an hour ago) does not');

set local role anon;
select throws_ok($$ select * from public.my_notifications() $$, '42501', null, 'signed-out visitors read nothing');
reset role;

select * from finish();
rollback;
