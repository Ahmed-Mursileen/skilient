-- Phase 11, slice 1 (PRD 5.26): the ops inbox, staff roles management and the audit viewer.
-- A and B are super admins, M a moderator, R a trust reviewer, C accounts staff, S a student,
-- N an account with no two-factor. Staff sessions are aal2 unless a test says otherwise.
begin;
select plan(52);

insert into auth.users (id, email)
select ('94500000-0000-0000-0000-0000000000' || x.k)::uuid, 'os' || x.k || '@nutech.edu.pk'
  from (values ('01'), ('02'), ('03'), ('04'), ('05'), ('06'), ('07')) as x(k);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('94500000-0000-0000-0000-0000000000' || case p when 'A' then '01' when 'B' then '02' when 'M' then '03'
    when 'R' then '04' when 'C' then '05' when 'S' then '06' when 'N' then '07' end)::uuid
$$;
update public.profiles set onboarding_complete = true, username = 'os_' || right(user_id::text, 2),
       full_name = 'Ops ' || right(user_id::text, 2)
 where user_id::text like '94500000-%';
-- Only this test's super admins exist inside the transaction.
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  (pg_temp.u('A'), 'super_admin', pg_temp.u('A')), (pg_temp.u('M'), 'moderator', pg_temp.u('A')),
  (pg_temp.u('R'), 'trust_reviewer', pg_temp.u('A')), (pg_temp.u('C'), 'accounts', pg_temp.u('A'));
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select gen_random_uuid(), pg_temp.u(x), 'phone ' || x, 'totp', 'verified', now(), now()
  from unnest(array['A', 'B', 'M', 'R', 'C', 'S']) as x;

create function pg_temp.as_user(p text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.audits(p_action text, p_target text) returns bigint language sql as $$
  select count(*) from public.ops_audit_log where action = p_action and target_id = p_target
$$;
create function pg_temp.queue_total(p_inbox jsonb, p_queue text) returns integer language sql as $$
  select coalesce((select (q ->> 'total')::integer from jsonb_array_elements(p_inbox -> 'queues') q where q ->> 'queue' = p_queue), 0)
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Queue fixtures: one open report case, one pending credential, one feedback item.
insert into public.report_cases (id, target_type, target_id, owner_id, snapshot, reports, opened_at)
values ('94500000-0000-0000-0000-00000000aa01', 'post', gen_random_uuid(), pg_temp.u('S'), '{"body":"inbox test post"}', 1, now() - interval '30 hours');
insert into public.feedback (id, user_id, type, body) values ('94500000-0000-0000-0000-00000000aa02', pg_temp.u('S'), 'bug', 'inbox test feedback');

-- ---------------------------------------------------------------------------
-- Inbox
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('S');
select throws_ok($$select public.ops_inbox()$$, '42501', null, 'a student can''t open the inbox');
select pg_temp.as_user('M', 'aal1');
select throws_ok($$select public.ops_inbox()$$, '42501', null, 'staff without two-factor on can''t open the inbox');

select pg_temp.as_user('M');
select ok(pg_temp.queue_total(public.ops_inbox(), 'reports') >= 1, 'a moderator sees the reports queue');
select is(pg_temp.queue_total(public.ops_inbox(), 'credentials'), 0, 'but not trust queues');
select ok(pg_temp.queue_total(public.ops_inbox(), 'feedback') >= 1, 'feedback is open to every staff role');
select ok((select (q ->> 'overdue')::integer from jsonb_array_elements(public.ops_inbox() -> 'queues') q where q ->> 'queue' = 'reports') >= 1,
  'a report waiting 30 hours is past the 24-hour mark');
select ok(exists (select 1 from jsonb_array_elements(public.ops_inbox('reports') -> 'items') i
                   where i ->> 'id' = '94500000-0000-0000-0000-00000000aa01' and (i ->> 'claimable')::boolean
                     and i ->> 'href' = '/ops/reports/94500000-0000-0000-0000-00000000aa01'),
  'the item links to its report page and can be claimed');
select is((select count(*)::integer from jsonb_array_elements(public.ops_inbox('feedback') -> 'items') i where i ->> 'queue' <> 'feedback'), 0,
  'filtering by queue returns only that queue');

-- Claiming through the queue's own function shows in the inbox for everyone.
select lives_ok($$select public.claim_case('94500000-0000-0000-0000-00000000aa01', true)$$, 'the moderator claims the case');
select is((select (i ->> 'claimed_by_me')::boolean from jsonb_array_elements(public.ops_inbox('reports') -> 'items') i
            where i ->> 'id' = '94500000-0000-0000-0000-00000000aa01'), true, 'the inbox shows it as theirs');
select pg_temp.as_user('A');
select is((select i ->> 'claimed_by_name' from jsonb_array_elements(public.ops_inbox('reports') -> 'items') i
            where i ->> 'id' = '94500000-0000-0000-0000-00000000aa01'), 'Ops 03', 'another staff member sees who has it');
select throws_ok($$select public.claim_case('94500000-0000-0000-0000-00000000aa01', true)$$, '55000', null,
  'and can''t take it');
select pg_temp.as_user('R');
select is(pg_temp.queue_total(public.ops_inbox(), 'reports'), 0, 'a trust reviewer doesn''t see reports');
select ok(public.ops_inbox() ? 'items', 'but has an inbox');
select pg_temp.as_user('A');
select ok(pg_temp.queue_total(public.ops_inbox(), 'reports') >= 1, 'a super admin sees every queue');

-- ---------------------------------------------------------------------------
-- Staff roles
-- ---------------------------------------------------------------------------
select pg_temp.as_user('M');
select throws_ok($$select public.ops_staff()$$, '42501', null, 'a moderator can''t list staff');
select throws_ok($$select public.grant_staff_role('os02@nutech.edu.pk', 'moderator', 'helping out')$$, '42501', null,
  'or grant roles');
select throws_ok($$select public.revoke_staff_role(pg_temp.u('R'), 'trust_reviewer', 'not needed')$$, '42501', null,
  'or revoke them');
select pg_temp.as_user('A', 'aal1');
select throws_ok($$select public.grant_staff_role('os02@nutech.edu.pk', 'moderator', 'helping out')$$, '42501', null,
  'a super admin without two-factor on can''t grant roles');

select pg_temp.as_user('A');
select ok(jsonb_array_length(public.ops_staff()) >= 4, 'a super admin lists staff');
select is((select (s ->> 'two_factor')::boolean from jsonb_array_elements(public.ops_staff()) s where s ->> 'user_id' = pg_temp.u('M')::text),
  true, 'with their two-factor state');
select throws_ok($$select public.grant_staff_role('os07@nutech.edu.pk', 'moderator', 'new hire')$$, '55000', null,
  'an account without two-factor can''t be given a role');
select throws_ok($$select public.grant_staff_role('nobody@nutech.edu.pk', 'moderator', 'new hire')$$, 'P0002', null,
  'an unknown email is refused');
select throws_ok($$select public.grant_staff_role('os02@nutech.edu.pk', 'moderator', '  ')$$, '22023', null,
  'a reason is required');
select throws_ok($$select public.grant_staff_role('os03@nutech.edu.pk', 'moderator', 'again')$$, '23505', null,
  'granting a role the account already has is refused');
select is(public.grant_staff_role('OS02@nutech.edu.pk', 'super_admin', 'second super admin for appeals'), pg_temp.u('B'),
  'a super admin grants a role by email (case-insensitive)');
select is(pg_temp.audits('staff.grant', pg_temp.u('B')::text), 1::bigint, 'the grant is audited');
select is((select before from public.ops_audit_log where action = 'staff.grant' and target_id = pg_temp.u('B')::text),
  '{"roles": []}'::jsonb, 'with the roles before');
select is((select after from public.ops_audit_log where action = 'staff.grant' and target_id = pg_temp.u('B')::text),
  '{"roles": ["super_admin"]}'::jsonb, 'and after');
select is((select reason from public.ops_audit_log where action = 'staff.grant' and target_id = pg_temp.u('B')::text),
  'second super admin for appeals', 'and the reason');
select is((select granted_by from public.staff_roles where user_id = pg_temp.u('B')), pg_temp.u('A'), 'staff_roles records who granted it');

select lives_ok($$select public.grant_staff_role('os03@nutech.edu.pk', 'trust_reviewer', 'covering evidence')$$, 'a second role for M');
select lives_ok($$select public.revoke_staff_role(pg_temp.u('M'), 'trust_reviewer', 'cover ended')$$, 'and revoked');
select is((select before from public.ops_audit_log where action = 'staff.revoke' and target_id = pg_temp.u('M')::text),
  '{"roles": ["moderator", "trust_reviewer"]}'::jsonb, 'the revocation is audited with the roles before');
select is((select after from public.ops_audit_log where action = 'staff.revoke' and target_id = pg_temp.u('M')::text),
  '{"roles": ["moderator"]}'::jsonb, 'and after');
select throws_ok($$select public.revoke_staff_role(pg_temp.u('M'), 'trust_reviewer', 'again')$$, 'P0002', null,
  'revoking a role they don''t have is refused');
select throws_ok($$select public.revoke_staff_role(pg_temp.u('A'), 'super_admin', 'stepping down')$$, '42501', null,
  'a super admin can''t remove their own super admin role');
select lives_ok($$select public.revoke_staff_role(pg_temp.u('B'), 'super_admin', 'no longer needed')$$, 'A removes B''s super admin role');
select pg_temp.as_user('B');
select throws_ok($$select public.ops_staff()$$, '42501', null, 'B is no longer a super admin on the next request');
reset role;
-- B again, then B tries to remove A: allowed (A isn't the last); then A can't remove B (last).
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('B'), 'super_admin', pg_temp.u('A'));
set local role authenticated;
select pg_temp.as_user('B');
select lives_ok($$select public.revoke_staff_role(pg_temp.u('A'), 'super_admin', 'handover')$$, 'one super admin removes another');
reset role;
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('A'), 'moderator', pg_temp.u('B'));
delete from public.staff_roles where user_id = pg_temp.u('B') and role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('A'), 'super_admin', pg_temp.u('B'));
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('B'), 'accounts', pg_temp.u('A'));
set local role authenticated;
select pg_temp.as_user('A');
select is((select count(*)::integer from public.staff_roles where role = 'super_admin'), 1, 'A is the only super admin');
select throws_ok($$select public.revoke_staff_role(pg_temp.u('A'), 'super_admin', 'oops')$$, '42501', null,
  'and can''t remove themselves');

-- No direct writes to staff_roles from any client.
select throws_ok($$insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('S'), 'moderator', pg_temp.u('A'))$$,
  '42501', null, 'staff_roles has no direct inserts, even for a super admin');
select throws_ok($$delete from public.staff_roles where user_id = pg_temp.u('M')$$, '42501', null, 'or deletes');

-- ---------------------------------------------------------------------------
-- Audit log viewer and export
-- ---------------------------------------------------------------------------
select pg_temp.as_user('S');
select throws_ok($$select public.ops_audit_search()$$, '42501', null, 'a student can''t read the audit log');
select pg_temp.as_user('M');
select ok(jsonb_array_length(public.ops_audit_search(p_action => 'staff.grant')) >= 1, 'any staff role reads the audit log');
select is((select count(*)::integer from jsonb_array_elements(public.ops_audit_search(p_action => 'staff.revoke', p_target_id => pg_temp.u('M')::text)) r),
  1, 'filters by action and target');
select ok(public.ops_audit_filters() -> 'actions' ? 'staff.grant', 'the filter options list the actions in use');
select throws_ok($$select public.ops_audit_export('quarterly review')$$, '42501', null, 'only super admins export');
select pg_temp.as_user('A');
select throws_ok($$select public.ops_audit_export('')$$, '22023', null, 'an export needs a reason');
select ok(jsonb_array_length(public.ops_audit_export('quarterly review', p_action => 'staff.grant')) >= 1, 'a super admin exports matching rows');
select is((select after ->> 'rows' from public.ops_audit_log where action = 'audit.export' and staff_id = pg_temp.u('A') order by created_at desc limit 1),
  (select count(*)::text from public.ops_audit_log where action = 'staff.grant'), 'the export is audited with its row count');

select * from finish();
rollback;
