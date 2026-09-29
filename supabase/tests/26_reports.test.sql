-- Reports and moderation (PRD 5.12, 5.26): nothing is written or read directly; one
-- report per reporter and target, 60 s apart; reporters see nothing back; attached chat
-- context is limited to 10 earlier messages from the same chat and staff read only that;
-- 3 post reports hold the post; Appropriate crosses open a soft-signal case; only a
-- moderator with two-factor sees the queue, and must claim before acting; dismiss,
-- remove and warn each write an audit row and removal hides the content from everyone.
-- A, B, C, D study at NUTECH; M is a moderator; N has a staff role but no two-factor.
begin;
select plan(51);

insert into auth.users (id, email) values
  ('26000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('26000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('26000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('26000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk'),
  ('26000000-0000-0000-0000-00000000000e', 'm@nutech.edu.pk'),
  ('26000000-0000-0000-0000-00000000000f', 'n@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'rp_' || right(user_id::text, 1),
       full_name = 'Person ' || upper(right(user_id::text, 1))
 where user_id::text like '26000000-%';
insert into public.staff_roles (user_id, role, granted_by) values
  ('26000000-0000-0000-0000-00000000000e', 'moderator', '26000000-0000-0000-0000-00000000000e'),
  ('26000000-0000-0000-0000-00000000000f', 'moderator', '26000000-0000-0000-0000-00000000000e');

create function pg_temp.uid(p_id text) returns uuid language sql as $$ select ('26000000-0000-0000-0000-00000000000' || p_id)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_id), 'role', 'authenticated',
    'aal', case when p_id = 'e' then 'aal2' else 'aal1' end)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.clear_rl() returns void language sql security definer as $$ delete from private.rate_limit_events $$;
create function pg_temp.audit(p_action text) returns integer language sql security definer as $$
  select count(*)::integer from public.ops_audit_log where action = p_action and staff_id = '26000000-0000-0000-0000-00000000000e'
$$;
create function pg_temp.notes(p_user text, p_type text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = pg_temp.uid(p_user) and type = p_type
$$;
create function pg_temp.stage(p_post uuid) returns text language sql security definer as $$ select stage::text from public.posts where id = p_post $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.friendships (user_id_a, user_id_b) values (pg_temp.uid('a'), pg_temp.uid('b'));

set local role authenticated;
select pg_temp.as_user('a');
select set_config('test.post', public.create_post('{"audience":"university","type":"general","body":"Selling exam answers, DM me"}')::text, false);
select set_config('test.dm', public.get_or_create_dm('rp_b')::text, false);
select set_config('test.m1', public.send_message(pg_temp.v('dm'), 'hey')::text, false);
select set_config('test.m2', public.send_message(pg_temp.v('dm'), 'you are useless')::text, false);
select set_config('test.m3', public.send_message(pg_temp.v('dm'), 'nobody likes you')::text, false);
-- One transaction gives every message the same time: space them out.
reset role;
update public.chat_messages set created_at = now() - interval '3 minutes' where id = current_setting('test.m1')::uuid;
update public.chat_messages set created_at = now() - interval '2 minutes' where id = current_setting('test.m2')::uuid;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Direct writes and reads refused
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select throws_ok($$ insert into public.report_cases (target_type, target_id) values ('post', pg_temp.v('post')) $$, '42501', null,
  'cases are not inserted directly');
select throws_ok($$ insert into public.reports (case_id, reporter_id, target_type, target_id, reason)
                    values (gen_random_uuid(), pg_temp.uid('b'), 'post', pg_temp.v('post'), 'spam') $$, '42501', null,
  'reports are not inserted directly');
select throws_ok($$ insert into public.sanctions (user_id, kind, reason, staff_id) values (pg_temp.uid('a'), 'warn', 'xxx', pg_temp.uid('b')) $$,
  '42501', null, 'sanctions are not inserted directly');
select throws_ok($$ insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason)
                    values (pg_temp.uid('b'), 'x', 'x', 'x', 'xxx') $$, '42501', null, 'the audit log is not written directly');

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.submit_report('post', gen_random_uuid(), 'spam') $$, 'P0002', null, 'a missing target is refused');
select pg_temp.as_user('a');
select throws_ok($$ select public.submit_report('post', pg_temp.v('post'), 'spam') $$, '22023', null, 'nobody reports their own post');
select pg_temp.as_user('b');
select lives_ok($$ select public.submit_report('post', pg_temp.v('post'), 'spam', 'Selling answers') $$, 'B reports the post');
select is_empty($$ select 1 from public.reports $$, 'the reporter reads nothing back');
select is_empty($$ select 1 from public.report_cases $$, 'not even the case');
select throws_ok($$ select public.submit_report('post', pg_temp.v('post'), 'other') $$, '23505', null, 'one report per person and target');
select throws_ok($$ select public.submit_report('message', pg_temp.v('m3'), 'harassment') $$, '54000', null, '60 seconds between reports');
select pg_temp.clear_rl();
select throws_ok($$ select public.submit_report('message', pg_temp.v('m3'), 'harassment', null,
                    array[pg_temp.v('m1'), pg_temp.v('m2'), pg_temp.v('m3')]) $$, '22023', null, 'only earlier messages can be attached');
select throws_ok($$ select public.submit_report('message', pg_temp.v('m3'), 'harassment', null,
                    array(select gen_random_uuid() from generate_series(1, 11))) $$, '23514', null, 'at most 10');
select throws_ok($$ select public.submit_report('post', pg_temp.v('post'), 'spam', null, array[pg_temp.v('m1')]) $$, '22023', null,
  'messages attach only to a message report');
select throws_ok($$ select public.submit_report('post', pg_temp.v('post'), 'spam', repeat('x', 501)) $$, '23514', null, 'details up to 500');
select lives_ok($$ select public.submit_report('message', pg_temp.v('m3'), 'harassment', 'Keeps insulting me',
                   array[pg_temp.v('m1'), pg_temp.v('m2')]) $$, 'B reports a message with two earlier ones');
select pg_temp.as_user('c');
select throws_ok($$ select public.submit_report('message', pg_temp.v('m3'), 'harassment') $$, 'P0002', null,
  'someone outside the chat can''t report its messages');

-- Three distinct reporters hold the post.
select pg_temp.clear_rl();
select lives_ok($$ select public.submit_report('post', pg_temp.v('post'), 'spam') $$, 'C reports the post');
select pg_temp.as_user('d');
select lives_ok($$ select public.submit_report('post', pg_temp.v('post'), 'misinformation') $$, 'D reports the post');
select is(pg_temp.stage(pg_temp.v('post')), 'held', 'three reports hold the post');
select pg_temp.as_user('c');
select is_empty($$ select 1 from public.posts where id = pg_temp.v('post') and private.can_view_post(id) $$, 'readers no longer see it');

-- Profile report.
select pg_temp.clear_rl();
select lives_ok($$ select public.submit_report('profile', pg_temp.uid('a'), 'impersonation') $$, 'profiles can be reported');

-- Soft signal: Appropriate crosses reaching the threshold open a case.
select pg_temp.as_user('d');
select set_config('test.p2', public.create_post('{"audience":"university","type":"general","body":"Borderline joke"}')::text, false);
reset role;
update public.post_stats set appropriate_flags = 3 where post_id = current_setting('test.p2')::uuid;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
select pg_temp.as_user('f');
select throws_ok($$ select * from public.ops_queue() $$, '42501', null, 'a staff role without two-factor sees no queue');
select is_empty($$ select 1 from public.report_cases $$, 'nor the cases table');
select pg_temp.as_user('b');
select throws_ok($$ select public.ops_case(gen_random_uuid()) $$, '42501', null, 'a student can''t open a case');
select pg_temp.as_user('e');
select results_eq($$ select target_type::text, reports, soft_signal from public.ops_queue() order by soft_signal, target_type::text $$,
  $$ values ('message'::text, 1, false), ('post', 3, false), ('profile', 1, false), ('post', 0, true) $$,
  'the moderator sees one case per target, with counts and the soft signal');
select set_config('test.pc', (select id from public.report_cases where target_type = 'post' and target_id = pg_temp.v('post'))::text, false);
select set_config('test.mc', (select id from public.report_cases where target_type = 'message')::text, false);
select set_config('test.fc', (select id from public.report_cases where target_type = 'profile')::text, false);
select set_config('test.sc', (select id from public.report_cases where soft_signal)::text, false);
select results_eq($$ select jsonb_array_length(public.ops_case(pg_temp.v('mc'))->'messages') $$, $$ values (3) $$,
  'a message case shows the reported message and the two attached');
select results_eq($$ select (public.ops_case(pg_temp.v('pc'))->'snapshot'->>'body') $$, $$ values ('Selling exam answers, DM me'::text) $$,
  'with the snapshot taken at report time');
select is_empty($$ select 1 from public.chat_messages where thread_id = pg_temp.v('dm') $$, 'staff still can''t read the chat itself');
select throws_ok($$ select public.resolve_case(pg_temp.v('pc'), 'remove', 'Selling answers') $$, '55000', null, 'claim before acting');
select lives_ok($$ select public.claim_case(pg_temp.v('pc'), true) $$, 'the moderator claims the post case');
select throws_ok($$ select public.resolve_case(pg_temp.v('pc'), 'remove', 'no') $$, '23514', null, 'a reason is required');
select throws_ok($$ select public.resolve_case(pg_temp.v('pc'), 'suspend', 'Selling answers') $$, '22023', null,
  'no suspensions until phase 11');
select lives_ok($$ select public.resolve_case(pg_temp.v('pc'), 'remove', 'Selling exam answers', 'medium') $$, 'removes the post');
select throws_ok($$ select public.resolve_case(pg_temp.v('pc'), 'dismiss', 'changed my mind') $$, '55000', null, 'a closed case stays closed');
select pg_temp.as_user('a');
select is_empty($$ select * from public.post_cards(array[pg_temp.v('post')]) $$, 'a removed post is gone, even for its author');
select is(pg_temp.notes('a', 'content_removed'), 1, 'the author is told');
select results_eq($$ select status::text, reason from public.my_moderation_notice(pg_temp.v('pc')) $$,
  $$ values ('removed'::text, 'Selling exam answers'::text) $$, 'and can read why');

-- Message: remove; profile: warn; soft signal: dismiss.
select pg_temp.as_user('e');
select public.claim_case(pg_temp.v('mc'), true), public.resolve_case(pg_temp.v('mc'), 'remove', 'Harassment', 'high');
select pg_temp.as_user('b');
select results_eq($$ select deleted, body from public.thread_messages(pg_temp.v('dm')) where id = pg_temp.v('m3') $$,
  $$ values (true, ''::text) $$, 'a removed message is blanked in the chat');
select pg_temp.as_user('e');
select public.claim_case(pg_temp.v('fc'), true);
select throws_ok($$ select public.resolve_case(pg_temp.v('fc'), 'remove', 'Fake profile', 'low') $$,
  '22023', null, 'a profile can''t be removed here');
select lives_ok($$ select public.resolve_case(pg_temp.v('fc'), 'warn', 'Pretending to be someone else', 'low') $$, 'but its owner can be warned');
select pg_temp.as_user('a');
select results_eq($$ select kind::text from public.sanctions $$, $$ values ('warn'::text) $$, 'A sees the warning on their record');
select is(pg_temp.notes('a', 'moderation_warning'), 1, 'and was notified');
select pg_temp.as_user('b');
select is_empty($$ select 1 from public.sanctions $$, 'nobody else sees it');

-- A second moderator can't take a claimed case.
reset role;
insert into public.staff_roles (user_id, role, granted_by) values ('26000000-0000-0000-0000-00000000000d', 'moderator', '26000000-0000-0000-0000-00000000000e');
set local role authenticated;
select pg_temp.as_user('e');
select public.claim_case(pg_temp.v('sc'), true);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('d'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok($$ select public.claim_case(pg_temp.v('sc'), true) $$, '55000', null, 'a case claimed by someone else can''t be taken');
select pg_temp.as_user('e');
select lives_ok($$ select public.resolve_case(pg_temp.v('sc'), 'dismiss', 'A joke, not harmful') $$, 'the soft signal is dismissed');

-- Every staff write has an audit row.
select is(pg_temp.audit('report.claim'), 4, 'each claim is audited');
select ok(pg_temp.audit('report.remove') = 2 and pg_temp.audit('report.warn') = 1 and pg_temp.audit('report.dismiss') = 1,
  'each decision is audited with its reason');

-- A dismissed held post returns; a new report reopens a closed case.
select pg_temp.as_user('b');
select set_config('test.p3', public.create_post('{"audience":"university","type":"general","body":"Fine post"}')::text, false);
reset role;
update public.post_stats set reports = 3 where post_id = current_setting('test.p3')::uuid;
insert into public.report_cases (target_type, target_id, owner_id, reports, claimed_by, claimed_at)
values ('post', current_setting('test.p3')::uuid, '26000000-0000-0000-0000-00000000000b', 3, '26000000-0000-0000-0000-00000000000e', now());
set local role authenticated;
select is(pg_temp.stage(pg_temp.v('p3')), 'held', 'held by reports');
select pg_temp.as_user('e');
select public.resolve_case((select id from public.report_cases where target_id = pg_temp.v('p3')), 'dismiss', 'Nothing wrong');
select isnt(pg_temp.stage(pg_temp.v('p3')), 'held', 'dismissing releases the post');
select pg_temp.as_user('c');
select pg_temp.clear_rl();
select public.submit_report('post', pg_temp.v('p3'), 'spam');
select pg_temp.as_user('e');
select results_eq($$ select status::text, claimed_by_me from public.ops_queue() where id = (select id from public.report_cases where target_id = pg_temp.v('p3')) $$,
  $$ values ('open'::text, null::boolean) $$, 'a new report reopens the case, unclaimed');

select * from finish();
rollback;
