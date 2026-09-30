-- CV control (PRD 5.18; decisions.md 2026-10-01): settings, Spark+ share links that always
-- open the newest version, verify lookups (revoked records give only code and dates), the
-- student's, a trust reviewer's, a ban's and a deletion's revocations, re-issue, PDF export
-- records (MAC, file, entitlement) and the test-only entitlement grants.
-- S is a Spark student, L a student below Spark, O another student, R a trust reviewer.
begin;
select plan(66);

insert into auth.users (id, email)
select ('93800000-0000-0000-0000-0000000000' || x.k)::uuid, 'cc' || x.k || '@nutech.edu.pk'
  from (values ('01'), ('02'), ('03'), ('04')) as x(k);
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('93800000-0000-0000-0000-0000000000' || case p when 'S' then '01' when 'L' then '02' when 'O' then '03' when 'R' then '04' end)::uuid
$$;
update public.profiles set onboarding_complete = true, username = 'cc_' || right(user_id::text, 2),
       full_name = 'Student ' || right(user_id::text, 2), department = 'Computer Science', graduation_year = 2027
 where user_id::text like '93800000-%';
insert into public.staff_roles (user_id, role, granted_by) values (pg_temp.u('R'), 'trust_reviewer', pg_temp.u('R'));
insert into public.ranking_scores (user_id, formula_version, components, proof, momentum, adjustments, total, ranked, tier, tier_met,
                                   percentile, computed_at, published_at)
values (pg_temp.u('S'), 1, '{}', 150, 0, 0, 150, true, 'spark', 'spark', 0.8, now(), now()),
       (pg_temp.u('L'), 1, '{}', 50, 0, 0, 50, true, 'raw', 'raw', 0.2, now(), now());

select private.cv_install_key('cv-20261009-cccccccc', repeat('C', 43), 'private-c');

create function pg_temp.issue(p_who text, p_code text, p_hash text, p_source text default 'first') returns uuid language sql as $$
  select private.cv_issue_commit(pg_temp.u(p_who), p_code, 'cv-20261009-cccccccc', date_trunc('second', now()),
    date_trunc('second', now()) + interval '12 months', private.cv_snapshot(pg_temp.u(p_who)), p_hash, repeat('d', 64),
    repeat('A', 86), p_source)
$$;
create function pg_temp.rec(p_code text) returns uuid language sql stable security definer as $$ select id from public.cv_records where code = p_code $$;
create function pg_temp.as_user(p text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.u(p), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select isnt(pg_temp.issue('S', 'SSSSS00001', repeat('1', 64)), null, 'S has a first CV');
select isnt(pg_temp.issue('S', 'SSSSS00002', repeat('2', 64), 'monthly'), null, 'and a newer version');
select isnt(pg_temp.issue('L', 'KKKKK00001', repeat('3', 64)), null, 'L has a CV');

-- ---------------------------------------------------------------------------
-- Entitlements: false until phase 10, except test-only grants
-- ---------------------------------------------------------------------------
select ok(not private.has_entitlement(pg_temp.u('S'), 'cv.pdf_export'), 'no entitlement by default');
insert into public.platform_config (key, version, value, reason)
values ('entitlements.test_grants', (select max(version) + 1 from public.platform_config where key = 'entitlements.test_grants'),
        jsonb_build_object('cv.pdf_export', jsonb_build_array(pg_temp.u('S'))), 'pgTAP 38');
select ok(private.has_entitlement(pg_temp.u('S'), 'cv.pdf_export'), 'a test grant counts');
select ok(not private.has_entitlement(pg_temp.u('S'), 'cv.templates'), 'for its key only');
select ok(not private.has_entitlement(pg_temp.u('O'), 'cv.pdf_export'), 'and its users only');

-- ---------------------------------------------------------------------------
-- Settings and share links (as S)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('S');
select lives_ok($$select public.save_cv_settings(array['skills', 'summary'], true, false, 'link')$$, 'the student saves settings');
select is((select sections from public.cv_settings), array['skills', 'summary'], 'in their order');
select throws_ok($$select public.save_cv_settings(array[]::text[], null, false, 'link')$$, '22023', null, 'at least one section');
select throws_ok($$select public.save_cv_settings(array['skills', 'photos'], null, false, 'link')$$, '22023', null, 'known sections only');

select isnt(public.create_share_link(repeat('a', 64), 'For Systems Ltd', 30), null, 'a Spark student makes a share link');
select isnt(public.create_share_link(repeat('b', 64), null, null), null, 'links may have no expiry');
select throws_ok($$select public.create_share_link(repeat('c', 64), null, 14)$$, '22023', null, '7, 30 or 90 days only');
select throws_ok($$select public.create_share_link('not-a-hash', null, 7)$$, '22023', null, 'only a token hash is accepted');
select public.create_share_link(lpad(i::text, 64, 'e'), null, 7) from generate_series(1, 8) i;
select throws_ok($$select public.create_share_link(repeat('f', 64), null, 7)$$, '23514', null, 'up to 10 active links');
select is((select count(*)::integer from public.cv_share_links), 10, 'the owner sees their links');
select pg_temp.as_user('L');
select throws_ok($$select public.create_share_link(repeat('9', 64), null, 7)$$, '42501', null, 'share links open at Spark');
select is((select count(*)::integer from public.cv_share_links), 0, 'nobody else''s links are visible');
reset role;

-- ---------------------------------------------------------------------------
-- Opening a link (anyone): the newest version, counted once per viewer per day
-- ---------------------------------------------------------------------------
set local role anon;
select is((select state || ':' || code from public.open_shared_cv(repeat('a', 64), repeat('1', 64))), 'ok:SSSSS00002',
  'a link opens the newest version');
select is((select state from public.open_shared_cv(repeat('a', 64), repeat('1', 64))), 'ok', 'again, same viewer');
select is((select state from public.open_shared_cv(repeat('a', 64), repeat('2', 64))), 'ok', 'another viewer');
select is((select state from public.open_shared_cv(repeat('0', 64), repeat('1', 64))), 'invalid', 'an unknown token');
reset role;
select is((select view_count from public.cv_share_links where token_hash = repeat('a', 64)), 2, 'one view per viewer per day');
select is((select count(*)::integer from public.cv_views where user_id = pg_temp.u('S')), 2, 'views are logged without an IP');
update public.cv_share_links set expires_at = now() - interval '1 minute' where token_hash = lpad('1', 64, 'e');
select is((select state from public.open_shared_cv(lpad('1', 64, 'e'), repeat('1', 64))), 'invalid', 'an expired link');
update public.cv_settings set visibility = 'private' where user_id = pg_temp.u('S');
select is((select state from public.open_shared_cv(repeat('a', 64), repeat('1', 64))), 'unavailable', 'a private CV pauses links');
update public.cv_settings set visibility = 'link' where user_id = pg_temp.u('S');

-- ---------------------------------------------------------------------------
-- Verify (anyone)
-- ---------------------------------------------------------------------------
set local role anon;
select is((select key_id from public.verify_cv('sssss00002')), 'cv-20261009-cccccccc', 'codes are read case-insensitively');
select ok((select snapshot is not null and superseded_at is null from public.verify_cv('SSSSS00002')), 'the newest: content, not superseded');
select ok((select superseded_at is not null from public.verify_cv('SSSSS00001')), 'the older one: superseded');
select is((select count(*)::integer from public.verify_cv('ZZZZZ99999')), 0, 'an unknown code: no row');
select is((select pdf_checked::text || ':' || pdf_matches::text from public.verify_cv('SSSSS00002', repeat('7', 64))), 'true:false',
  'a PDF hash with no export behind it doesn''t match');
reset role;

-- ---------------------------------------------------------------------------
-- The student revokes; the link never falls back; re-issue under a new code
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('O');
select throws_ok(format('select public.revoke_cv(%L)', pg_temp.rec('SSSSS00002')), 'P0002', null, 'nobody else revokes a CV');
select pg_temp.as_user('S');
select lives_ok(format('select public.revoke_cv(%L)', pg_temp.rec('SSSSS00002')), 'the student revokes their newest version');
reset role;
select is((select state from public.open_shared_cv(repeat('a', 64), repeat('3', 64))), 'unavailable',
  'the link says "no longer available", never the older version');
set local role anon;
select is((select array[code, (issued_at is not null)::text, (revoked_at is not null)::text,
                        coalesce(key_id, '-'), coalesce(snapshot::text, '-'), coalesce(signature, '-')]
             from public.verify_cv('SSSSS00002')),
  array['SSSSS00002', 'true', 'true', '-', '-', '-'], 'revoked: only the code and dates');
reset role;
select throws_ok($$select pg_temp.issue('S', 'SSSSS00003', repeat('9', 64), 'reissue')$$, '55000', null,
  'a re-issue must carry the revoked version''s content');
select isnt(pg_temp.issue('S', 'SSSSS00003', repeat('2', 64), 'reissue'), null, 'the same content under a new code');
select is((select state || ':' || code from public.open_shared_cv(repeat('a', 64), repeat('3', 64))), 'ok:SSSSS00003',
  'the link opens the new version');
select throws_ok($$select pg_temp.issue('S', 'SSSSS00004', repeat('2', 64), 'reissue')$$, '55000', null,
  'only after revoking the newest');
select throws_ok($$select pg_temp.issue('S', 'SSSSS00004', repeat('4', 64), 'on_demand')$$, '42501', null,
  'refresh any time is Pro (stubbed off)');

-- ---------------------------------------------------------------------------
-- PDF exports
-- ---------------------------------------------------------------------------
create function pg_temp.mac(p_export uuid, p_record uuid, p_hash text, p_bytes integer) returns text language sql stable as $$
  select encode(extensions.hmac(p_export::text || '|' || p_record::text || '|standard|a4|' || p_hash || '|' || p_bytes::text,
    (select decrypted_secret from vault.decrypted_secrets where name = 'cv_export_secret'), 'sha256'), 'hex')
$$;
create temp table fx as
select x.export_id, pg_temp.mac(x.export_id, pg_temp.rec('SSSSS00003'), repeat('5', 64), 999) as bad
  from (select gen_random_uuid() as export_id) x;
create temp table fx_ok as
select export_id, pg_temp.mac(export_id, pg_temp.rec('SSSSS00003'), repeat('5', 64), 1234) as mac from fx;
grant select on fx, fx_ok to authenticated;
set local role authenticated;
select pg_temp.as_user('S');
select throws_ok(format('select public.record_cv_export(%L, %L, ''standard'', ''a4'', %L, 1234, %L)',
  (select export_id from fx), pg_temp.rec('SSSSS00003'), repeat('5', 64), (select bad from fx)), '42501', null,
  'a MAC that doesn''t cover these fields is refused');
select throws_ok(format('select public.record_cv_export(%L, %L, ''standard'', ''a4'', %L, 1234, %L)',
  (select export_id from fx), pg_temp.rec('SSSSS00003'), repeat('5', 64), (select mac from fx_ok)), 'P0002', null,
  'the file must be in the student''s folder');
reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'cv-exports', pg_temp.u('S')::text || '/' || export_id::text || '.pdf', pg_temp.u('S')::text, '{"size": 1234}'::jsonb from fx;
set local role authenticated;
select pg_temp.as_user('S');
select lives_ok(format('select public.record_cv_export(%L, %L, ''standard'', ''a4'', %L, 1234, %L)',
  (select export_id from fx), pg_temp.rec('SSSSS00003'), repeat('5', 64), (select mac from fx_ok)), 'the route''s export is recorded');
select throws_ok(format('select public.record_cv_export(%L, %L, ''classic'', ''a4'', %L, 1234, %L)',
  gen_random_uuid(), pg_temp.rec('SSSSS00003'), repeat('5', 64), (select mac from fx_ok)), '42501', null,
  'Pro templates need their own entitlement');
select pg_temp.as_user('O');
select throws_ok(format('select public.record_cv_export(%L, %L, ''standard'', ''a4'', %L, 1234, %L)',
  gen_random_uuid(), pg_temp.rec('SSSSS00003'), repeat('5', 64), (select mac from fx_ok)), '42501', null,
  'no export without the entitlement');
select is((select count(*)::integer from public.cv_pdf_exports), 0, 'others can''t see a student''s exports');
reset role;
set local role anon;
select is((select pdf_matches from public.verify_cv('SSSSS00003', repeat('5', 64))), true, 'the exported file''s hash matches');
select is((select pdf_matches from public.verify_cv('SSSSS00003', repeat('6', 64))), false, 'one changed byte doesn''t');
select throws_ok($$select count(*) from public.cv_pdf_exports$$, '42501', null, 'anonymous visitors read no tables');
reset role;

-- ---------------------------------------------------------------------------
-- Trust reviewers
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('O');
select throws_ok($$select * from public.ops_cv_records('cc_02')$$, '42501', null, 'students can''t search CVs');
select pg_temp.as_user('R');
select throws_ok($$select * from public.ops_cv_records('cc_02')$$, '42501', null, 'staff need two-factor');
select pg_temp.as_user('R', 'aal2');
select is((select array_agg(code) from public.ops_cv_records('@cc_02')), array['KKKKK00001'], 'found by username');
select is((select array_agg(username) from public.ops_cv_records('kkkkk-00001')), array['cc_02'], 'or by code');
select throws_ok(format('select public.ops_revoke_cv(%L, false, %L)', pg_temp.rec('KKKKK00001'), 'x'), '22023', null, 'with a reason');
select is(public.ops_revoke_cv(pg_temp.rec('KKKKK00001'), false, 'Ring confirmed by the anti-gaming review'), 1, 'a reviewer revokes');
reset role;
select is((select action || ':' || reason from public.ops_audit_log where target_id = pg_temp.rec('KKKKK00001')::text),
  'cv.revoke:Ring confirmed by the anti-gaming review', 'audited with the reason');
select is((select type from public.notifications where user_id = pg_temp.u('L') and entity_id = pg_temp.rec('KKKKK00001')),
  'cv_revoked', 'and the student is told');

-- ---------------------------------------------------------------------------
-- Bans and deletion
-- ---------------------------------------------------------------------------
update auth.users set banned_until = now() + interval '30 days' where id = pg_temp.u('S');
select is((select count(*)::integer from public.cv_records where user_id = pg_temp.u('S') and revoked_at is null), 0,
  'a ban revokes every version');
select is((select count(*)::integer from public.cv_share_links where user_id = pg_temp.u('S') and revoked_reason = 'suspended'), 10,
  'and every link');
update auth.users set banned_until = null where id = pg_temp.u('S');
select is((select count(*)::integer from public.cv_records where user_id = pg_temp.u('S') and revoked_at is null), 0,
  'lifting the ban restores nothing');

select isnt(pg_temp.issue('O', 'QQQQQ00001', repeat('8', 64)), null, 'O has a CV');
delete from auth.users where id = pg_temp.u('O');
select is((select array[(user_id is null)::text, (snapshot is null)::text, revoked_reason]
             from public.cv_records where code = 'QQQQQ00001'), array['true', 'true', 'deleted'],
  'account deletion: revoked, content wiped, the code kept');
set local role anon;
select ok((select revoked_at is not null and snapshot is null from public.verify_cv('QQQQQ00001')),
  'so the verify page says Revoked, not Not found');
reset role;

-- ---------------------------------------------------------------------------
-- A monthly refresh tells the student (in-app)
-- ---------------------------------------------------------------------------
update auth.users set banned_until = null where id = pg_temp.u('L');
select isnt(pg_temp.issue('L', 'KKKKK00002', repeat('a', 64), 'monthly'), null, 'a monthly version');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u('L') and type = 'cv_refreshed'), 1,
  'comes with a notice');

select * from finish();
rollback;
