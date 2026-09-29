-- Phase 3 follow-up (decisions.md 2026-09-30): image files are queued for deletion when
-- their post is deleted or removed, a chat image's message is deleted or removed, or a
-- profile photo is replaced or cleared; moderators can clear a profile's bio and photo
-- and unlist a venture, each audited and notified by instant email by default; the
-- queue and the new actions can't be reached by students.
-- A and B study at NUTECH; M is a moderator.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('27000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('27000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('27000000-0000-0000-0000-00000000000e', 'm@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'pa_' || right(user_id::text, 1),
       full_name = 'Person ' || upper(right(user_id::text, 1))
 where user_id::text like '27000000-%';
insert into public.staff_roles (user_id, role, granted_by)
values ('27000000-0000-0000-0000-00000000000e', 'moderator', '27000000-0000-0000-0000-00000000000e');

create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('27000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_id), 'role', 'authenticated',
    'aal', case when p_id = 'e' then 'aal2' else 'aal1' end)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.clear_rl() returns void language sql security definer as $$ delete from private.rate_limit_events $$;
create function pg_temp.queued(p_bucket text, p_path text) returns boolean language sql security definer as $$
  select exists (select 1 from pgmq.q_storage_cleanup where message->>'bucket' = p_bucket and message->>'path' = p_path)
$$;
create function pg_temp.claim_and(p_case uuid, p_action text, p_reason text) returns void language sql as $$
  select public.claim_case(p_case, true); select public.resolve_case(p_case, p_action, p_reason);
$$;
grant execute on all functions in schema pg_temp to authenticated;

select pgmq.purge_queue('storage_cleanup');
insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('b'));

-- ---------------------------------------------------------------------------
-- Storage cleanup queue
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('a');
select set_config('test.p1', public.create_post('{"audience":"university","type":"general","body":"Post one"}')::text, false);
select pg_temp.clear_rl();
select set_config('test.p2', public.create_post('{"audience":"university","type":"general","body":"Post two"}')::text, false);
select set_config('test.dm', public.get_or_create_dm('pa_b')::text, false);
reset role;
insert into public.post_media (post_id, position, path, width, height) values
  (current_setting('test.p1')::uuid, 1, '27000000-0000-0000-0000-00000000000a/11111111-1111-1111-1111-111111111111.webp', 10, 10),
  (current_setting('test.p2')::uuid, 1, '27000000-0000-0000-0000-00000000000a/22222222-2222-2222-2222-222222222222.webp', 10, 10);
insert into public.chat_messages (id, thread_id, sender_id, body, media_path, media_width, media_height)
values ('27000000-0000-0000-0000-0000000000c1', current_setting('test.dm')::uuid, '27000000-0000-0000-0000-00000000000a', '',
        current_setting('test.dm') || '/33333333-3333-3333-3333-333333333333.webp', 10, 10);
update public.profiles set avatar_path = '27000000-0000-0000-0000-00000000000a/44444444-4444-4444-4444-444444444444.webp',
       bio = 'Selling answers'
 where user_id = '27000000-0000-0000-0000-00000000000a';
set local role authenticated;

select throws_ok($$ select pgmq.send('storage_cleanup', '{}'::jsonb) $$, '42501', null, 'students can''t write to the queue');
select throws_ok($$ select private.queue_storage_cleanup('avatars', 'x') $$, '42501', null, 'nor call the queue function');
select pg_temp.as_user('a');
select public.delete_post(pg_temp.v('p1'));
select ok(pg_temp.queued('post-media', '27000000-0000-0000-0000-00000000000a/11111111-1111-1111-1111-111111111111.webp'),
  'deleting a post queues its image for deletion');
select public.delete_message('27000000-0000-0000-0000-0000000000c1');
select ok(pg_temp.queued('chat-media', current_setting('test.dm') || '/33333333-3333-3333-3333-333333333333.webp'),
  'deleting a chat image''s message queues the image');

-- ---------------------------------------------------------------------------
-- Moderation: removing a post removes its images; clear profile; unlist venture
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select public.submit_report('post', pg_temp.v('p2'), 'spam');
select pg_temp.clear_rl();
select public.submit_report('profile', pg_temp.uid('a'), 'impersonation');
select pg_temp.as_user('a');
select set_config('test.v', public.create_venture('{"type":"project","title":"Answer shop","description":"d"}')::text, false);
select pg_temp.as_user('b');
select pg_temp.clear_rl();
select public.submit_report('venture', pg_temp.v('v'), 'spam');
reset role;
select set_config('test.pc', (select id::text from public.report_cases where target_type = 'post'), false);
select set_config('test.fc', (select id::text from public.report_cases where target_type = 'profile'), false);
select set_config('test.vc', (select id::text from public.report_cases where target_type = 'venture'), false);
set local role authenticated;

select pg_temp.as_user('b');
select throws_ok($$ select public.resolve_case(pg_temp.v('fc'), 'clear_profile', 'Fake photo') $$, '42501', null,
  'a student can''t clear a profile');
select pg_temp.as_user('e');
select pg_temp.claim_and(pg_temp.v('pc'), 'remove', 'Selling answers');
select ok(pg_temp.queued('post-media', '27000000-0000-0000-0000-00000000000a/22222222-2222-2222-2222-222222222222.webp'),
  'removing a post queues its images');
reset role;
select is((select count(*)::integer from public.post_media where post_id = current_setting('test.p2')::uuid), 0,
  'and drops its image rows');
set local role authenticated;
select pg_temp.as_user('e');
select public.claim_case(pg_temp.v('fc'), true);
select throws_ok($$ select public.resolve_case(pg_temp.v('fc'), 'unlist', 'x x x') $$, '22023', null, 'a profile can''t be unlisted');
select throws_ok($$ select public.resolve_case(pg_temp.v('fc'), 'remove', 'x x x') $$, '22023', null, 'or removed');
select lives_ok($$ select public.resolve_case(pg_temp.v('fc'), 'clear_profile', 'Impersonating a teacher') $$, 'but its bio and photo can be cleared');
reset role;
select results_eq($$ select bio, avatar_path from public.profiles where user_id = '27000000-0000-0000-0000-00000000000a' $$,
  $$ values (null::text, null::text) $$, 'the bio and photo are gone');
select ok(pg_temp.queued('avatars', '27000000-0000-0000-0000-00000000000a/44444444-4444-4444-4444-444444444444.webp'),
  'and the photo file is queued for deletion');
set local role authenticated;
select pg_temp.as_user('e');
select public.claim_case(pg_temp.v('vc'), true);
select throws_ok($$ select public.resolve_case(pg_temp.v('vc'), 'clear_profile', 'x x x') $$, '22023', null, 'a venture has no profile to clear');
select lives_ok($$ select public.resolve_case(pg_temp.v('vc'), 'unlist', 'Selling exam answers') $$, 'but it can be unlisted');
reset role;
select is((select visibility::text from public.ventures where id = current_setting('test.v')::uuid), 'unlisted', 'the venture is unlisted');
select results_eq($$ select action, reason from public.ops_audit_log where target_id in (current_setting('test.fc'), current_setting('test.vc'))
                      and action not in ('report.claim') order by action $$,
  $$ values ('report.clear_profile'::text, 'Impersonating a teacher'::text), ('report.unlist', 'Selling exam answers') $$,
  'both are in the audit log with their reasons');
select results_eq($$ select before->>'bio', after->>'bio' from public.ops_audit_log where action = 'report.clear_profile' $$,
  $$ values ('Selling answers'::text, null::text) $$, 'with what was there before');
set local role authenticated;
select pg_temp.as_user('a');
select results_eq($$ select action from public.my_moderation_notice(pg_temp.v('vc')) $$, $$ values ('unlist'::text) $$,
  'the owner''s notice names the action');
reset role;
select is((select default_channel::text from public.notification_categories where category = 'account'), 'instant_email',
  'moderation notices are instant email by default');

select * from finish();
rollback;
