-- Phase 12, slice 4 (PRD 5.1): opening a university queues one launch email per confirmed request, once.
begin;
select plan(7);

insert into public.universities (id, name, city, slug, live_at) values
  ('95200000-0000-0000-0000-0000000000a1', 'Launch SQL University', 'Sukkur', 'launch-sql-university', null);
insert into public.university_requests (email, domain, university_id, consent, token_hash, confirmed_at, unsubscribed_at) values
  ('yes52@launch-sql.edu.pk', 'launch-sql.edu.pk', '95200000-0000-0000-0000-0000000000a1', true, repeat('a', 64), now(), null),
  ('pending52@launch-sql.edu.pk', 'launch-sql.edu.pk', '95200000-0000-0000-0000-0000000000a1', true, repeat('b', 64), null, null),
  ('gone52@launch-sql.edu.pk', 'launch-sql.edu.pk', '95200000-0000-0000-0000-0000000000a1', true, repeat('c', 64), now(), now());
select pgmq.purge_queue('notification_emails');

update public.universities set live_at = now() where id = '95200000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from pgmq.q_notification_emails where message->>'kind' = 'university_launch'), 1,
  'opening the university queues one email: confirmed, not unsubscribed');
select ok((select notified_at is not null from public.university_requests where email = 'yes52@launch-sql.edu.pk'), 'the request is marked as notified');
select ok((select notified_at is null from public.university_requests where email = 'pending52@launch-sql.edu.pk'), 'unconfirmed requests wait');

update public.universities set live_at = null where id = '95200000-0000-0000-0000-0000000000a1';
update public.universities set live_at = now() where id = '95200000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from pgmq.q_notification_emails where message->>'kind' = 'university_launch'), 1, 'reopening emails nobody twice');

select is((select email from private.university_launch_email((select id from public.university_requests where email = 'yes52@launch-sql.edu.pk'))),
  'yes52@launch-sql.edu.pk', 'the worker reads the address while the request still wants it');

set local role anon;
select throws_ok($$select private.queue_university_launch('95200000-0000-0000-0000-0000000000a1')$$, '42501', null, 'visitors cannot queue launch emails');
reset role;
set local role authenticated;
select throws_ok($$select * from private.university_launch_email(gen_random_uuid())$$, '42501', null, 'signed-in users cannot read requesters');
reset role;

select * from finish();
rollback;
