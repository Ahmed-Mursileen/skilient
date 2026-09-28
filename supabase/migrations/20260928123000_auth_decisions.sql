-- Ahmed's decisions of 2026-09-28 (docs/decisions.md):
--   1/5. No account lockout. Failed passwords bring Turnstile after a few tries and, from
--        the 10th in 15 minutes, a growing delay of seconds plus one "someone is trying to
--        sign in" email. The emailed sign-in code and university Google always work, so an
--        attacker can't lock a student out.
--   2.   "Looking for" is a multi-select: teammates, a project to join, an internship, a
--        job, faculty mentorship.
--   4.   Two-factor backup codes: 10 single-use codes, stored hashed, shown once, can be
--        regenerated; each use is logged (and emailed by the app).

-- ---------------------------------------------------------------------------
-- 1/5. Sign-in throttling without lockout
-- ---------------------------------------------------------------------------
alter table public.security_events drop constraint security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check check (kind in (
  -- 'account_locked' stays readable for rows written before lockouts were removed.
  'signup', 'sign_in', 'sign_in_failed', 'account_locked', 'sign_in_alert', 'new_device', 'not_me',
  'password_reset_requested', 'password_changed', 'mfa_enrolled', 'mfa_unenrolled',
  'mfa_backup_codes_created', 'mfa_backup_code_used',
  'signed_out_everywhere', 'github_connected', 'github_disconnected'
));

-- Seconds to wait after the latest failure once an account has 10+ in 15 minutes:
-- 2, 4, 8, 16, 32, then 60. Never longer.
create function private.signin_delay_seconds(p_failures integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_failures < 10 then 0 else least(60, (2 ^ least(p_failures - 9, 6))::integer) end;
$$;
revoke all on function private.signin_delay_seconds(integer) from public;

-- Before a password sign-in: is Turnstile needed, and how long must this account wait?
-- Turnstile after 3 failures for the account or 5 for the network in 15 minutes.
create or replace function private.signin_status(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acct text := private.signin_account_key(p_email);
  v_ip text := private.signin_ip_key(p_ip_hash);
  v_acct_failures integer;
  v_ip_failures integer := 0;
  v_last timestamptz;
  v_wait integer := 0;
begin
  select count(*), max(f.created_at) into v_acct_failures, v_last
    from private.auth_failures f where f.key = v_acct and f.created_at > now() - interval '15 minutes';
  if v_ip is not null then
    select count(*) into v_ip_failures
      from private.auth_failures f where f.key = v_ip and f.created_at > now() - interval '15 minutes';
  end if;
  if v_acct_failures >= 10 then
    v_wait := greatest(0, ceil(extract(epoch from (
      v_last + make_interval(secs => private.signin_delay_seconds(v_acct_failures)) - now()
    )))::integer);
  end if;
  return jsonb_build_object(
    'failures', v_acct_failures,
    'captcha_required', v_acct_failures >= 3 or v_ip_failures >= 5,
    'retry_after_seconds', v_wait
  );
end;
$$;

-- After a failed password sign-in. Never locks: returns whether Turnstile is needed, the
-- delay before the next try, and whether to email the owner ("someone is trying to sign
-- in"; at most once an hour, only when the account exists).
create or replace function private.signin_failed(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_acct text := private.signin_account_key(p_email);
  v_ip text := private.signin_ip_key(p_ip_hash);
  v_ip_hash text := case when v_ip is not null then p_ip_hash end;
  v_acct_failures integer;
  v_ip_failures integer := 0;
  v_user uuid;
  v_notify boolean := false;
begin
  insert into private.auth_failures (key) values (v_acct);
  if v_ip is not null then
    insert into private.auth_failures (key) values (v_ip);
  end if;

  select count(*) into v_acct_failures
    from private.auth_failures f where f.key = v_acct and f.created_at > now() - interval '15 minutes';
  if v_ip is not null then
    select count(*) into v_ip_failures
      from private.auth_failures f where f.key = v_ip and f.created_at > now() - interval '15 minutes';
  end if;

  select u.id into v_user from auth.users u where u.email = lower(btrim(p_email)) limit 1;
  if v_user is not null then
    insert into public.security_events (user_id, kind, ip_hash) values (v_user, 'sign_in_failed', v_ip_hash);
    if v_acct_failures >= 10 and not exists (
      select 1 from public.security_events e
       where e.user_id = v_user and e.kind = 'sign_in_alert' and e.created_at > now() - interval '1 hour'
    ) then
      insert into public.security_events (user_id, kind, ip_hash) values (v_user, 'sign_in_alert', v_ip_hash);
      v_notify := true;
    end if;
  end if;

  return jsonb_build_object(
    'failures', v_acct_failures,
    'captcha_required', v_acct_failures >= 3 or v_ip_failures >= 5,
    'retry_after_seconds', private.signin_delay_seconds(v_acct_failures),
    'notify', v_notify
  );
end;
$$;

-- Lockouts are gone; purge no longer touches them.
create or replace function private.purge_security_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_rows integer := 0;
  v_n integer;
begin
  v_run := public.job_run_start('purge-security-data');
  begin
    delete from private.rate_limit_events where created_at < now() - interval '1 day';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
    delete from private.auth_failures where created_at < now() - interval '1 day';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
    delete from private.security_alert_tokens where expires_at < now() - interval '1 day';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
    delete from private.mfa_backup_codes where used_at < now() - interval '1 year';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
    delete from public.security_events where created_at < now() - interval '1 year';
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_rows);
end;
$$;

drop table private.auth_lockouts;

-- ---------------------------------------------------------------------------
-- 2. "Looking for" options (5.27 multi-select)
-- ---------------------------------------------------------------------------
-- Old options with no new equivalent are dropped from profiles before the values are
-- renamed, so nobody silently changes meaning.
update public.profiles
   set looking_for = array_remove(array_remove(looking_for, 'competitions'), 'learning')
 where looking_for && array['competitions', 'learning']::public.looking_for_option[];
alter type public.looking_for_option rename value 'internships' to 'internship';
alter type public.looking_for_option rename value 'jobs' to 'job';
alter type public.looking_for_option rename value 'competitions' to 'project';
alter type public.looking_for_option rename value 'learning' to 'mentorship';
comment on type public.looking_for_option is
  'What a student is open to (PRD 5.27): teammates, a project to join, an internship, a job, faculty mentorship.';
-- For matching later (who's looking for teammates, mentorship, ...).
create index profiles_looking_for_idx on public.profiles using gin (looking_for);

-- ---------------------------------------------------------------------------
-- 4. Two-factor backup codes
-- ---------------------------------------------------------------------------
create table private.mfa_backup_codes (
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  primary key (user_id, code_hash)
);
alter table private.mfa_backup_codes enable row level security;

-- Codes are 10 characters from an unambiguous alphabet, shown as xxxxx-xxxxx; stored as
-- sha256 of the normalised form (lower case, no separators).
create function private.normalize_backup_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
$$;
revoke all on function private.normalize_backup_code(text) from public;

-- Replaces the caller's codes with 10 new ones and returns them once. Needs a two-factor
-- (aal2) session: set-up has just verified a code, and regenerating is a sensitive change.
create function private.create_mfa_backup_codes()
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_codes text[] := '{}';
  v_code text;
  v_bytes bytea;
begin
  if v_user is null or coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'two-factor session required' using errcode = '42501';
  end if;
  if not private.rate_limit('mfa_backup_codes:' || v_user::text, 10, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  delete from private.mfa_backup_codes where user_id = v_user;
  for i in 1..10 loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for j in 0..9 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, j) % length(v_alphabet)) + 1, 1);
    end loop;
    insert into private.mfa_backup_codes (user_id, code_hash)
    values (v_user, encode(extensions.digest(v_code, 'sha256'), 'hex'));
    v_codes := v_codes || (substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5));
  end loop;
  insert into public.security_events (user_id, kind) values (v_user, 'mfa_backup_codes_created');
  return v_codes;
end;
$$;
revoke all on function private.create_mfa_backup_codes() from public;
grant execute on function private.create_mfa_backup_codes() to authenticated;

create function public.create_mfa_backup_codes()
returns text[]
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_mfa_backup_codes();
$$;
revoke all on function public.create_mfa_backup_codes() from public, anon;
grant execute on function public.create_mfa_backup_codes() to authenticated;

-- How many unused codes the caller has left (Settings -> Security).
create function private.mfa_backup_codes_remaining()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.mfa_backup_codes
   where user_id = (select auth.uid()) and used_at is null;
$$;
revoke all on function private.mfa_backup_codes_remaining() from public;
grant execute on function private.mfa_backup_codes_remaining() to authenticated;

create function public.mfa_backup_codes_remaining()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select private.mfa_backup_codes_remaining();
$$;
revoke all on function public.mfa_backup_codes_remaining() from public, anon;
grant execute on function public.mfa_backup_codes_remaining() to authenticated;

-- Drops the caller's codes (when their last authenticator is removed).
create function private.delete_mfa_backup_codes()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.mfa_backup_codes where user_id = (select auth.uid());
$$;
revoke all on function private.delete_mfa_backup_codes() from public;
grant execute on function private.delete_mfa_backup_codes() to authenticated;

create function public.delete_mfa_backup_codes()
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.delete_mfa_backup_codes();
$$;
revoke all on function public.delete_mfa_backup_codes() from public, anon;
grant execute on function public.delete_mfa_backup_codes() to authenticated;

-- Second step of sign-in with a backup code instead of the app. Supabase can only reach a
-- two-factor session through an authenticator, so a used code switches two-factor off
-- (authenticators and the other codes are removed) and the student is asked to set it up
-- again. Each use is logged; the app emails the owner. Password-verified session only
-- (aal1 with factors), at most 10 tries in 15 minutes.
create function private.use_mfa_backup_code(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_hash text := encode(extensions.digest(private.normalize_backup_code(p_code), 'sha256'), 'hex');
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not private.rate_limit('mfa_backup_use:' || v_user::text, 10, interval '15 minutes') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  update private.mfa_backup_codes set used_at = now()
   where user_id = v_user and code_hash = v_hash and used_at is null;
  if not found then
    return false;
  end if;
  delete from auth.mfa_factors where user_id = v_user;
  delete from private.mfa_backup_codes where user_id = v_user and used_at is null;
  insert into public.security_events (user_id, kind) values (v_user, 'mfa_backup_code_used');
  return true;
end;
$$;
revoke all on function private.use_mfa_backup_code(text) from public;
grant execute on function private.use_mfa_backup_code(text) to authenticated;

create function public.use_mfa_backup_code(p_code text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.use_mfa_backup_code(p_code);
$$;
revoke all on function public.use_mfa_backup_code(text) from public, anon;
grant execute on function public.use_mfa_backup_code(text) to authenticated;

