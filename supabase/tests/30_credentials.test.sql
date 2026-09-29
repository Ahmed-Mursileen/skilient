-- Credentials and the /ops trust queue (PRD 5.19, 5.26). S uploads; C is a classmate; O studies
-- at FAST; T and U are trust reviewers (two-factor), M is only a moderator.
begin;
select plan(55);

insert into auth.users (id, email) values
  ('93000000-0000-0000-0000-00000000000a', 's@nutech.edu.pk'),
  ('93000000-0000-0000-0000-00000000000c', 'c@nutech.edu.pk'),
  ('93000000-0000-0000-0000-00000000000d', 'o@nu.edu.pk'),
  ('93000000-0000-0000-0000-00000000000e', 't@nutech.edu.pk'),
  ('93000000-0000-0000-0000-00000000000f', 'u@nutech.edu.pk'),
  ('93000000-0000-0000-0000-000000000010', 'm@nutech.edu.pk');
update public.profiles set onboarding_complete = true, username = 'cr_' || right(user_id::text, 2)
 where user_id::text like '93000000-%';
insert into public.staff_roles (user_id, role, granted_by) values
  ('93000000-0000-0000-0000-00000000000e', 'trust_reviewer', '93000000-0000-0000-0000-00000000000e'),
  ('93000000-0000-0000-0000-00000000000f', 'trust_reviewer', '93000000-0000-0000-0000-00000000000f'),
  ('93000000-0000-0000-0000-000000000010', 'moderator', '93000000-0000-0000-0000-000000000010');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
-- A file in the bucket as the storage API would record it.
create function pg_temp.upload(p_owner text, p_name text, p_mime text, p_size bigint) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('credentials', p_name, p_owner::uuid, p_owner, jsonb_build_object('mimetype', p_mime, 'size', p_size));
$$;
create function pg_temp.queued(p_path text) returns boolean language sql security definer as $$
  select exists (select 1 from pgmq.q_storage_cleanup where message->>'bucket' = 'credentials' and message->>'path' = p_path);
$$;
create function pg_temp.cred(p_title text, p_path text, p_issued text default '2026-01-10', p_expires text default null)
returns jsonb language sql as $$
  select jsonb_build_object('title', p_title, 'issuer', 'Amazon Web Services', 'issued_on', p_issued,
                            'expires_on', p_expires, 'path', p_path);
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Uploading: your own folder only
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok($$ select pg_temp.upload('93000000-0000-0000-0000-00000000000a',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf', 'application/pdf', 300000) $$,
  'a student uploads a PDF into their own folder');
select throws_ok($$ select pg_temp.upload('93000000-0000-0000-0000-00000000000a',
  '93000000-0000-0000-0000-00000000000d/93000000-0000-0000-0000-0000000000a2.pdf', 'application/pdf', 1000) $$,
  '42501', null, 'not into someone else''s folder');
select throws_ok($$ select pg_temp.upload('93000000-0000-0000-0000-00000000000a',
  '93000000-0000-0000-0000-00000000000a/cv.exe', 'application/pdf', 1000) $$,
  '42501', null, 'only a fresh uuid name ending .pdf or .webp');
select pg_temp.upload('93000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a3.pdf', 'application/pdf', 6000000);
select pg_temp.upload('93000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a4.webp', 'image/png', 1000);
select pg_temp.upload('93000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a5.webp', 'image/webp', 200000);

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.submit_credential(pg_temp.cred('AWS Cloud Practitioner',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000ff.pdf')) $$, '22023', null,
  'the file must be uploaded first');
select throws_ok($$ select public.submit_credential(pg_temp.cred('Big', '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a3.pdf')) $$,
  '23514', null, 'PDFs are at most 5 MB');
select throws_ok($$ select public.submit_credential(pg_temp.cred('Wrong type', '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a4.webp')) $$,
  '22023', null, 'the stored type must match (a re-encoded WebP)');
select throws_ok($$ select public.submit_credential(pg_temp.cred('Future',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf', '2099-01-01')) $$, '22023', null,
  'no issue date in the future');
select throws_ok($$ select public.submit_credential(pg_temp.cred('Backwards',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf', '2026-01-10', '2025-01-01')) $$, '22023', null,
  'expiry after the issue date');
select lives_ok($$ select pg_temp.remember('c1', public.submit_credential(pg_temp.cred('AWS Cloud Practitioner',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf', '2026-01-10', '2029-01-10'))) $$,
  'a PDF credential is submitted');
select is((select status::text || ':' || file_type || ':' || file_bytes from public.credentials where id = pg_temp.v('c1')),
  'pending:pdf:300000', 'pending, with type and size from storage, not the browser');
select throws_ok($$ select public.submit_credential(pg_temp.cred('Again', '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf')) $$,
  '23505', null, 'a file is attached once');
select lives_ok($$ select pg_temp.remember('c2', public.submit_credential(pg_temp.cred('Oracle Java',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a5.webp'))) $$, 'an image credential is submitted');
select throws_ok($$ insert into public.credentials (user_id, title, issuer, issued_on, file_path, file_type, file_bytes, status)
  values ('93000000-0000-0000-0000-00000000000a', 'Self-approved', 'x', '2026-01-01',
          '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000b1.pdf', 'pdf', 1, 'approved') $$,
  '42501', null, 'no direct inserts');
select throws_ok($$ update public.credentials set status = 'approved' where id = pg_temp.v('c1') $$, '42501', null,
  'a student can''t approve their own');
select is((select count(*)::integer from public.credentials_for('93000000-0000-0000-0000-00000000000a')), 0,
  'pending credentials never show on the profile');

-- The pending limit (5) holds.
select pg_temp.upload('93000000-0000-0000-0000-00000000000a', format('93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000c%s.pdf', i), 'application/pdf', 1000)
  from generate_series(1, 4) i;
select public.submit_credential(pg_temp.cred('Extra ' || i, format('93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000c%s.pdf', i)))
  from generate_series(1, 3) i;
select throws_ok($$ select public.submit_credential(pg_temp.cred('Sixth',
  '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000c4.pdf')) $$, '23514', null,
  'at most 5 waiting for review at once');

-- Files: the owner and trust reviewers read them, nobody else.
select pg_temp.as_user('93000000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from storage.objects where bucket_id = 'credentials'
            and name like '93000000-0000-0000-0000-00000000000a/%'), 0, 'another student can''t read the files');
select is((select count(*)::integer from public.credentials where user_id = '93000000-0000-0000-0000-00000000000a'), 0,
  'or the rows');
select pg_temp.as_user('93000000-0000-0000-0000-000000000010', 'aal2');
select is((select count(*)::integer from storage.objects where bucket_id = 'credentials'
            and name like '93000000-0000-0000-0000-00000000000a/%'), 0, 'a moderator can''t either');
select throws_ok($$ select * from public.credential_queue() $$, '42501', null, 'moderators don''t review credentials');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000e', 'aal1');
select throws_ok($$ select * from public.credential_queue() $$, '42501', null, 'a trust reviewer needs two-factor');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000e', 'aal2');
select ok((select count(*) from storage.objects where name = '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf') = 1,
  'a trust reviewer on two-factor reads the file (for a signed URL)');

-- ---------------------------------------------------------------------------
-- Reviewing
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.credential_queue() where student_username = 'cr_0a'), 5,
  'the queue lists pending credentials, oldest first');
select is((select suggested_issuer from public.credential_queue() where id = pg_temp.v('c1')), 'aws',
  'with a suggested recognised issuer');
select throws_ok($$ select public.review_credential(pg_temp.v('c1'), true, 'Checked on Credly', 'aws') $$, '55000', null,
  'claim before deciding');
select lives_ok($$ select public.claim_credential(pg_temp.v('c1'), true) $$, 'T claims it');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000f', 'aal2');
select throws_ok($$ select public.claim_credential(pg_temp.v('c1'), true) $$, '55000', null, 'another reviewer can''t take it');
select throws_ok($$ select public.review_credential(pg_temp.v('c1'), true, 'Looks fine', 'aws') $$, '55000', null,
  'or decide it');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000e', 'aal2');
select throws_ok($$ select public.review_credential(pg_temp.v('c1'), true, '', 'aws') $$, '22023', null, 'a reason is required');
select throws_ok($$ select public.review_credential(pg_temp.v('c1'), true, 'Checked', 'nope') $$, '22023', null,
  'only a listed issuer');
select lives_ok($$ select public.review_credential(pg_temp.v('c1'), true, 'Verified on the issuer''s site', 'aws') $$,
  'T approves it as a recognised issuer');
select results_eq($$ select action, reason from public.ops_audit_log where target_id = pg_temp.v('c1')::text order by action $$,
  $$ values ('credential.approve'::text, 'Verified on the issuer''s site'::text), ('credential.claim', 'claimed to review') $$,
  'every step is in the audit log with its reason');
select lives_ok($$ select public.claim_credential(pg_temp.v('c2'), true) $$, 'T claims the image');
select lives_ok($$ select public.review_credential(pg_temp.v('c2'), false, 'The name on the certificate doesn''t match', null) $$,
  'and rejects it with a reason');
select throws_ok($$ select public.claim_credential(pg_temp.v('c2'), true) $$, '55000', null, 'a decided credential can''t be claimed');

reset role;
select is((select count(*)::integer from public.notifications where user_id = '93000000-0000-0000-0000-00000000000a'
            and type = 'credential_reviewed'), 2, 'the student hears about each decision');
select is((select data->>'reason' from public.notifications where user_id = '93000000-0000-0000-0000-00000000000a'
            and type = 'credential_reviewed' and entity_id = current_setting('test.c2')::uuid),
  'The name on the certificate doesn''t match', 'with the reason');
set local role authenticated;

select pg_temp.as_user('93000000-0000-0000-0000-00000000000c');
select results_eq($$ select title, issuer, recognised from public.credentials_for('93000000-0000-0000-0000-00000000000a') $$,
  $$ values ('AWS Cloud Practitioner'::text, 'Amazon Web Services (AWS)'::text, true) $$,
  'a classmate sees the approved credential under the recognised issuer''s name');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000d');
select is((select count(*)::integer from public.credentials_for('93000000-0000-0000-0000-00000000000a')), 0,
  'a student elsewhere can''t read a university-only profile''s credentials');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a', 'aal2');
select throws_ok($$ select * from public.credential_queue() $$, '42501', null, 'students have no queue');
select results_eq($$ select status::text, review_reason from public.credentials where id = pg_temp.v('c2') $$,
  $$ values ('rejected'::text, 'The name on the certificate doesn''t match'::text) $$, 'the student reads the decision and reason');

-- ---------------------------------------------------------------------------
-- Daily job: expiry, rejected files after 30 days, unused uploads
-- ---------------------------------------------------------------------------
reset role;
update public.credentials set expires_on = current_date - 1, issued_on = current_date - 400 where id = current_setting('test.c1')::uuid;
update public.credentials set reviewed_at = now() - interval '31 days' where id = current_setting('test.c2')::uuid;
update storage.objects set created_at = now() - interval '2 days'
 where name = '93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000c4.pdf';
select private.credentials_daily();
select is((select status::text from public.credentials where id = current_setting('test.c1')::uuid), 'expired',
  'an approved credential past its expiry date expires');
select is((select count(*)::integer from public.notifications where user_id = '93000000-0000-0000-0000-00000000000a'
            and type = 'credential_expired'), 1, 'and the student is told');
select ok(pg_temp.queued('93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a5.webp'),
  'a rejected file is deleted after 30 days');
select ok(pg_temp.queued('93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000c4.pdf'),
  'an upload never attached to a credential is deleted after a day');
set local role authenticated;
select pg_temp.as_user('93000000-0000-0000-0000-00000000000c');
select is((select count(*)::integer from public.credentials_for('93000000-0000-0000-0000-00000000000a')), 0,
  'an expired credential leaves the profile');

-- Deleting: the owner only; the file follows.
select pg_temp.as_user('93000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.delete_credential(pg_temp.v('c1')) $$, 'P0002', null, 'nobody else deletes it');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select ok(public.delete_credential(pg_temp.v('c1')), 'the owner deletes a credential');
select ok(pg_temp.queued('93000000-0000-0000-0000-00000000000a/93000000-0000-0000-0000-0000000000a1.pdf'), 'and its file is queued for deletion');

-- ---------------------------------------------------------------------------
-- GitHub review flags and storage use
-- ---------------------------------------------------------------------------
reset role;
insert into public.review_flags (user_id, kind, key) values ('93000000-0000-0000-0000-00000000000a', 'burst', '2026-08-01');
select set_config('test.flag', (select id::text from public.review_flags where user_id = '93000000-0000-0000-0000-00000000000a'), false);
set local role authenticated;
select pg_temp.as_user('93000000-0000-0000-0000-00000000000e', 'aal2');
select throws_ok($$ select public.resolve_review_flag(current_setting('test.flag')::bigint, false, 'Coursework day') $$,
  '55000', null, 'a flag is claimed before it''s resolved');
select public.claim_review_flag(current_setting('test.flag')::bigint, true);
select ok(public.resolve_review_flag(current_setting('test.flag')::bigint, false, 'Coursework day'), 'then cleared');
select results_eq($$ select action from public.ops_audit_log where target_type = 'review_flag' and target_id = current_setting('test.flag') order by action $$,
  $$ values ('review_flag.claim'::text), ('review_flag.clear') $$, 'both steps are audited');
select ok((select bytes from public.storage_usage() where bucket = 'credentials') > 0, 'staff see storage use per bucket');
select is((select distinct quota_bytes from public.storage_usage()), 1073741824::bigint, 'against the 1 GB quota');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select throws_ok($$ select * from public.storage_usage() $$, '42501', null, 'students don''t');

select * from finish();
rollback;
