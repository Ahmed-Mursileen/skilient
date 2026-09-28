-- Two-factor backup codes and "Looking for" options (decisions 2026-09-28).
begin;
select plan(24);

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-00000000000a', 'a@nutech.edu.pk'),
  ('50000000-0000-0000-0000-00000000000b', 'b@nu.edu.pk');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '50000000-0000-0000-0000-00000000000a', 'Authenticator app', 'totp', 'verified', now(), now()),
  (gen_random_uuid(), '50000000-0000-0000-0000-00000000000a', 'Authenticator app 2', 'totp', 'verified', now(), now());

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create temporary table codes (n int, code text) on commit drop;
grant all on codes to authenticated;

-- Creating codes needs a two-factor session.
set local role anon;
select throws_ok($$ select public.create_mfa_backup_codes() $$, '42501', null, 'anon cannot create codes');
select throws_ok($$ select public.use_mfa_backup_code('aaaaa-aaaaa') $$, '42501', null, 'anon cannot use codes');
reset role;

set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.create_mfa_backup_codes() $$, '42501', 'two-factor session required',
  'a password-only session cannot create codes');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a', 'aal2');
insert into codes select n, c from unnest(public.create_mfa_backup_codes()) with ordinality as t(c, n);
select is((select count(distinct code)::int from codes), 10, 'ten distinct codes are shown once');
select is((select count(*)::int from codes where code ~ '^[2-9a-hjkmnp-z]{5}-[2-9a-hjkmnp-z]{5}$'), 10,
  'codes are xxxxx-xxxxx from an unambiguous alphabet');
select is(public.mfa_backup_codes_remaining(), 10, 'ten remain');
select throws_ok($$ select * from private.mfa_backup_codes $$, '42501', null, 'codes are never readable');
reset role;
select is((select count(*)::int from private.mfa_backup_codes c join codes on c.code_hash = codes.code
            or c.code_hash = replace(codes.code, '-', '')), 0, 'only hashes are stored');
select is((select count(*)::int from public.security_events
            where user_id = '50000000-0000-0000-0000-00000000000a' and kind = 'mfa_backup_codes_created'), 1,
  'creating codes is logged');

-- Using a code (password-verified session).
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b');
select is(public.use_mfa_backup_code((select code from codes where n = 1)), false, 'another account cannot use the code');
select is(public.mfa_backup_codes_remaining(), 0, 'another account has no codes');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000a');
select is(public.use_mfa_backup_code('zzzzz-zzzzz'), false, 'a wrong code is refused');
select is(public.use_mfa_backup_code(upper(replace((select code from codes where n = 1), '-', ' '))), true,
  'a right code works in any case and spacing');
select is(public.mfa_backup_codes_remaining(), 0, 'using a code clears the rest');
select is(public.use_mfa_backup_code((select code from codes where n = 1)), false, 'a code works once');
select is(public.use_mfa_backup_code((select code from codes where n = 2)), false, 'the other codes are gone');
reset role;
select is((select count(*)::int from auth.mfa_factors where user_id = '50000000-0000-0000-0000-00000000000a'), 0,
  'two-factor is switched off so the student can set it up again');
select is((select count(*)::int from public.security_events
            where user_id = '50000000-0000-0000-0000-00000000000a' and kind = 'mfa_backup_code_used'), 1,
  'the use is logged');

-- Regenerating replaces old codes; removing two-factor deletes them.
set local role authenticated;
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b', 'aal2');
truncate codes;
insert into codes select n, c from unnest(public.create_mfa_backup_codes()) with ordinality as t(c, n);
select is(cardinality(public.create_mfa_backup_codes()), 10, 'regenerating returns ten new codes');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b');
select is(public.use_mfa_backup_code((select code from codes where n = 1)), false, 'regenerating voids the old codes');
select pg_temp.as_user('50000000-0000-0000-0000-00000000000b', 'aal2');
select public.delete_mfa_backup_codes();
select is(public.mfa_backup_codes_remaining(), 0, 'deleting clears the codes');
reset role;

-- "Looking for": the 5.27 options, indexed for matching.
select is(enum_range(null::public.looking_for_option)::text[],
  array['internship', 'job', 'teammates', 'project', 'mentorship'], 'the five options');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_looking_for_idx'),
  'looking_for has a GIN index');
update public.profiles set looking_for = '{teammates,mentorship}' where user_id = '50000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.profiles where looking_for @> '{mentorship}'), 1, 'profiles match by option');

select * from finish();
rollback;
