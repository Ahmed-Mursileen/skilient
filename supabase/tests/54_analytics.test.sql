-- Product analytics outbox (PRD 10; phase 13 slice 1). Changes write one message to pgmq `analytics`
-- in the same transaction; properties are ids, enums and booleans only; "first time" events fire
-- once; deleting an account queues the PostHog deletion an hour later; nobody but the database
-- itself can write to the queue. The worker's sending is covered by tests/worker/analytics-worker.
begin;
select plan(31);

create function pg_temp.n(p_user text, p_event text) returns integer language sql as $$
  select count(*)::integer from pgmq.q_analytics
   where message ->> 'distinct_id' = p_user and message ->> 'event' = p_event;
$$;
create function pg_temp.msg(p_user text, p_event text) returns jsonb language sql as $$
  select message from pgmq.q_analytics
   where message ->> 'distinct_id' = p_user and message ->> 'event' = p_event
   order by msg_id desc limit 1;
$$;

insert into auth.users (id, email) values
  ('54000000-0000-0000-0000-00000000000a', 'amna54@nutech.edu.pk'),
  ('54000000-0000-0000-0000-00000000000b', 'bilal54@nutech.edu.pk'),
  ('54000000-0000-0000-0000-00000000000c', 'chand54@nutech.edu.pk');
update public.profiles set full_name = 'Amna Analytics', username = 'amna54' where user_id = '54000000-0000-0000-0000-00000000000a';

-- ---------------------------------------------------------------------------
-- Signup funnel
-- ---------------------------------------------------------------------------
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'account_created'), 1, 'a new account is one account_created event');
select is(pg_temp.msg('54000000-0000-0000-0000-00000000000a', 'account_created') -> 'props', '{"role": "student"}'::jsonb,
  'carrying the role only');
select ok(pg_temp.msg('54000000-0000-0000-0000-00000000000a', 'account_created') -> 'set' ? 'university_id',
  'the university is set on the person, so every dashboard can filter by it');
select ok((pg_temp.msg('54000000-0000-0000-0000-00000000000a', 'account_created') -> 'set_once' ->> 'signup_week') ~ '^\d{4}-W\d{2}$',
  'and the signup week once');

update auth.users set email_confirmed_at = now() where id = '54000000-0000-0000-0000-00000000000a';
update auth.users set email_confirmed_at = null where id = '54000000-0000-0000-0000-00000000000a';
update auth.users set email_confirmed_at = now() where id = '54000000-0000-0000-0000-00000000000a';
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'email_verified'), 1, 'email_verified fires once, however often it flips');

insert into public.agreement_acceptances (user_id, version)
values ('54000000-0000-0000-0000-00000000000a', (select max(version) from public.agreement_versions));
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'agreement_accepted'), 1, 'accepting the agreement is a funnel step');

update public.onboarding_state set step = 3 where user_id = '54000000-0000-0000-0000-00000000000a';
update public.onboarding_state set step = 2 where user_id = '54000000-0000-0000-0000-00000000000a';
update public.onboarding_state set step = 3 where user_id = '54000000-0000-0000-0000-00000000000a';
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'onboarding_step'), 1, 'each onboarding step counts once, even when stepped back and forth');
select is(pg_temp.msg('54000000-0000-0000-0000-00000000000a', 'onboarding_step') -> 'props', '{"role": "student", "step": 3}'::jsonb,
  'with the step reached');
update public.onboarding_state set completed_at = now() where user_id = '54000000-0000-0000-0000-00000000000a';
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'onboarding_completed'), 1, 'finishing onboarding is an event');

-- ---------------------------------------------------------------------------
-- Proof
-- ---------------------------------------------------------------------------
insert into public.github_accounts (user_id, github_id, login) values ('54000000-0000-0000-0000-00000000000a', 5401, 'amna54gh');
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'github_connected'), 1, 'connecting GitHub is an event');
select ok(pg_temp.msg('54000000-0000-0000-0000-00000000000a', 'github_connected') -> 'props' = '{}'::jsonb,
  'without the GitHub login');

insert into public.user_skills (user_id, skill_id, level) values ('54000000-0000-0000-0000-00000000000a', 'typescript', 1);
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'first_l2_skill'), 0, 'an L1 skill is not the first L2');
update public.user_skills set level = 2 where user_id = '54000000-0000-0000-0000-00000000000a' and skill_id = 'typescript';
insert into public.user_skills (user_id, skill_id, level) values ('54000000-0000-0000-0000-00000000000a', 'python', 2);
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'first_l2_skill'), 1, 'the first L2 skill fires once, not per skill');

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------
insert into public.posts (id, author_id, university_id, audience, type, body)
select '54000000-0000-0000-0000-0000000000f1', '54000000-0000-0000-0000-00000000000a', university_id, 'university', 'general',
       'Secret post body amna54@nutech.edu.pk'
  from public.profiles where user_id = '54000000-0000-0000-0000-00000000000a';
select is(pg_temp.msg('54000000-0000-0000-0000-00000000000a', 'post_created') -> 'props',
  '{"audience": "university", "type": "general"}'::jsonb, 'post_created carries type and audience');

insert into public.post_comments (post_id, author_id, body)
values ('54000000-0000-0000-0000-0000000000f1', '54000000-0000-0000-0000-00000000000b', 'A comment');
select is(pg_temp.msg('54000000-0000-0000-0000-00000000000b', 'comment_added') -> 'props', '{"reply": false}'::jsonb,
  'comment_added says whether it was a reply');

insert into public.chat_threads (id, type, dm_key)
values ('54000000-0000-0000-0000-0000000000c1', 'dm', '54000000-0000-0000-0000-00000000000a:54000000-0000-0000-0000-00000000000b');
insert into public.chat_thread_members (thread_id, user_id) values
  ('54000000-0000-0000-0000-0000000000c1', '54000000-0000-0000-0000-00000000000a'),
  ('54000000-0000-0000-0000-0000000000c1', '54000000-0000-0000-0000-00000000000b');
insert into public.chat_messages (thread_id, sender_id, body)
values ('54000000-0000-0000-0000-0000000000c1', '54000000-0000-0000-0000-00000000000b', 'Private words');
select is(pg_temp.msg('54000000-0000-0000-0000-00000000000b', 'chat_message_sent') -> 'props',
  '{"image": false, "thread_type": "dm"}'::jsonb, 'chat_message_sent carries the thread type, never the words');

insert into public.feedback (user_id, type, body) values ('54000000-0000-0000-0000-00000000000b', 'idea', 'An idea for you');
select is(pg_temp.msg('54000000-0000-0000-0000-00000000000b', 'feedback_sent') -> 'props', '{"type": "idea"}'::jsonb, 'feedback_sent carries the type');

-- ---------------------------------------------------------------------------
-- Ventures
-- ---------------------------------------------------------------------------
insert into public.ventures (id, type, owner_id, university_id, title, description)
select '54000000-0000-0000-0000-0000000000e1', 'project', '54000000-0000-0000-0000-00000000000a', university_id, 'Timetable', 'd'
  from public.profiles where user_id = '54000000-0000-0000-0000-00000000000a';
insert into public.venture_members (venture_id, user_id, team_role) values
  ('54000000-0000-0000-0000-0000000000e1', '54000000-0000-0000-0000-00000000000a', 'lead'),
  ('54000000-0000-0000-0000-0000000000e1', '54000000-0000-0000-0000-00000000000b', 'developer');
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'venture_created'), 1, 'creating a venture is an event');
select is(pg_temp.n('54000000-0000-0000-0000-00000000000a', 'venture_joined'), 0, 'the owner''s own row is not a join');
select is(pg_temp.n('54000000-0000-0000-0000-00000000000b', 'venture_joined'), 1, 'a member joining is');

-- ---------------------------------------------------------------------------
-- Nothing personal in any message
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pgmq.q_analytics
            where message::text ~* '(amna54@|Amna Analytics|amna54gh|"amna54"|Secret post|Private words|An idea for you|A comment)'),
  0, 'no message carries an email, name, username, GitHub login or content');
select is((select count(*)::integer from pgmq.q_analytics
            where message ->> 'distinct_id' like '54000000-%' and not (message ? 'uuid' and message ? 'at')),
  0, 'every message has its own uuid and time');

-- ---------------------------------------------------------------------------
-- Refusals and deletion
-- ---------------------------------------------------------------------------
select throws_ok($$ select private.track('54000000-0000-0000-0000-00000000000a', 'Not An Event') $$, '22023', null,
  'event names are checked');
select ok(not has_function_privilege('authenticated', 'private.track(uuid, text, jsonb, jsonb, jsonb)', 'execute')
      and not has_function_privilege('anon', 'private.track(uuid, text, jsonb, jsonb, jsonb)', 'execute'),
  'signed-in and signed-out users can''t write events');
select ok(not has_table_privilege('authenticated', 'pgmq.q_analytics', 'select')
      and not has_table_privilege('anon', 'pgmq.q_analytics', 'select'),
  'nor read the queue');
select ok((select relrowsecurity from pg_class where oid = 'private.analytics_once'::regclass)
      and not has_table_privilege('authenticated', 'private.analytics_once', 'select'),
  'the once table is closed');

delete from auth.users where id = '54000000-0000-0000-0000-00000000000c';
select is((select count(*)::integer from pgmq.q_analytics
            where message ->> 'kind' = 'delete_person' and message ->> 'distinct_id' = '54000000-0000-0000-0000-00000000000c'),
  1, 'deleting an account queues the deletion of its PostHog person');
select ok((select vt from pgmq.q_analytics
            where message ->> 'kind' = 'delete_person' and message ->> 'distinct_id' = '54000000-0000-0000-0000-00000000000c')
          > now() + interval '55 minutes',
  'an hour later, after its last events are in');

select is((select jsonb_typeof(private.config('analytics.muted_events'))), 'array', 'the mute list exists, empty');
select ok(exists (select 1 from public.config_keys where key = 'analytics.muted_events'), 'and is editable in /ops/config');
select ok(exists (select 1 from cron.job where jobname = 'analytics-worker' and schedule = '* * * * *'),
  'the worker is woken every minute');

select * from finish();
rollback;
