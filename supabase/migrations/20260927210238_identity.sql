-- Phase 1 identity (PRD 5.2, 5.4, 5.23 seed, 5.27, 8, 10 "Accounts and sign-in"):
-- universities and email domains, profiles, agreements, onboarding state, security
-- events and sign-in throttling, staff roles, the signup hook, and profile image buckets.
--
-- Pattern used throughout:
--   * Everything in `public` (exposed by the Data API) is SECURITY INVOKER.
--   * Privileged work (RLS helpers, cross-user lookups, throttling) is SECURITY DEFINER in
--     the unexposed `private` schema, with a fixed search_path and its own auth.uid() check.
--   * Where users need a privileged operation over the API, a thin public invoker wrapper
--     calls the private function. Grants are explicit per function and per table.

-- ---------------------------------------------------------------------------
-- Schema and shared helpers
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role, supabase_auth_admin;

create extension if not exists pg_cron;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;

-- Domain part of an email address, lower-cased; null when there isn't one.
create function private.email_domain(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(substring(btrim(p_email) from '@([^@]+)$')), '');
$$;
revoke all on function private.email_domain(text) from public;

create function private.reserved_usernames()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'admin', 'administrator', 'api', 'auth', 'edit', 'feed', 'help', 'me', 'new', 'null',
    'onboarding', 'ops', 'profile', 'root', 'security', 'settings', 'signin', 'signup',
    'skilient', 'staff', 'support', 'system', 'undefined', 'uni', 'verify'
  ];
$$;
revoke all on function private.reserved_usernames() from public;
-- Used by the profiles.username check, which runs as the writing user.
grant execute on function private.reserved_usernames() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.account_role as enum ('student', 'faculty', 'recruiter', 'university_admin');
create type public.domain_kind as enum ('student', 'faculty', 'both');
create type public.profile_visibility as enum ('friends', 'university', 'global');
create type public.looking_for_option as enum ('internships', 'jobs', 'teammates', 'competitions', 'learning');
create type public.staff_role as enum ('moderator', 'trust_reviewer', 'accounts', 'super_admin');

-- ---------------------------------------------------------------------------
-- Universities and email domains (PRD 5.23; data comes from the HEC sync migration)
-- ---------------------------------------------------------------------------
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  city text check (city is null or char_length(city) between 1 and 80),
  province text check (province is null or province in ('Punjab', 'Sindh', 'KP', 'Balochistan', 'ICT', 'AJK', 'GB')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.universities is 'HEC-recognised universities; preloaded so every student can sign up on day one (PRD 5.23).';

create trigger universities_set_updated_at
before update on public.universities
for each row execute function private.set_updated_at();

create table public.university_domains (
  university_id uuid not null references public.universities (id) on delete cascade,
  domain text not null check (
    char_length(domain) <= 253
    and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  kind public.domain_kind not null default 'both',
  -- hec_seed rows are owned by the HEC sync; ops rows are added by staff (phase 11) and never touched by it.
  source text not null default 'hec_seed' check (source in ('hec_seed', 'ops')),
  created_at timestamptz not null default now(),
  primary key (university_id, domain)
);
comment on table public.university_domains is 'Email domains that gate student/faculty signup. One domain can belong to several universities (the signup picker).';
create index university_domains_domain_idx on public.university_domains (domain);

create table public.personal_email_domains (
  domain text primary key check (domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'),
  created_at timestamptz not null default now()
);
comment on table public.personal_email_domains is 'Webmail domains refused with "Use your university email" (PRD 5.27).';

insert into public.personal_email_domains (domain) values
  ('gmail.com'), ('googlemail.com'), ('yahoo.com'), ('yahoo.co.uk'), ('yahoo.co.in'), ('ymail.com'),
  ('rocketmail.com'), ('hotmail.com'), ('hotmail.co.uk'), ('outlook.com'), ('live.com'), ('msn.com'),
  ('icloud.com'), ('me.com'), ('mac.com'), ('aol.com'), ('proton.me'), ('protonmail.com'), ('pm.me'),
  ('gmx.com'), ('gmx.net'), ('mail.com'), ('yandex.com'), ('yandex.ru'), ('zoho.com'), ('zohomail.com'),
  ('tutanota.com'), ('tuta.io'), ('hey.com'), ('fastmail.com'), ('mail.ru'), ('qq.com'), ('163.com'),
  ('rediffmail.com');

-- Public reference data: anyone may read it (the signup form's cached domain list).
alter table public.universities enable row level security;
alter table public.university_domains enable row level security;
alter table public.personal_email_domains enable row level security;
revoke all on table public.universities, public.university_domains, public.personal_email_domains from anon, authenticated;
grant select on table public.universities, public.university_domains, public.personal_email_domains to anon, authenticated;

create policy universities_read on public.universities
  for select to anon, authenticated using (true);
create policy university_domains_read on public.university_domains
  for select to anon, authenticated using (true);
create policy personal_email_domains_read on public.personal_email_domains
  for select to anon, authenticated using (true);

-- True when p_domain may sign up students at p_university (any university when null).
create function private.domain_admits_students(p_domain text, p_university_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.university_domains d
     where d.domain = p_domain
       and d.kind in ('student', 'both')
       and (p_university_id is null or d.university_id = p_university_id)
  );
$$;
revoke all on function private.domain_admits_students(text, uuid) from public;

-- Idempotent HEC sync (PRD 5.23 seed). Called by generated data migrations built from
-- supabase/seed/hec_universities.csv (scripts/universities.mjs). Upserts universities by
-- name and makes each university's hec_seed domains match the file; ops-added domains
-- and universities no longer in the file are left alone (profiles may reference them).
create function private.sync_hec_universities(p_rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_domains text[];
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'sync_hec_universities expects a JSON array' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    insert into public.universities (name, slug, city, province)
    values (v_row ->> 'name', v_row ->> 'slug', nullif(v_row ->> 'city', ''), nullif(v_row ->> 'province', ''))
    on conflict (name) do update
      set slug = excluded.slug, city = excluded.city, province = excluded.province
      where (public.universities.slug, public.universities.city, public.universities.province)
            is distinct from (excluded.slug, excluded.city, excluded.province)
    returning id into v_id;

    if v_id is null then
      select u.id into v_id from public.universities u where u.name = v_row ->> 'name';
    end if;

    select coalesce(array_agg(lower(d)), '{}') into v_domains
      from jsonb_array_elements_text(coalesce(v_row -> 'domains', '[]'::jsonb)) d;

    delete from public.university_domains ud
     where ud.university_id = v_id
       and ud.source = 'hec_seed'
       and not (ud.domain = any (v_domains));

    insert into public.university_domains (university_id, domain, kind, source)
    select v_id, d, 'both', 'hec_seed' from unnest(v_domains) d
    on conflict (university_id, domain) do nothing;
  end loop;
end;
$$;
revoke all on function private.sync_hec_universities(jsonb) from public;

-- ---------------------------------------------------------------------------
-- Staff roles (PRD 5.26; granted by a super admin, no ops UI until phase 11)
-- ---------------------------------------------------------------------------
create table public.staff_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.staff_roles is 'Skilient staff. Writes only by a super admin through ops (phase 11); read own rows.';
create index staff_roles_granted_by_idx on public.staff_roles (granted_by);

-- Staff need two-factor: a staff role only counts on an aal2 session (PRD 10).
-- super_admin implies every other role.
create function private.is_staff(p_role public.staff_role default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1
         from public.staff_roles s
        where s.user_id = (select auth.uid())
          and (p_role is null or s.role = p_role or s.role = 'super_admin')
     );
$$;
revoke all on function private.is_staff(public.staff_role) from public;
grant execute on function private.is_staff(public.staff_role) to authenticated, service_role;

alter table public.staff_roles enable row level security;
revoke all on table public.staff_roles from anon, authenticated;
grant select on table public.staff_roles to authenticated;
create policy staff_roles_read on public.staff_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff('super_admin')));

create function public.is_staff(p_role public.staff_role default null)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_staff(p_role);
$$;
revoke all on function public.is_staff(public.staff_role) from public, anon, authenticated;
grant execute on function public.is_staff(public.staff_role) to authenticated, service_role;

-- Phase 0 left job_runs readable by nobody until staff existed.
grant select on table public.job_runs to authenticated;
create policy job_runs_staff_read on public.job_runs
  for select to authenticated
  using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Profiles (PRD 5.4) and the restricted public card
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.account_role not null default 'student',
  -- Null only while a shared email domain leaves the university ambiguous (chosen in onboarding step 1).
  university_id uuid references public.universities (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 60),
  username text unique check (
    username ~ '^[a-z0-9_]{3,30}$' and not (username = any (private.reserved_usernames()))
  ),
  department text check (department is null or char_length(department) between 2 and 80),
  programme text check (programme is null or char_length(programme) between 2 and 80),
  graduation_year smallint check (graduation_year is null or graduation_year between 1980 and 2100),
  campus text check (campus is null or char_length(campus) between 2 and 60),
  bio text check (bio is null or char_length(bio) <= 280),
  avatar_path text check (avatar_path is null or (starts_with(avatar_path, user_id::text || '/') and char_length(avatar_path) <= 200)),
  cover_path text check (cover_path is null or (starts_with(cover_path, user_id::text || '/') and char_length(cover_path) <= 200)),
  visibility public.profile_visibility not null default 'university',
  recruiter_visible boolean not null default false,
  looking_for public.looking_for_option[] not null default '{}',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account, created by handle_new_user(). Visibility is enforced only by profiles_select_visible.';
-- Covers the university FK and "classmates" lookups (same university, department, batch).
create index profiles_university_cohort_idx on public.profiles (university_id, department, graduation_year);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- What a restricted viewer may see: name, department and batch (PRD 5.4). Read only
-- through get_profile_card(username): an exact-username lookup, never a listing.
create table public.profiles_public_card (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  username text unique,
  full_name text not null,
  department text,
  graduation_year smallint
);
comment on table public.profiles_public_card is 'Restricted profile card, kept in sync by trigger. No direct access; use get_profile_card().';

create function private.sync_public_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles_public_card (user_id, username, full_name, department, graduation_year)
  values (new.user_id, new.username, new.full_name, new.department, new.graduation_year)
  on conflict (user_id) do update
    set username = excluded.username,
        full_name = excluded.full_name,
        department = excluded.department,
        graduation_year = excluded.graduation_year;
  return null;
end;
$$;
revoke all on function private.sync_public_card() from public;

create trigger profiles_sync_public_card
after insert or update of username, full_name, department, graduation_year on public.profiles
for each row execute function private.sync_public_card();

-- RLS helpers. Friendships and blocks arrive in phase 3, which replaces these two bodies;
-- until then nobody is a friend (friends-only profiles stay owner-only) and nobody is blocked.
create function private.is_friend_of(p_other uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select false and p_other is not null;
$$;

create function private.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select false and p_other is not null;
$$;

create function private.current_university_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.university_id from public.profiles p where p.user_id = (select auth.uid());
$$;

revoke all on function private.is_friend_of(uuid), private.is_blocked_with(uuid), private.current_university_id() from public;
grant execute on function private.is_friend_of(uuid), private.is_blocked_with(uuid), private.current_university_id()
  to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.profiles_public_card enable row level security;
revoke all on table public.profiles, public.profiles_public_card from anon, authenticated;

-- Reads: owner; global to every signed-in user; university to the same university;
-- friends to friends; never across a block (PRD 5.4, 8). Signed-out visitors get nothing.
grant select on table public.profiles to authenticated;
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      not private.is_blocked_with(user_id)
      and (
        visibility = 'global'
        or (visibility = 'university' and university_id = (select private.current_university_id()))
        or (visibility = 'friends' and private.is_friend_of(user_id))
      )
    )
  );

-- Writes: owner only, and only these columns. Role, university and onboarding completion
-- change through checked functions; rows are created by handle_new_user().
grant update (
  full_name, username, department, programme, graduation_year, campus, bio,
  avatar_path, cover_path, visibility, recruiter_visible, looking_for
) on table public.profiles to authenticated;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function private.get_profile_card(p_username text)
returns table (username text, full_name text, department text, graduation_year smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.username, c.full_name, c.department, c.graduation_year
    from public.profiles_public_card c
   where (select auth.uid()) is not null
     and c.username = lower(btrim(p_username))
     and not private.is_blocked_with(c.user_id);
$$;
revoke all on function private.get_profile_card(text) from public;
grant execute on function private.get_profile_card(text) to authenticated;

create function public.get_profile_card(p_username text)
returns table (username text, full_name text, department text, graduation_year smallint)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_profile_card(p_username);
$$;
revoke all on function public.get_profile_card(text) from public, anon, authenticated;
grant execute on function public.get_profile_card(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Throttling (PRD 8 rate_limit(); PRD 10 failed sign-ins)
-- ---------------------------------------------------------------------------
create table private.rate_limit_events (
  key text not null check (char_length(key) between 1 and 200),
  created_at timestamptz not null default now()
);
create index rate_limit_events_key_created_idx on private.rate_limit_events (key, created_at desc);
create index rate_limit_events_created_idx on private.rate_limit_events (created_at);
alter table private.rate_limit_events enable row level security;

-- Records one event for p_key and returns true, or returns false (recording nothing)
-- when p_limit events already happened inside p_window. Keys are opaque; the app HMACs them.
create function private.rate_limit(p_key text, p_limit integer, p_window interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
     or p_limit not between 1 and 1000
     or p_window <= interval '0' or p_window > interval '1 day' then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;

  -- Serialise callers on the same key so parallel requests can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('rate_limit:' || p_key, 0));

  select count(*) into v_count
    from private.rate_limit_events e
   where e.key = p_key
     and e.created_at > now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into private.rate_limit_events (key) values (p_key);
  return true;
end;
$$;
revoke all on function private.rate_limit(text, integer, interval) from public;
grant execute on function private.rate_limit(text, integer, interval) to anon, authenticated, service_role;

create function public.rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.rate_limit(p_key, p_limit, make_interval(secs => p_window_seconds));
$$;
revoke all on function public.rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit(text, integer, integer) to anon, authenticated, service_role;

create table private.auth_failures (
  key text not null check (char_length(key) between 1 and 200),
  created_at timestamptz not null default now()
);
create index auth_failures_key_created_idx on private.auth_failures (key, created_at desc);
create index auth_failures_created_idx on private.auth_failures (created_at);
alter table private.auth_failures enable row level security;

create table private.auth_lockouts (
  key text primary key check (char_length(key) between 1 and 200),
  locked_until timestamptz not null
);
alter table private.auth_lockouts enable row level security;

create function private.signin_account_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'acct:' || encode(extensions.digest(lower(btrim(coalesce(p_email, ''))), 'sha256'), 'hex');
$$;
revoke all on function private.signin_account_key(text) from public;

create function private.signin_ip_key(p_ip_hash text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_ip_hash ~ '^[0-9a-f]{64}$' then 'ip:' || p_ip_hash end;
$$;
revoke all on function private.signin_ip_key(text) from public;

-- Before a password sign-in: is the account or IP locked, and is Turnstile needed?
-- 5 failures in 15 minutes need Turnstile; 10 lock for 15 minutes (PRD 10).
create function private.signin_status(p_email text, p_ip_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with keys as (
    select private.signin_account_key(p_email) as k
    union all
    select private.signin_ip_key(p_ip_hash) where private.signin_ip_key(p_ip_hash) is not null
  ),
  counts as (
    select k, (select count(*) from private.auth_failures f
                where f.key = keys.k and f.created_at > now() - interval '15 minutes') as n
      from keys
  )
  select jsonb_build_object(
    'failures', coalesce((select max(n) from counts), 0),
    'captcha_required', coalesce((select max(n) from counts), 0) >= 5,
    'locked_until', (select max(l.locked_until) from private.auth_lockouts l
                      where l.key in (select k from keys) and l.locked_until > now())
  );
$$;
revoke all on function private.signin_status(text, text) from public;
grant execute on function private.signin_status(text, text) to anon, authenticated;

create function public.signin_status(p_email text, p_ip_hash text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.signin_status(p_email, p_ip_hash);
$$;
revoke all on function public.signin_status(text, text) from public, anon, authenticated;
grant execute on function public.signin_status(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Security events and devices (PRD 10 build notes)
-- ---------------------------------------------------------------------------
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'signup', 'sign_in', 'sign_in_failed', 'account_locked', 'new_device', 'not_me',
    'password_reset_requested', 'password_changed', 'mfa_enrolled', 'mfa_unenrolled',
    'signed_out_everywhere'
  )),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  created_at timestamptz not null default now()
);
comment on table public.security_events is 'Sign-in and account events (kept 1 year). Written only by private functions.';
create index security_events_user_created_idx on public.security_events (user_id, created_at desc);
create index security_events_created_idx on public.security_events (created_at);

create table public.user_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);
comment on table public.user_devices is 'Devices seen at sign-in, for new-device alerts (hash of a random per-browser cookie).';

alter table public.security_events enable row level security;
alter table public.user_devices enable row level security;
revoke all on table public.security_events, public.user_devices from anon, authenticated;
grant select on table public.security_events, public.user_devices to authenticated;
create policy security_events_read_own on public.security_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_devices_read_own on public.user_devices
  for select to authenticated using (user_id = (select auth.uid()));

create table private.security_alert_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
create index security_alert_tokens_user_idx on private.security_alert_tokens (user_id);
alter table private.security_alert_tokens enable row level security;

-- After a failed password sign-in. Returns whether Turnstile is now needed, whether the
-- account just got locked, and whether to email the owner (only when the account exists).
create function private.signin_failed(p_email text, p_ip_hash text)
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
  v_locked_now boolean := false;
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
  end if;

  if v_acct_failures >= 10 and not exists (
    select 1 from private.auth_lockouts l where l.key = v_acct and l.locked_until > now()
  ) then
    insert into private.auth_lockouts (key, locked_until) values (v_acct, now() + interval '15 minutes')
    on conflict (key) do update set locked_until = excluded.locked_until;
    v_locked_now := true;
    if v_user is not null then
      insert into public.security_events (user_id, kind, ip_hash) values (v_user, 'account_locked', v_ip_hash);
    end if;
  end if;

  if v_ip is not null and v_ip_failures >= 10 then
    insert into private.auth_lockouts (key, locked_until) values (v_ip, now() + interval '15 minutes')
    on conflict (key) do update set locked_until = greatest(private.auth_lockouts.locked_until, excluded.locked_until);
  end if;

  return jsonb_build_object(
    'failures', greatest(v_acct_failures, v_ip_failures),
    'captcha_required', greatest(v_acct_failures, v_ip_failures) >= 5,
    'locked', v_acct_failures >= 10 or v_ip_failures >= 10,
    'notify', v_locked_now and v_user is not null
  );
end;
$$;
revoke all on function private.signin_failed(text, text) from public;
grant execute on function private.signin_failed(text, text) to anon, authenticated;

create function public.signin_failed(p_email text, p_ip_hash text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.signin_failed(p_email, p_ip_hash);
$$;
revoke all on function public.signin_failed(text, text) from public, anon, authenticated;
grant execute on function public.signin_failed(text, text) to anon, authenticated;

-- After any successful sign-in, as the signed-in user: log it, remember the device, clear
-- failed attempts, and mint a one-time "This wasn't me" token when the device is new and
-- the account had signed in elsewhere before (the app emails it; PRD 10).
create function private.record_sign_in(p_device_hash text, p_ip_hash text, p_user_agent text, p_method text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ip_hash text := case when p_ip_hash ~ '^[0-9a-f]{64}$' then p_ip_hash end;
  v_ua text := left(p_user_agent, 512);
  v_known boolean;
  v_had_devices boolean;
  v_token text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('password', 'otp', 'magic_link', 'google', 'recovery') then
    raise exception 'invalid sign-in method' using errcode = '22023';
  end if;
  -- Direct API callers can't flood the log or mint tokens.
  if not private.rate_limit('record_sign_in:' || v_user::text, 30, interval '1 hour') then
    return jsonb_build_object('new_device', false, 'alert_token', null);
  end if;

  select exists (select 1 from public.user_devices d where d.user_id = v_user and d.device_hash = p_device_hash),
         exists (select 1 from public.user_devices d where d.user_id = v_user)
    into v_known, v_had_devices;

  insert into public.user_devices (user_id, device_hash, user_agent)
  values (v_user, p_device_hash, v_ua)
  on conflict (user_id, device_hash) do update set last_seen_at = now(), user_agent = excluded.user_agent;

  insert into public.security_events (user_id, kind, ip_hash, user_agent, meta)
  values (v_user, 'sign_in', v_ip_hash, v_ua, jsonb_build_object('method', p_method, 'new_device', not v_known));

  delete from private.auth_failures f
   where f.key = private.signin_account_key((select u.email from auth.users u where u.id = v_user));

  if not v_known and v_had_devices then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into private.security_alert_tokens (token_hash, user_id)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user);
    insert into public.security_events (user_id, kind, ip_hash, user_agent)
    values (v_user, 'new_device', v_ip_hash, v_ua);
  end if;

  return jsonb_build_object('new_device', not v_known, 'alert_token', v_token);
end;
$$;
revoke all on function private.record_sign_in(text, text, text, text) from public;
grant execute on function private.record_sign_in(text, text, text, text) to authenticated;

create function public.record_sign_in(p_device_hash text, p_ip_hash text, p_user_agent text, p_method text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_sign_in(p_device_hash, p_ip_hash, p_user_agent, p_method);
$$;
revoke all on function public.record_sign_in(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_sign_in(text, text, text, text) to authenticated;

-- "This wasn't me": one-time token from the new-device email. Ends every session of that
-- account at once and returns its email so the app can start a password reset.
create function private.security_not_me(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_email text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;

  update private.security_alert_tokens t
     set used_at = now()
   where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and t.used_at is null
     and t.expires_at > now()
  returning t.user_id into v_user;

  if v_user is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Refresh tokens cascade with their sessions; getUser() refuses a deleted session at once.
  delete from auth.sessions s where s.user_id = v_user;
  insert into public.security_events (user_id, kind) values (v_user, 'not_me');
  select u.email into v_email from auth.users u where u.id = v_user;
  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;
revoke all on function private.security_not_me(text) from public;
grant execute on function private.security_not_me(text) to anon, authenticated;

create function public.security_not_me(p_token text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.security_not_me(p_token);
$$;
revoke all on function public.security_not_me(text) from public, anon, authenticated;
grant execute on function public.security_not_me(text) to anon, authenticated;

-- Account events the app logs for the signed-in user (reset requested, password changed,
-- two-factor changes, sign out everywhere). Sign-in, signup and lockout rows come from
-- the functions above and can't be forged here.
create function private.log_security_event(p_kind text, p_ip_hash text, p_user_agent text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('password_changed', 'mfa_enrolled', 'mfa_unenrolled', 'signed_out_everywhere') then
    raise exception 'invalid event kind' using errcode = '22023';
  end if;
  if not private.rate_limit('security_event:' || v_user::text, 30, interval '1 hour') then
    return;
  end if;
  insert into public.security_events (user_id, kind, ip_hash, user_agent)
  values (v_user, p_kind, case when p_ip_hash ~ '^[0-9a-f]{64}$' then p_ip_hash end, left(p_user_agent, 512));
end;
$$;
revoke all on function private.log_security_event(text, text, text) from public;
grant execute on function private.log_security_event(text, text, text) to authenticated;

create function public.log_security_event(p_kind text, p_ip_hash text, p_user_agent text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.log_security_event(p_kind, p_ip_hash, p_user_agent);
$$;
revoke all on function public.log_security_event(text, text, text) from public, anon, authenticated;
grant execute on function public.log_security_event(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- User agreement (PRD 5.27)
-- ---------------------------------------------------------------------------
create table public.agreement_versions (
  version integer primary key check (version > 0),
  title text not null check (char_length(title) between 1 and 120),
  body_md text not null,
  summary_md text not null default '',
  -- Null = draft. The current version is the highest published one.
  published_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.agreement_versions is 'Versioned user agreement; publishing a new version forces a re-accept at next sign-in.';

create table public.agreement_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null references public.agreement_versions (version),
  accepted_at timestamptz not null default now(),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  primary key (user_id, version)
);
create index agreement_acceptances_version_idx on public.agreement_acceptances (version);

create function private.current_agreement_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select max(v.version) from public.agreement_versions v where v.published_at is not null and v.published_at <= now();
$$;
revoke all on function private.current_agreement_version() from public;
grant execute on function private.current_agreement_version() to anon, authenticated, service_role;

alter table public.agreement_versions enable row level security;
alter table public.agreement_acceptances enable row level security;
revoke all on table public.agreement_versions, public.agreement_acceptances from anon, authenticated;
grant select on table public.agreement_versions to anon, authenticated;
create policy agreement_versions_read_published on public.agreement_versions
  for select to anon, authenticated
  using (published_at is not null and published_at <= now());

grant select on table public.agreement_acceptances to authenticated;
grant insert (user_id, version, ip_hash) on table public.agreement_acceptances to authenticated;
create policy agreement_acceptances_read_own on public.agreement_acceptances
  for select to authenticated using (user_id = (select auth.uid()));
create policy agreement_acceptances_accept_current on public.agreement_acceptances
  for insert to authenticated
  with check (user_id = (select auth.uid()) and version = (select private.current_agreement_version()));

-- Launch version: headings only; Ahmed supplies the text before the closed beta.
insert into public.agreement_versions (version, title, summary_md, published_at, body_md) values (
  1,
  'Skilient User Agreement',
  'First version of the Skilient User Agreement and Privacy Notice.',
  now(),
  $agreement$## 1. Who we are and what Skilient is

[To be written]

## 2. Eligibility

[To be written]

## 3. Your account

[To be written]

## 4. Your content and our licence to display it

[To be written]

## 5. Verification and evidence

[To be written]

## 6. University records

[To be written]

## 7. Recruiter visibility and your controls

[To be written]

## 8. Acceptable use and anti-gaming

[To be written]

## 9. Paid plans, billing and refunds

[To be written]

## 10. Moderation, suspension and appeals

[To be written]

## 11. Account deletion and data retention

[To be written]

## 12. Liability and disclaimers

[To be written]

## 13. Changes to this agreement

[To be written]

## 14. Governing law and contact

[To be written]

## Privacy Notice

[To be written]
$agreement$
);

-- ---------------------------------------------------------------------------
-- Onboarding state (PRD 5.27)
-- ---------------------------------------------------------------------------
create table public.onboarding_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.account_role not null default 'student',
  -- Furthest step reached (1–6); the wizard resumes here.
  step smallint not null default 1 check (step between 1 and 6),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16384),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.onboarding_state is 'Wizard progress. Completion only through complete_onboarding().';

create trigger onboarding_state_set_updated_at
before update on public.onboarding_state
for each row execute function private.set_updated_at();

alter table public.onboarding_state enable row level security;
revoke all on table public.onboarding_state from anon, authenticated;
grant select on table public.onboarding_state to authenticated;
grant update (step, data) on table public.onboarding_state to authenticated;
create policy onboarding_state_read_own on public.onboarding_state
  for select to authenticated using (user_id = (select auth.uid()));
create policy onboarding_state_update_own on public.onboarding_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function private.complete_onboarding()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ready boolean;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select p.username is not null and p.university_id is not null
         and p.department is not null and p.graduation_year is not null
    into v_ready
    from public.profiles p where p.user_id = v_user;

  if not coalesce(v_ready, false) then
    return false;
  end if;

  update public.profiles set onboarding_complete = true where user_id = v_user and not onboarding_complete;
  update public.onboarding_state set step = 6, completed_at = coalesce(completed_at, now()) where user_id = v_user;
  return true;
end;
$$;
revoke all on function private.complete_onboarding() from public;
grant execute on function private.complete_onboarding() to authenticated;

create function public.complete_onboarding()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.complete_onboarding();
$$;
revoke all on function public.complete_onboarding() from public, anon, authenticated;
grant execute on function public.complete_onboarding() to authenticated;

-- "Not your university?": pick among the universities that own your email domain,
-- until onboarding is complete.
create function private.set_my_university(p_university_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_domain text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select private.email_domain(u.email) into v_domain from auth.users u where u.id = v_user;
  if p_university_id is null or not private.domain_admits_students(v_domain, p_university_id) then
    return false;
  end if;
  update public.profiles
     set university_id = p_university_id
   where user_id = v_user and not onboarding_complete;
  return found;
end;
$$;
revoke all on function private.set_my_university(uuid) from public;
grant execute on function private.set_my_university(uuid) to authenticated;

create function public.set_my_university(p_university_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_my_university(p_university_id);
$$;
revoke all on function public.set_my_university(uuid) from public, anon, authenticated;
grant execute on function public.set_my_university(uuid) to authenticated;

-- Live username check (onboarding step 2). Signed-in only and rate limited, since it
-- reveals whether a username is taken.
create function private.username_available(p_username text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := lower(btrim(p_username));
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_name is null or v_name !~ '^[a-z0-9_]{3,30}$' or v_name = any (private.reserved_usernames()) then
    return false;
  end if;
  if not private.rate_limit('username_check:' || v_user::text, 120, interval '1 hour') then
    raise exception 'too many username checks' using errcode = '54000';
  end if;
  return not exists (select 1 from public.profiles p where p.username = v_name and p.user_id <> v_user);
end;
$$;
revoke all on function private.username_available(text) from public;
grant execute on function private.username_available(text) to authenticated;

create function public.username_available(p_username text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.username_available(p_username);
$$;
revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Gate state for proxy.ts and /auth/callback: one round trip per request.
-- ---------------------------------------------------------------------------
create function private.email_domain_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
      join public.profiles p on p.user_id = u.id
     where u.id = (select auth.uid())
       and private.domain_admits_students(private.email_domain(u.email), p.university_id)
  );
$$;
revoke all on function private.email_domain_allowed() from public;
grant execute on function private.email_domain_allowed() to authenticated;

create function public.my_gate_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'has_profile', p.user_id is not null,
    'role', p.role,
    'university_id', p.university_id,
    'username', p.username,
    'onboarding_complete', coalesce(p.onboarding_complete, false),
    'onboarding_step', coalesce(o.step, 1),
    'agreement_version', v.version,
    'agreement_accepted', v.version is null or exists (
      select 1 from public.agreement_acceptances a
       where a.user_id = (select auth.uid()) and a.version = v.version
    ),
    'email_allowed', private.email_domain_allowed()
  )
  from (select private.current_agreement_version() as version) v
  left join public.profiles p on p.user_id = (select auth.uid())
  left join public.onboarding_state o on o.user_id = (select auth.uid());
$$;
revoke all on function public.my_gate_state() from public, anon, authenticated;
grant execute on function public.my_gate_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Signup gate: Auth hook before-user-created + handle_new_user() (PRD 5.2, 5.27)
-- ---------------------------------------------------------------------------

-- Returns null when the email may create an account with this role, else the message to show.
create function private.validate_signup(p_email text, p_role public.account_role, p_university_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_domain text := private.email_domain(p_email);
begin
  if v_domain is null then
    return 'Enter a valid email address.';
  end if;
  -- Phase 1 opens student signup only; faculty (phase 7), recruiters (phase 8) and
  -- university admins (phase 9) get their own checks when their flows exist.
  if p_role is distinct from 'student' then
    return 'This kind of account can''t sign up here yet.';
  end if;
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    return 'Use your university email.';
  end if;
  if not private.domain_admits_students(v_domain, null) then
    return 'Your university isn''t on Skilient yet.';
  end if;
  if p_university_id is not null and not private.domain_admits_students(v_domain, p_university_id) then
    return 'That university doesn''t use this email domain.';
  end if;
  return null;
end;
$$;
revoke all on function private.validate_signup(text, public.account_role, uuid) from public;
grant execute on function private.validate_signup(text, public.account_role, uuid) to supabase_auth_admin, service_role;

-- Configured as the before-user-created Auth hook (config.toml locally; dashboard on the
-- hosted project). Runs for email signups, OAuth (Google) and admin-created users.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user jsonb := event -> 'user';
  v_provider text := coalesce(v_user -> 'app_metadata' ->> 'provider', 'email');
  v_meta jsonb := coalesce(v_user -> 'user_metadata', '{}'::jsonb);
  v_role public.account_role := 'student';
  v_university uuid;
  v_error text;
begin
  -- Only email signups carry our own metadata; OAuth metadata is the provider's profile.
  if v_provider = 'email' then
    begin
      v_role := coalesce(nullif(v_meta ->> 'role', ''), 'student')::public.account_role;
      v_university := nullif(v_meta ->> 'university_id', '')::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 400, 'message', 'Start again from the Skilient signup page.'));
    end;
  end if;

  v_error := private.validate_signup(v_user ->> 'email', v_role, v_university);
  if v_error is not null then
    if v_provider <> 'email' then
      v_error := 'Use your university Google account.';
    end if;
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', v_error));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Creates the profile, onboarding state, signup-time agreement acceptance and signup event.
-- Refuses non-university domains itself too, so an unconfigured hook can't let one through.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_domain text := private.email_domain(new.email);
  v_owners uuid[];
  v_university uuid;
  v_version integer;
begin
  select array_agg(distinct d.university_id) into v_owners
    from public.university_domains d
   where d.domain = v_domain and d.kind in ('student', 'both');

  if v_owners is null then
    raise exception 'signup refused: % is not a university email domain', coalesce(v_domain, '(none)')
      using errcode = '42501';
  end if;

  if v_provider = 'email' and (v_meta ->> 'university_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    v_university := (v_meta ->> 'university_id')::uuid;
    if not (v_university = any (v_owners)) then
      v_university := null;
    end if;
  end if;
  if v_university is null and cardinality(v_owners) = 1 then
    v_university := v_owners[1];
  end if;

  insert into public.profiles (user_id, role, university_id, full_name)
  values (
    new.id,
    'student',
    v_university,
    left(coalesce(
      nullif(btrim(v_meta ->> 'full_name'), ''),
      nullif(btrim(v_meta ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ), 60)
  );

  insert into public.onboarding_state (user_id, role) values (new.id, 'student');

  v_version := private.current_agreement_version();
  if v_version is not null and v_provider = 'email' and (v_meta ->> 'agreement_version') = v_version::text then
    insert into public.agreement_acceptances (user_id, version) values (new.id, v_version);
  end if;

  insert into public.security_events (user_id, kind, meta)
  values (new.id, 'signup', jsonb_build_object('provider', v_provider));

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Every student account stays tied to an email of its own university (PRD 5.27): an email
-- change (requested or confirmed) to any other domain is refused.
create function private.guard_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university uuid;
begin
  select p.university_id into v_university
    from public.profiles p
   where p.user_id = new.id and p.role in ('student', 'faculty');
  if not found then
    return new;
  end if;

  if coalesce(new.email_change, '') <> ''
     and new.email_change is distinct from old.email_change
     and not private.domain_admits_students(private.email_domain(new.email_change), v_university) then
    raise exception 'a student account must keep an email at its university' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and new.email is not null
     and not private.domain_admits_students(private.email_domain(new.email), v_university) then
    raise exception 'a student account must keep an email at its university' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function private.guard_email_change() from public;

create trigger on_auth_user_email_change
before update of email, email_change on auth.users
for each row execute function private.guard_email_change();

-- ---------------------------------------------------------------------------
-- Profile images (PRD 5.4): public-read buckets, written only as re-encoded WebP by the
-- app's image route, into the uploader's own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/webp']),
  ('covers', 'covers', true, 8388608, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy profile_images_select_own on storage.objects
  for select to authenticated
  using (bucket_id in ('avatars', 'covers') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'covers') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_images_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'covers') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Retention (PRD 10): throttling rows after a day, security events after a year.
-- ---------------------------------------------------------------------------
create function private.purge_security_data()
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
    delete from private.auth_lockouts where locked_until < now();
    get diagnostics v_n = row_count; v_rows := v_rows + v_n;
    delete from private.security_alert_tokens where expires_at < now() - interval '1 day';
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
revoke all on function private.purge_security_data() from public;

select cron.schedule('purge-security-data', '23 3 * * *', 'select private.purge_security_data()');
