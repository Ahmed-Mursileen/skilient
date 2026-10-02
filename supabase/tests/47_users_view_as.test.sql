-- Phase 11, slice 3 (PRD 5.26): user search and record, view-as (read-only, logged, notified,
-- never chats), staff actions on a user, and the super-admin two-factor reset.
-- A super admin, M moderator, R trust reviewer; S and F students (S and F chat), E a second
-- account sharing S's GitHub (a clash).
begin;
select plan(61);

insert into auth.users (id, email)
select ('94700000-0000-0000-0000-0000000000' || x.k)::uuid, x.e
  from (values ('01', 'vu01@nutech.edu.pk'), ('02', 'vu02@nutech.edu.pk'), ('03', 'vu03@nutech.edu.pk'),
               ('04', 'zainab.view@nutech.edu.pk'), ('05', 'vu05@nutech.edu.pk'), ('06', 'zainab.view@nu.edu.pk')) as x(k, e);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('94700000-0000-0000-0000-0000000000' || case p when 'A' then '01' when 'M' then '02' when 'R' then '03'
    when 'S' then '04' when 'F' then '05' when 'E' then '06' end)::uuid
$$;
update public.profiles set onboarding_complete = true, username = 'vu_' || right(user_id::text, 2),
       full_name = case right(user_id::text, 2) when '04' then 'Zainab Viewtest' else 'View ' || right(user_id::text, 2) end
 where user_id::text like '94700000-%';
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  (pg_temp.u('A'), 'super_admin', pg_temp.u('A')), (pg_temp.u('M'), 'moderator', pg_temp.u('A')), (pg_temp.u('R'), 'trust_reviewer', pg_temp.u('A'));
insert into public.github_accounts (user_id, github_id, login) values (pg_temp.u('S'), 94700001, 'zainab-codes');
insert into public.github_link_clashes (user_id, github_id, github_login, linked_user_id) values (pg_temp.u('E'), 94700001, 'zainab-codes', pg_temp.u('S'));
-- S has two-factor with backup codes and a session.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), pg_temp.u('S'), 'phone', 'totp', 'verified', now(), now());
insert into private.mfa_backup_codes (user_id, code_hash) select pg_temp.u('S'), encode(sha256(g::text::bytea), 'hex') from generate_series(1, 10) g;
insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), pg_temp.u('S'), now(), now());
-- A private chat between S and F, and a chat notification for S.
insert into public.chat_threads (id, type, dm_key) values ('94700000-0000-0000-0000-0000000000c1', 'dm', pg_temp.u('S') || ':' || pg_temp.u('F'));
insert into public.chat_thread_members (thread_id, user_id) values ('94700000-0000-0000-0000-0000000000c1', pg_temp.u('S')), ('94700000-0000-0000-0000-0000000000c1', pg_temp.u('F'));
insert into public.chat_messages (thread_id, sender_id, body) values ('94700000-0000-0000-0000-0000000000c1', pg_temp.u('F'), 'a private message');
insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
values (pg_temp.u('S'), pg_temp.u('F'), 'friend_request', 'friend_request', gen_random_uuid(), '{}');

create function pg_temp.as_user(p text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.audit(p_action text, p_target text) returns public.ops_audit_log language sql security definer as $$
  select * from public.ops_audit_log where action = p_action and target_id = p_target order by created_at desc limit 1
$$;
create function pg_temp.notes(p text, p_type text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = pg_temp.u(p) and type = p_type
$$;
create function pg_temp.note_reason(p text) returns text language sql security definer as $$
  select data ->> 'reason' from public.notifications where user_id = pg_temp.u(p) and type = 'account_viewed' limit 1
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search and record
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.ops_user_search('zainab')$$, '42501', null, 'a student can''t search users');
select throws_ok($$select public.ops_user_record(pg_temp.u('F'))$$, '42501', null, 'or read a record');
select pg_temp.as_user('M', 'aal1');
select throws_ok($$select public.ops_user_search('zainab')$$, '42501', null, 'staff without two-factor on can''t search');

select pg_temp.as_user('M');
select is(public.ops_user_search('z'), '[]'::jsonb, 'one character finds nothing');
select is((public.ops_user_search('zainab.view@nutech.edu.pk') -> 0 ->> 'user_id'), pg_temp.u('S')::text, 'an exact email comes first');
select ok(exists (select 1 from jsonb_array_elements(public.ops_user_search('viewtest')) x where x ->> 'user_id' = pg_temp.u('S')::text), 'part of a name');
select is((public.ops_user_search('@vu_04') -> 0 ->> 'user_id'), pg_temp.u('S')::text, 'a username');
select is((public.ops_user_search('zainab-codes') -> 0 ->> 'user_id'), pg_temp.u('S')::text, 'a GitHub login');
select is((public.ops_user_search('94700001') -> 0 ->> 'user_id'), pg_temp.u('S')::text, 'a GitHub id');
select is(public.ops_user_search('100%_'), '[]'::jsonb, 'wildcards in the query are literal');

select is((public.ops_user_record(pg_temp.u('S')) -> 'account' ->> 'two_factor')::boolean, true, 'the record shows two-factor');
select is((public.ops_user_record(pg_temp.u('S')) -> 'account' ->> 'backup_codes')::integer, 10, 'and unused backup codes');
select is((public.ops_user_record(pg_temp.u('S')) -> 'github' ->> 'login'), 'zainab-codes', 'and GitHub');
select ok(exists (select 1 from jsonb_array_elements(public.ops_user_record(pg_temp.u('S')) -> 'hints') h
                   where h ->> 'user_id' = pg_temp.u('E')::text and h ->> 'why' = 'same GitHub account'), 'a GitHub clash is a ban-evasion hint');
select ok(not (public.ops_user_record(pg_temp.u('S'))::text like '%a private message%'), 'the record holds no chat content');
select throws_ok($$select public.ops_user_record('94700000-0000-0000-0000-0000000000ff')$$, 'P0002', null, 'an unknown account is not found');
-- Same email name at another domain counts only when that account is restricted.
reset role;
insert into public.sanctions (user_id, kind, until, reason, staff_id) values (pg_temp.u('E'), 'suspend', now() + interval '2 days', 'Spam', pg_temp.u('A'));
set local role authenticated;
select pg_temp.as_user('M');
select ok(exists (select 1 from jsonb_array_elements(public.ops_user_record(pg_temp.u('S')) -> 'hints') h
                   where h ->> 'why' = 'same email name at nu.edu.pk' and h ->> 'restriction' = 'suspend'), 'and so is a restricted account with the same email name');

-- ---------------------------------------------------------------------------
-- Trust actions on a user
-- ---------------------------------------------------------------------------
select throws_ok($$select public.ops_github_resync(pg_temp.u('S'), 'Missing commits')$$, '42501', null, 'a moderator can''t force a GitHub re-sync');
select pg_temp.as_user('R');
select throws_ok($$select public.ops_github_resync(pg_temp.u('F'), 'Missing commits')$$, '55000', null, 'not without a connected GitHub');
select throws_ok($$select public.ops_github_resync(pg_temp.u('S'), '')$$, '22023', null, 'a reason is required');
select ok(public.ops_github_resync(pg_temp.u('S'), 'Student reports missing commits') > 0, 'a trust reviewer queues a re-sync');
select is((pg_temp.audit('user.github_resync', pg_temp.u('S')::text)).after ->> 'status', 'queued', 'audited with the job after');
select is((pg_temp.audit('user.github_resync', pg_temp.u('S')::text)).before, '{}'::jsonb, 'and nothing before');
select lives_ok($$select public.ops_recompute_skills(pg_temp.u('S'), 'Levels look stale')$$, 'and recomputes skills');
select ok((pg_temp.audit('user.recompute_skills', pg_temp.u('S')::text)).after ? 'levels', 'audited with the levels before and after');

-- ---------------------------------------------------------------------------
-- View as user
-- ---------------------------------------------------------------------------
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.ops_view_as_start(pg_temp.u('F'), 'curious')$$, '42501', null, 'a student can''t view as another user');
select throws_ok($$select * from public.ops_view_sessions$$, '42501', null, 'view sessions are not readable by clients');
select pg_temp.as_user('M');
select throws_ok($$select * from public.ops_view_sessions$$, '42501', null, 'not even by staff (the audit log is the record)');
select throws_ok($$insert into public.ops_view_sessions (staff_id, user_id, reason) values (pg_temp.u('M'), pg_temp.u('S'), 'direct')$$,
  '42501', null, 'and not writable');
select throws_ok($$select public.ops_view_as_page(pg_temp.u('S'), 'profile')$$, '42501', 'start a view first, with a reason',
  'a page needs a view session first');
select throws_ok($$select public.ops_view_as_start(pg_temp.u('S'), ' ')$$, '22023', null, 'starting needs a reason');
select throws_ok($$select public.ops_view_as_start(pg_temp.u('M'), 'testing myself')$$, '22023', null, 'not your own account');
select lives_ok($$select public.ops_view_as_start(pg_temp.u('S'), 'Checking a reported profile problem')$$, 'a moderator starts a view with a reason');
select is(pg_temp.notes('S', 'account_viewed'), 1, 'the user is told');
select is(pg_temp.note_reason('S'), 'Checking a reported profile problem', 'with the reason');
select is((pg_temp.audit('view_as.start', pg_temp.u('S')::text)).reason, 'Checking a reported profile problem', 'and it is audited');
select is((public.ops_view_as_page(pg_temp.u('S'), 'profile') -> 'doc' ->> 'name'), 'Zainab Viewtest', 'the profile page reads as the user sees it');
select ok(public.ops_view_as_page(pg_temp.u('S'), 'me') -> 'doc' ? 'skills', 'so do Me');
select ok(public.ops_view_as_page(pg_temp.u('S'), 'cv') -> 'doc' ? 'records', 'the CV page');
select ok(public.ops_view_as_page(pg_temp.u('S'), 'opportunities') -> 'doc' ? 'applications', 'opportunities');
select ok(public.ops_view_as_page(pg_temp.u('S'), 'privacy') -> 'doc' ? 'visibility', 'privacy');
select is(jsonb_array_length(public.ops_view_as_page(pg_temp.u('S'), 'notifications') -> 'doc' -> 'items'), 2,
  'and notifications (the friend request and the view notice)');
reset role;
insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, data)
values (pg_temp.u('S'), pg_temp.u('F'), 'chat_message', 'chat_thread', '94700000-0000-0000-0000-0000000000c1', '{"excerpt":"a private message"}');
set local role authenticated;
select pg_temp.as_user('M');
select ok(not ((public.ops_view_as_page(pg_temp.u('S'), 'notifications'))::text like '%a private message%'),
  'chat notifications never appear in view-as');
select throws_ok($$select public.ops_view_as_page(pg_temp.u('S'), 'chat')$$, '22023', null, 'and there is no chat page');
reset role;
select is((select array_length(pages, 1) from public.ops_view_sessions where staff_id = pg_temp.u('M') and user_id = pg_temp.u('S')), 7,
  'every page viewed is recorded on the session');
update public.ops_view_sessions set started_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where staff_id = pg_temp.u('M');
set local role authenticated;
select pg_temp.as_user('M');
select throws_ok($$select public.ops_view_as_page(pg_temp.u('S'), 'profile')$$, '42501', null, 'a view lasts an hour');

-- ---------------------------------------------------------------------------
-- A moderator can't open a chat outside a report
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.chat_messages), 0, 'a moderator reads no chat messages');
select is((select count(*)::integer from public.chat_threads), 0, 'or threads');
select is((select count(*)::integer from public.thread_messages('94700000-0000-0000-0000-0000000000c1')), 0,
  'and the thread function returns nothing for a non-member');
select pg_temp.as_user('A');
select is((select count(*)::integer from public.chat_messages), 0, 'nor does a super admin');

-- ---------------------------------------------------------------------------
-- Reset two-factor
-- ---------------------------------------------------------------------------
select pg_temp.as_user('R');
select throws_ok($$select public.ops_reset_mfa(pg_temp.u('S'), 'Called the switchboard and confirmed by video')$$, '42501', null,
  'only a super admin resets two-factor');
select pg_temp.as_user('A');
select throws_ok($$select public.ops_reset_mfa(pg_temp.u('S'), 'checked')$$, '22023', null, 'the identity-check note must say how');
select throws_ok($$select public.ops_reset_mfa(pg_temp.u('A'), 'Resetting my own factors for a test')$$, '42501', null, 'not your own');
select is(public.ops_reset_mfa(pg_temp.u('S'), 'Request from her university email; confirmed on a video call with her student card'),
  'zainab.view@nutech.edu.pk', 'a super admin resets it and gets the email to notify');
reset role;
select is((select count(*)::integer from auth.mfa_factors where user_id = pg_temp.u('S')), 0, 'authenticators are gone');
select is((select count(*)::integer from private.mfa_backup_codes where user_id = pg_temp.u('S')), 0, 'and backup codes');
select is((select count(*)::integer from auth.sessions where user_id = pg_temp.u('S')), 0, 'and every session');
select is((pg_temp.audit('user.mfa_reset', pg_temp.u('S')::text)).before, '{"factors": 1, "backup_codes": 10}'::jsonb, 'audited with the before');
select is((pg_temp.audit('user.mfa_reset', pg_temp.u('S')::text)).after ->> 'factors', '0', 'and after');
select is(pg_temp.notes('S', 'mfa_reset'), 1, 'and the user gets an in-app notice');
set local role authenticated;
select pg_temp.as_user('A');
select throws_ok($$select public.ops_reset_mfa(pg_temp.u('S'), 'Request from her university email again today')$$, '55000', null,
  'nothing left to reset');

select * from finish();
rollback;
