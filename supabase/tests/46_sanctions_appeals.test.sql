-- Phase 11, slice 2 (PRD 5.26): sanctions with role limits and appeals.
-- A super admin, M and N moderators, C accounts staff, R trust reviewer; S, T students; P a
-- recruiter (admin of org O). Staff sessions are aal2.
begin;
select plan(86);

insert into auth.users (id, email)
select ('94600000-0000-0000-0000-0000000000' || x.k)::uuid, 'sa' || x.k || '@nutech.edu.pk'
  from (values ('01'), ('02'), ('03'), ('04'), ('05'), ('06'), ('07'), ('08')) as x(k);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('94600000-0000-0000-0000-0000000000' || case p when 'A' then '01' when 'M' then '02' when 'N' then '03'
    when 'C' then '04' when 'R' then '05' when 'S' then '06' when 'T' then '07' when 'P' then '08' end)::uuid
$$;
update public.profiles set onboarding_complete = true, username = 'sa_' || right(user_id::text, 2),
       full_name = 'Sanction ' || right(user_id::text, 2)
 where user_id::text like '94600000-%';
delete from public.staff_roles where role = 'super_admin';
insert into public.staff_roles (user_id, role, granted_by) values
  (pg_temp.u('A'), 'super_admin', pg_temp.u('A')), (pg_temp.u('M'), 'moderator', pg_temp.u('A')),
  (pg_temp.u('N'), 'moderator', pg_temp.u('A')), (pg_temp.u('C'), 'accounts', pg_temp.u('A')),
  (pg_temp.u('R'), 'trust_reviewer', pg_temp.u('A'));
insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status)
values ('94600000-0000-0000-0000-00000000000f', 'sanction-co', 'Sanction Co', 'sanction-co.pk', 'https://sanction-co.pk',
        'Software', '11-50', 'Lahore', 'Founder', 'verified');
insert into public.org_members (org_id, user_id, role) values ('94600000-0000-0000-0000-00000000000f', pg_temp.u('P'), 'admin');

create function pg_temp.as_user(p text, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.audit(p_action text, p_target text) returns public.ops_audit_log language sql as $$
  select * from public.ops_audit_log where action = p_action and target_id = p_target order by created_at desc limit 1
$$;
create function pg_temp.clear_rl() returns void language sql security definer as $$ delete from private.rate_limit_events $$;
create function pg_temp.notes(p text, p_type text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = pg_temp.u(p) and type = p_type
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- No direct writes
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('A');
select throws_ok($$insert into public.sanctions (user_id, kind, reason, staff_id) values (pg_temp.u('S'), 'warn', 'direct', pg_temp.u('A'))$$,
  '42501', null, 'sanctions have no direct inserts');
select throws_ok($$insert into public.appeals (decision_type, decision_id, appellant_id, body, original_staff_id, decider_role)
                   values ('sanction', gen_random_uuid(), pg_temp.u('S'), 'please reconsider', pg_temp.u('M'), 'moderator')$$,
  '42501', null, 'appeals have no direct inserts');
select pg_temp.as_user('S');
select is((select count(*)::integer from public.appeals), 0, 'a student reads no one else''s appeals');

-- ---------------------------------------------------------------------------
-- Role limits
-- ---------------------------------------------------------------------------
select pg_temp.as_user('S');
select throws_ok($$select public.sanction_user(pg_temp.u('T'), 'warn', null, 'rude')$$, '42501', null, 'a student can''t sanction');
select pg_temp.as_user('M', 'aal1');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'suspend', now() + interval '1 day', 'spam')$$, '42501', null,
  'a moderator without two-factor on can''t sanction');
select pg_temp.as_user('R');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'warn', null, 'spam')$$, '42501', null, 'a trust reviewer can''t sanction users');
select pg_temp.as_user('M');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'suspend', now() + interval '8 days', 'spam wave')$$, '42501',
  'moderators can suspend for at most 7 days', 'a moderator can''t suspend for 8 days');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'ban', null, 'spam wave')$$, '42501', null, 'or ban');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'suspend', null, 'spam wave')$$, '22023', null, 'a suspension needs an end');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'suspend', now() + interval '3 days', ' ')$$, '22023', null, 'and a reason');
select throws_ok($$select public.sanction_user(pg_temp.u('M'), 'warn', null, 'testing')$$, '42501', null, 'nobody sanctions themselves');
reset role;
select throws_ok($$insert into public.sanctions (user_id, kind, until, reason, staff_id)
                   values (pg_temp.u('S'), 'suspend', now() + interval '10 days', 'via a future function', pg_temp.u('M'))$$,
  '42501', 'moderators can suspend for at most 7 days', 'the table refuses a moderator''s 10-day suspension even without the function');
select throws_ok($$insert into public.sanctions (user_id, kind, reason, staff_id) values (pg_temp.u('S'), 'ban', 'via a future function', pg_temp.u('M'))$$,
  '42501', 'only a super admin can ban an account', 'and a moderator''s ban');

-- A session to revoke.
insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), pg_temp.u('S'), now(), now());
set local role authenticated;
select pg_temp.as_user('M');
select lives_ok($$select pg_temp.remember('susp', public.sanction_user(pg_temp.u('S'), 'suspend', now() + interval '7 days' - interval '1 minute', 'Spam wave in the feed'))$$,
  'a moderator suspends for just under 7 days');
reset role;
select is((select count(*)::integer from auth.sessions where user_id = pg_temp.u('S')), 0, 'every session of the account is revoked');
select is((select banned_until from auth.users where id = pg_temp.u('S')), null, 'a suspension doesn''t block sign-in');
select is((pg_temp.audit('sanction.suspend', pg_temp.u('S')::text)).before, '{"active": null}'::jsonb, 'audited with nothing active before');
select is((pg_temp.audit('sanction.suspend', pg_temp.u('S')::text)).after -> 'active' ->> 'kind', 'suspend', 'and the suspension after');
select is((pg_temp.audit('sanction.suspend', pg_temp.u('S')::text)).reason, 'Spam wave in the feed', 'with the reason');
select is(pg_temp.notes('S', 'account_restricted'), 1, 'the account is told');
select throws_ok($$update public.sanctions set until = now() + interval '30 days' where id = pg_temp.v('susp')$$, '42501',
  'a sanction can only be lifted, not edited', 'nobody edits a sanction, not even the database owner');

-- ---------------------------------------------------------------------------
-- What a suspended account can still do
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.create_post('{"type":"general","audience":"global","body":"still here"}')$$, '42501',
  'your account is suspended, so you can only read, appeal or delete your account', 'a suspended account can''t post');
select throws_ok($$select public.create_venture('{"type":"project","title":"Suspended shop","description":"d"}')$$, '42501', null,
  'or start a venture');
select is((public.my_restriction() ->> 'kind'), 'suspend', 'it sees its own suspension');
select ok(jsonb_array_length(public.my_appealable()) = 1, 'and can appeal it');
select pg_temp.as_user('T', 'aal1');
select lives_ok($$select public.create_post('{"type":"general","audience":"global","body":"not suspended"}')$$, 'others post as usual');
select is(public.my_restriction(), null, 'and have no restriction');

select pg_temp.as_user('M');
select throws_ok($$select public.sanction_user(pg_temp.u('S'), 'suspend', now() + interval '1 day', 'again')$$, '55000', null,
  'one suspension or ban at a time');
select lives_ok($$select public.sanction_user(pg_temp.u('S'), 'warn', null, 'A separate warning')$$, 'a warning can be added alongside');

-- ---------------------------------------------------------------------------
-- Appeals: one per decision, never decided by the original staff member
-- ---------------------------------------------------------------------------
select pg_temp.as_user('T', 'aal1');
select throws_ok($$select public.submit_appeal('sanction', pg_temp.v('susp'), 'This wasn''t me, please look again')$$, 'P0002', null,
  'only the account it is about can appeal');
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.submit_appeal('sanction', pg_temp.v('susp'), 'short')$$, '22023', null, 'an appeal needs an explanation');
select lives_ok($$select pg_temp.remember('ap1', public.submit_appeal('sanction', pg_temp.v('susp'), 'Those posts were my own project updates, not spam.'))$$,
  'the suspended account appeals');
select throws_ok($$select public.submit_appeal('sanction', pg_temp.v('susp'), 'Second try at the same appeal')$$, '23505', null,
  'one appeal per decision');
select is((select count(*)::integer from public.appeals), 1, 'it reads its own appeal');
select is(jsonb_array_length(public.my_appealable()), 1, 'the warning is still appealable; the suspension no longer listed');

select pg_temp.as_user('M');
select ok(exists (select 1 from jsonb_array_elements(public.ops_appeals()) a where a ->> 'id' = pg_temp.v('ap1')::text and (a ->> 'mine_originally')::boolean),
  'the original moderator sees the appeal, marked as their decision');
select throws_ok($$select public.claim_appeal(pg_temp.v('ap1'), true)$$, '42501',
  'you made the original decision, so another staff member must decide this appeal', 'but can''t claim it');
select throws_ok($$select public.decide_appeal(pg_temp.v('ap1'), 'upheld', 'Looked again, stands')$$, '42501', null, 'or decide it');
reset role;
select throws_ok($$update public.appeals set decided_by = pg_temp.u('M'), decided_at = now(), status = 'upheld', decision_reason = 'x x x'
                   where id = pg_temp.v('ap1')$$, '42501', null, 'the table refuses the original staff member as decider');
set local role authenticated;
select pg_temp.as_user('C');
select throws_ok($$select public.claim_appeal(pg_temp.v('ap1'), true)$$, '42501', 'your role can''t decide this appeal',
  'accounts staff can''t decide a moderation appeal');
select pg_temp.as_user('N');
select ok((select (q ->> 'total')::integer from jsonb_array_elements(public.ops_inbox() -> 'queues') q where q ->> 'queue' = 'appeals') >= 1,
  'the appeal is in another moderator''s inbox');
select throws_ok($$select public.decide_appeal(pg_temp.v('ap1'), 'overturned', 'Project updates')$$, '55000', 'claim the appeal first',
  'deciding needs a claim');
select lives_ok($$select public.claim_appeal(pg_temp.v('ap1'), true)$$, 'another moderator claims it');
select throws_ok($$select public.decide_appeal(pg_temp.v('ap1'), 'maybe', 'Project updates')$$, '22023', null, 'the outcome is upheld or overturned');
select lives_ok($$select public.decide_appeal(pg_temp.v('ap1'), 'overturned', 'The posts were genuine project updates')$$, 'and overturns it');
select is((select lifted_at is not null from public.sanctions where id = pg_temp.v('susp')), true, 'the suspension is lifted');
select is((select lift_reason from public.sanctions where id = pg_temp.v('susp')), 'Appeal overturned: The posts were genuine project updates',
  'with the appeal as the reason');
select is((pg_temp.audit('appeal.overturned', pg_temp.v('ap1')::text)).before ->> 'status', 'pending', 'the decision is audited before');
select is((pg_temp.audit('appeal.overturned', pg_temp.v('ap1')::text)).after -> 'outcome' ->> 'sanction_lifted', pg_temp.v('susp')::text,
  'and after, with what changed');
select ok((pg_temp.audit('appeal.claim', pg_temp.v('ap1')::text)).staff_id = pg_temp.u('N'), 'the claim is audited');
select throws_ok($$select public.decide_appeal(pg_temp.v('ap1'), 'upheld', 'Changed my mind')$$, '55000', null, 'the decision is final');
select is(pg_temp.notes('S', 'appeal_decided'), 1, 'the appellant is told');
select pg_temp.as_user('S', 'aal1');
select is(public.my_restriction(), null, 'the account is no longer restricted');
select pg_temp.clear_rl();
select lives_ok($$select public.create_post('{"type":"general","audience":"global","body":"back again"}')$$, 'and posts again');

-- ---------------------------------------------------------------------------
-- Bans: super admin only; sign-in blocked; lifting restores it
-- ---------------------------------------------------------------------------
select pg_temp.as_user('A');
select lives_ok($$select pg_temp.remember('ban', public.sanction_user(pg_temp.u('T'), 'ban', null, 'Ban evasion with a second account'))$$,
  'a super admin bans permanently');
reset role;
select ok((select banned_until > now() + interval '100 years' from auth.users where id = pg_temp.u('T')), 'sign-in is blocked');
set local role authenticated;
select pg_temp.as_user('M');
select throws_ok($$select public.lift_sanction(pg_temp.v('ban'), 'Mistake')$$, '42501', null, 'a moderator can''t lift a ban');
-- Appeals on a ban arrive by email; staff file them. With one super admin who made the ban, it is stuck.
select lives_ok($$select pg_temp.remember('ap2', public.ops_file_appeal('sanction', pg_temp.v('ban'), 'Emailed: that was my brother''s account', 'Email from the student, 2 Oct'))$$,
  'any staff member files an emailed appeal for a banned account');
select is((pg_temp.audit('appeal.file_for_user', pg_temp.v('ap2')::text)).after ->> 'appellant_id', pg_temp.u('T')::text,
  'filing it is audited');
select pg_temp.as_user('A');
select is((select (a ->> 'stuck')::boolean from jsonb_array_elements(public.ops_appeals()) a where a ->> 'id' = pg_temp.v('ap2')::text), true,
  'with only one super admin, who made the ban, the appeal is marked stuck');
select throws_ok($$select public.claim_appeal(pg_temp.v('ap2'), true)$$, '42501', null, 'and the banning super admin can''t take it');
select lives_ok($$select public.lift_sanction(pg_temp.v('ban'), 'Identity confirmed, wrong account')$$, 'a super admin lifts the ban');
reset role;
select is((select banned_until from auth.users where id = pg_temp.u('T')), null, 'sign-in works again');
select is((pg_temp.audit('sanction.lift', pg_temp.v('ban')::text)).before ->> 'lifted_at', null, 'lifting is audited before');
select isnt((pg_temp.audit('sanction.lift', pg_temp.v('ban')::text)).after ->> 'lifted_at', null, 'and after');

-- ---------------------------------------------------------------------------
-- Report case appeals restore the post and remove the penalty
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('S', 'aal1');
select pg_temp.clear_rl();
select pg_temp.remember('post', public.create_post('{"type":"general","audience":"global","body":"a post to remove"}'));
reset role;
insert into public.report_cases (id, target_type, target_id, owner_id, snapshot, reports, status, resolved_by, resolved_at, resolution_reason)
values ('94600000-0000-0000-0000-0000000000c1', 'post', pg_temp.v('post'), pg_temp.u('S'), '{"body":"a post to remove"}', 1,
        'removed', pg_temp.u('M'), now(), 'Looked like spam');
update public.posts set removed_at = now(), removed_by = pg_temp.u('M') where id = pg_temp.v('post');
insert into public.ranking_adjustments (user_id, kind, severity, reason, case_id, staff_id)
values (pg_temp.u('S'), 'penalty', 'low', 'Looked like spam', '94600000-0000-0000-0000-0000000000c1', pg_temp.u('M'));
-- An old decision is out of time.
insert into public.report_cases (id, target_type, target_id, owner_id, snapshot, reports, status, resolved_by, resolved_at, resolution_reason, opened_at)
values ('94600000-0000-0000-0000-0000000000c2', 'profile', pg_temp.u('S'), pg_temp.u('S'), '{"bio":"old"}', 1,
        'warned', pg_temp.u('M'), now() - interval '40 days', 'Old warning', now() - interval '41 days');
set local role authenticated;
select pg_temp.as_user('S', 'aal1');
select throws_ok($$select public.submit_appeal('report_case', '94600000-0000-0000-0000-0000000000c2', 'This was a long time ago, please remove')$$,
  '55000', 'appeals close 30 days after the decision', 'appeals close after 30 days');
select lives_ok($$select pg_temp.remember('ap3', public.submit_appeal('report_case', '94600000-0000-0000-0000-0000000000c1', 'It was a normal post about my project.'))$$,
  'the removal is appealed');
select pg_temp.as_user('N');
select lives_ok($$select public.claim_appeal(pg_temp.v('ap3'), true)$$, 'another moderator claims it');
select lives_ok($$select public.decide_appeal(pg_temp.v('ap3'), 'overturned', 'Normal project post')$$, 'and overturns it');
reset role;
select is((select removed_at from public.posts where id = pg_temp.v('post')), null, 'the post is visible again');
select is((select count(*)::integer from public.ranking_adjustments where case_id = '94600000-0000-0000-0000-0000000000c1'), 0, 'the penalty is gone');

-- ---------------------------------------------------------------------------
-- Credential appeals go to trust reviewers
-- ---------------------------------------------------------------------------
insert into public.credentials (id, user_id, title, issuer, issued_on, file_path, file_type, file_bytes, status, reviewer_id, reviewed_at, review_reason)
values ('94600000-0000-0000-0000-0000000000d1', pg_temp.u('S'), 'AWS Practitioner', 'Amazon', '2026-01-01',
        '94600000-0000-0000-0000-000000000006/94600000-0000-0000-0000-0000000000d1.pdf', 'pdf', 100, 'rejected', pg_temp.u('A'), now(), 'Unreadable scan');
set local role authenticated;
select pg_temp.as_user('S', 'aal1');
select pg_temp.remember('ap4', public.submit_appeal('credential', '94600000-0000-0000-0000-0000000000d1', 'The scan is readable at full size, please check again.'));
select pg_temp.as_user('M');
select throws_ok($$select public.claim_appeal(pg_temp.v('ap4'), true)$$, '42501', null, 'a moderator can''t decide a credential appeal');
select pg_temp.as_user('R');
select lives_ok($$select public.claim_appeal(pg_temp.v('ap4'), true)$$, 'a trust reviewer claims it');
select lives_ok($$select public.decide_appeal(pg_temp.v('ap4'), 'overturned', 'Readable at full size')$$, 'and approves on appeal');
reset role;
select is((select status::text from public.credentials where id = '94600000-0000-0000-0000-0000000000d1'), 'approved', 'the credential is approved');

-- ---------------------------------------------------------------------------
-- Organisations: throttle and suspension (accounts staff)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('M');
select throws_ok($$select public.sanction_org('94600000-0000-0000-0000-00000000000f', 'throttle', now() + interval '7 days', 1, 'Spammy outreach')$$,
  '42501', null, 'a moderator can''t sanction an organisation');
select pg_temp.as_user('C');
select throws_ok($$select public.sanction_org('94600000-0000-0000-0000-00000000000f', 'throttle', now() + interval '120 days', 1, 'Spammy outreach')$$,
  '22023', null, 'a throttle ends within 90 days');
select lives_ok($$select pg_temp.remember('thr', public.sanction_org('94600000-0000-0000-0000-00000000000f', 'throttle', now() + interval '7 days', 1, 'Spammy outreach'))$$,
  'accounts staff throttle the organisation to one request a day');
select is((pg_temp.audit('org_sanction.throttle', '94600000-0000-0000-0000-00000000000f')).after -> 'sanction' ->> 'per_day', '1',
  'audited with the limit');
select is(pg_temp.notes('P', 'org_sanctioned'), 1, 'its admin is told');
reset role;
insert into public.contact_requests (org_id, recruiter_id, student_id, role_title, message, expires_at)
values ('94600000-0000-0000-0000-00000000000f', pg_temp.u('P'), pg_temp.u('S'), 'Intern', repeat('x', 60), now() + interval '14 days');
select throws_ok($$insert into public.contact_requests (org_id, recruiter_id, student_id, role_title, message, expires_at)
                   values ('94600000-0000-0000-0000-00000000000f', pg_temp.u('P'), pg_temp.u('T'), 'Intern', repeat('x', 60), now() + interval '14 days')$$,
  '54000', null, 'a second contact request within 24 hours is refused');
set local role authenticated;
select pg_temp.as_user('C');
select lives_ok($$select pg_temp.remember('osusp', public.sanction_org('94600000-0000-0000-0000-00000000000f', 'suspend', null, null, 'Fake job posts'))$$,
  'accounts staff suspend the organisation');
reset role;
select is((select status::text from public.organizations where id = '94600000-0000-0000-0000-00000000000f'), 'suspended', 'it is suspended');
set local role authenticated;
select pg_temp.as_user('P', 'aal2');
select ok(exists (select 1 from jsonb_array_elements(public.my_appealable()) a where a ->> 'id' = pg_temp.v('osusp')::text),
  'the organisation''s admin can appeal its suspension');
select pg_temp.as_user('C');
select lives_ok($$select public.lift_sanction(pg_temp.v('osusp'), 'Posts were genuine')$$, 'lifting the suspension');
reset role;
select is((select status::text from public.organizations where id = '94600000-0000-0000-0000-00000000000f'), 'verified', 'reinstates the organisation');

select * from finish();
rollback;
