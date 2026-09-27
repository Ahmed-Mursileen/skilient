-- GitHub connection (PRD 5.5 P0, 8 must-fix 2): identity comes only from GitHub via the
-- ticket, tokens stay in Vault, webhooks are idempotent, repositories are owner-only.
-- A and B study at NUTECH, C at FAST; D is a trust reviewer.
begin;
select plan(47);

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('50000000-0000-0000-0000-00000000000b', 'b@nutech.edu.pk'),
  ('50000000-0000-0000-0000-00000000000c', 'c@nu.edu.pk'),
  ('50000000-0000-0000-0000-00000000000d', 'd@nutech.edu.pk');
update public.profiles set username = 'amna' where user_id = '50000000-0000-0000-0000-00000000000a';
insert into public.staff_roles (user_id, role) values ('50000000-0000-0000-0000-00000000000d', 'trust_reviewer');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.queued(p_stage text) returns bigint language sql as $$
  select count(*) from pgmq.q_github_jobs where message ->> 'stage' = p_stage;
$$;

-- Starting a link: signed-in students only, a well-formed code only.
set local role anon;
select throws_ok($$ select public.start_github_link('abc123') $$, '42501', null,
  'a signed-out visitor cannot start a link');
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.start_github_link('bad code!') $$, '22023', null, 'a malformed code is refused');
select lives_ok($$ select set_config('test.ticket_a', public.start_github_link('code-for-a', 77)::text, true) $$,
  'A starts a link with a code');
select throws_ok($$ select * from private.github_link_tickets $$, '42501', null, 'A cannot read link tickets');
select throws_ok(
  $$ insert into public.github_accounts (user_id, github_id, login) values ('50000000-0000-0000-0000-00000000000a', 1, 'x') $$,
  '42501', null, 'A cannot write her own GitHub identity');
select throws_ok(
  $$ select private.complete_github_link(current_setting('test.ticket_a')::uuid, 1, 'x', 't', null, null, null, '[]') $$,
  '42501', null, 'A cannot complete a link herself');

-- The Edge Function claims the ticket once, then reports what GitHub said.
reset role;
select results_eq(
  $$ select user_id::text, code, installation_id from private.claim_github_link_ticket(current_setting('test.ticket_a')::uuid) $$,
  $$ values ('50000000-0000-0000-0000-00000000000a', 'code-for-a', 77::bigint) $$,
  'the Edge Function claims the ticket and gets its code');
select is_empty($$ select * from private.claim_github_link_ticket(current_setting('test.ticket_a')::uuid) $$,
  'a ticket can be claimed only once');
select is((select code from private.github_link_tickets where id = current_setting('test.ticket_a')::uuid), null,
  'the code is wiped once claimed');
select is(
  private.complete_github_link(current_setting('test.ticket_a')::uuid, 1001, 'amna-codes', 'gho_access_a',
    now() + interval '8 hours', 'ghr_refresh_a', now() + interval '6 months',
    '[{"id": 77, "account_id": 1001, "account_login": "amna-codes", "account_type": "User", "repository_selection": "selected"}]'),
  'linked', 'GitHub id 1001 is linked to A');
select is(
  private.complete_github_link(current_setting('test.ticket_a')::uuid, 1001, 'amna-codes', 'x', null, null, null, '[]'),
  'expired', 'a used ticket cannot link again');
select is((select decrypted_secret from vault.decrypted_secrets s join private.github_tokens t on t.access_secret_id = s.id
            where t.user_id = '50000000-0000-0000-0000-00000000000a'), 'gho_access_a',
  'the access token is in Vault');
select is((select count(*) from public.github_user_installations where user_id = '50000000-0000-0000-0000-00000000000a'),
  1::bigint, 'the installation is recorded for A');
select results_eq($$ select trigger, status::text, stage from public.sync_jobs where user_id = '50000000-0000-0000-0000-00000000000a' $$,
  $$ values ('connect', 'queued', 'discover') $$, 'a sync is opened');
select is(pg_temp.queued('discover'), 1::bigint, 'discovery is queued');
select is((select count(*) from public.security_events
            where user_id = '50000000-0000-0000-0000-00000000000a' and kind = 'github_connected'), 1::bigint,
  'the link is a security event');

-- Who reads the link: the owner, and whoever can read the full profile.
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select results_eq($$ select login from public.github_accounts $$, $$ values ('amna-codes') $$, 'A reads her link');
select throws_ok($$ select error from public.sync_jobs $$, '42501', null, 'sync errors are for staff, not students');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b');
select results_eq($$ select login from public.github_accounts $$, $$ values ('amna-codes') $$,
  'B at the same university sees A''s GitHub link');
select is_empty($$ select 1 from public.github_installations $$, 'B cannot see A''s installations');
select is_empty($$ select 1 from public.sync_jobs $$, 'B cannot see A''s sync');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000c');
select is_empty($$ select 1 from public.github_accounts $$, 'C at another university cannot see A''s link');

-- A GitHub account already linked elsewhere is a clash for review, never a takeover.
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b');
select lives_ok($$ select set_config('test.ticket_b', public.start_github_link('code-for-b')::text, true) $$, 'B starts a link');
reset role;
select * from private.claim_github_link_ticket(current_setting('test.ticket_b')::uuid);
select is(private.complete_github_link(current_setting('test.ticket_b')::uuid, 1001, 'amna-codes', 't', null, null, null, '[]'),
  'clash', 'B cannot link A''s GitHub account');
select is((select user_id::text from public.github_accounts where github_id = 1001), '50000000-0000-0000-0000-00000000000a',
  'A keeps her link');
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.github_link_clashes $$, 'students cannot read clashes');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000d', 'aal1');
select is_empty($$ select 1 from public.github_link_clashes $$, 'a trust reviewer without two-factor cannot read clashes');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000d', 'aal2');
select results_eq($$ select github_login, linked_user_id::text from public.github_link_clashes $$,
  $$ values ('amna-codes', '50000000-0000-0000-0000-00000000000a') $$, 'a trust reviewer on two-factor sees the clash');

-- Relinking A to a different GitHub account needs a disconnect first.
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select lives_ok($$ select set_config('test.ticket_a2', public.start_github_link('code-for-a2')::text, true) $$, 'A starts again');
reset role;
select * from private.claim_github_link_ticket(current_setting('test.ticket_a2')::uuid);
select is(private.complete_github_link(current_setting('test.ticket_a2')::uuid, 2002, 'other', 't', null, null, null, '[]'),
  'other_account', 'A cannot swap GitHub accounts without disconnecting');

-- Repositories: discovered for A, visible and excludable only by A.
select is(private.upsert_discovered_repos('50000000-0000-0000-0000-00000000000a', 77,
  '[{"id": 501, "full_name": "amna-codes/robot", "owner_id": 1001, "private": true, "fork": false},
    {"id": 502, "full_name": "club/site", "owner_id": 9, "private": false, "fork": false},
    {"id": 503, "full_name": "amna-codes/fork", "owner_id": 1001, "private": false, "fork": true}]'),
  array[501, 502, 503]::bigint[], 'three repositories to classify');
select results_eq($$ select private.classify_repo('50000000-0000-0000-0000-00000000000a', 501, 1001, false, null, null)::text
                    union all select private.classify_repo('50000000-0000-0000-0000-00000000000a', 502, 9, false, null, null)::text
                    union all select private.classify_repo('50000000-0000-0000-0000-00000000000a', 503, 1001, true, 'x/y', null)::text $$,
  $$ values ('owned'), ('collaborator'), ('fork') $$, 'owned, collaborator and fork are told apart');
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select results_eq($$ select full_name from public.github_repos order by repo_id $$,
  $$ values ('amna-codes/robot'), ('club/site'), ('amna-codes/fork') $$, 'A sees her repositories, private ones included');
select lives_ok($$ update public.github_user_repos set excluded = true where repo_id = 502 $$, 'A excludes a repository');
select throws_ok($$ update public.github_user_repos set kind = 'owned' where repo_id = 502 $$, '42501', null,
  'A cannot reclassify a repository');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.github_repos $$, 'B cannot see A''s repository names');
select is_empty($$ update public.github_user_repos set excluded = false returning 1 $$, 'B cannot change A''s exclusions');

-- Webhooks: only the route (service role) records them, and a replay changes nothing.
select throws_ok($$ select public.record_github_webhook(gen_random_uuid(), 'push', '{}', null, 77) $$, '42501', null,
  'students cannot record webhooks');
set local role service_role;
select is(public.record_github_webhook('11111111-1111-1111-1111-111111111111', 'installation_repositories',
  '{"installation": {"id": 77}, "repositories_removed": [{"id": 501}]}', 'removed', 77), true, 'a delivery is recorded');
select is(public.record_github_webhook('11111111-1111-1111-1111-111111111111', 'installation_repositories',
  '{"installation": {"id": 77}, "repositories_removed": [{"id": 501}]}', 'removed', 77), false, 'a replayed delivery is ignored');
reset role;
select is(pg_temp.queued('webhook'), 1::bigint, 'the replay queued nothing more');
select is(private.process_github_webhook('11111111-1111-1111-1111-111111111111') -> 'discover',
  '["50000000-0000-0000-0000-00000000000a"]'::jsonb, 'removing a repository refreshes discovery for its student');
select is_empty($$ select 1 from public.github_user_repos where repo_id = 501 $$, 'the removed repository is gone');

-- Disconnect: link, tokens and repositories go; the token is queued for revocation.
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select is(public.disconnect_github(), true, 'A disconnects');
reset role;
select is_empty($$ select 1 from public.github_accounts where user_id = '50000000-0000-0000-0000-00000000000a'
                  union all select 1 from public.github_user_repos where user_id = '50000000-0000-0000-0000-00000000000a'
                  union all select 1 from private.github_tokens where user_id = '50000000-0000-0000-0000-00000000000a' $$,
  'link, repositories and tokens are removed');
select is(pg_temp.queued('revoke'), 1::bigint, 'the token is queued for revocation at GitHub');
select is((select status::text from public.sync_jobs where user_id = '50000000-0000-0000-0000-00000000000a'), 'cancelled',
  'the open sync is cancelled');

select * from finish();
rollback;
