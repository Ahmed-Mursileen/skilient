-- Phase 8, slice 1: recruiter accounts, organisations, verification, members and invites,
-- company blocks, and the plan stub (PRD 5.20, decisions.md 2026-10-03 "phase 8").
--
-- Recruiters sign up with a company email (never a webmail or university domain), set up
-- two-factor, then create their organisation at /org/join. Skilient accounts staff verify it.
-- Every function here checks who is asking; public wrappers are generated at the end of the file.
-- Billing is phase 10: `private.org_entitled` and `private.consume_quota` are a fail-closed stub
-- (unknown key = denied) that phase 10 replaces with the registry.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.org_status as enum ('pending', 'verified', 'suspended', 'rejected');
create type public.org_role as enum ('admin', 'recruiter', 'billing');

-- ---------------------------------------------------------------------------
-- Plan stub: limits and entitlements (server-side only; phase 10 replaces the bodies)
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason) values
  ('org.trial_limits', 1, '{"seats": 3, "contact.credits": 5, "jobs.active_posts": 1}',
   'Phase 8 stub: what a verified organisation may use until the phase 10 plans exist; unknown keys are denied'),
  ('recruit.limits', 1,
   '{"contact_expiry_days": 14, "decline_cooloff_days": 90, "daily_contacts": 50, "min_message": 50, "max_message": 1000, "spam_decline_rate": 0.8, "spam_min_requests": 10, "invite_days": 7}',
   'PRD 5.20 launch values for contact requests and invites');

create function private.org_limit(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when jsonb_typeof(private.config('org.trial_limits') -> p_key) = 'number'
              then (private.config('org.trial_limits') ->> p_key)::integer end;
$$;
revoke all on function private.org_limit(text) from public;

create function private.recruit_limit(p_key text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (private.config('recruit.limits') ->> p_key)::numeric;
$$;
revoke all on function private.recruit_limit(text) from public;

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  domain text not null unique check (domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'),
  website text not null check (website ~ '^https://[^[:space:]]+$' and char_length(website) <= 200),
  industry text not null check (char_length(btrim(industry)) between 2 and 60),
  size text not null check (size in ('1-10', '11-50', '51-200', '201-1000', '1000+')),
  city text not null check (char_length(btrim(city)) between 2 and 60),
  about text check (about is null or char_length(about) <= 1500),
  locations text[] not null default '{}' check (cardinality(locations) <= 10),
  linkedin_url text check (linkedin_url is null or (linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/[^[:space:]]+$' and char_length(linkedin_url) <= 200)),
  registration_number text check (registration_number is null or char_length(registration_number) <= 60),
  signer_role text not null check (char_length(btrim(signer_role)) between 2 and 60),
  status public.org_status not null default 'pending',
  status_reason text check (status_reason is null or char_length(status_reason) <= 2000),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is
  'Recruiting organisations (PRD 5.20). Read and written only through functions; status changes are staff-only and audited.';
create index organizations_status_idx on public.organizations (status, created_at);
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.org_role not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
comment on table public.org_members is 'One organisation per recruiter account (PRD 5.20 roles: admin, recruiter, billing).';
create index org_members_user_idx on public.org_members (user_id);

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role public.org_role not null,
  -- SHA-256 of the 32-byte token in the email link; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.org_invites is 'Teammate invites: same company domain, 7 days, single use, token hash only.';
create index org_invites_org_idx on public.org_invites (org_id, created_at desc);
create index org_invites_email_idx on public.org_invites (email) where used_at is null and revoked_at is null;

create table public.org_quota_usage (
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  period date not null,
  used integer not null default 0 check (used >= 0),
  primary key (org_id, key, period)
);
comment on table public.org_quota_usage is 'Monthly quota counters behind private.consume_quota (phase 10 replaces the limits, not this table).';

create table public.company_blocks (
  student_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, org_id)
);
comment on table public.company_blocks is 'A student hides themselves from every seat of a company (PRD 5.20).';
create index company_blocks_org_idx on public.company_blocks (org_id);

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.org_quota_usage enable row level security;
alter table public.company_blocks enable row level security;
revoke all on table public.organizations, public.org_members, public.org_invites, public.org_quota_usage,
  public.company_blocks from anon, authenticated;
-- Default deny: every read and write goes through the functions below.

-- An organisation entitlement is true only for a verified organisation named under the key in
-- platform_config 'entitlements.test_grants' ({key: [org ids]}). Unknown keys are false.
create function private.org_entitled(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org is not null
     and p_key = any (array['talent.full_profile', 'saved_searches', 'analytics', 'competitions.create', 'api.access'])
     and exists (select 1 from public.organizations o where o.id = p_org and o.status = 'verified')
     and coalesce((private.config('entitlements.test_grants') -> p_key) ? p_org::text, false);
$$;
revoke all on function private.org_entitled(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Checks used by every recruiter function
-- ---------------------------------------------------------------------------
create function private.is_recruiter_domain(p_domain text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_domain is not null
     and not exists (select 1 from public.personal_email_domains d where d.domain = p_domain)
     and not exists (select 1 from public.university_domains d where d.domain = p_domain);
$$;
revoke all on function private.is_recruiter_domain(text) from public;

-- The caller's organisation id when they are an active member with one of the roles (and, by
-- default, the organisation is verified). Two-factor is enforced here as well as at the route:
-- a recruiter session without it can't read or change anything.
create function private.require_org(p_roles public.org_role[] default array['admin', 'recruiter']::public.org_role[],
                                    p_need_verified boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_org uuid;
  v_status public.org_status;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'turn on two-factor sign-in to use the recruiter portal' using errcode = '42501';
  end if;
  select m.org_id, o.status into v_org, v_status
    from public.org_members m
    join public.organizations o on o.id = m.org_id
    join public.profiles p on p.user_id = m.user_id and p.role = 'recruiter'
   where m.user_id = v_me and m.status = 'active' and m.role = any (p_roles);
  if v_org is null then
    raise exception 'you don''t have access to this organisation area' using errcode = '42501';
  end if;
  if p_need_verified and v_status <> 'verified' then
    raise exception 'your organisation isn''t verified yet' using errcode = '42501';
  end if;
  return v_org;
end;
$$;
revoke all on function private.require_org(public.org_role[], boolean) from public;

create function private.consume_quota(p_org uuid, p_key text, p_amount integer default 1)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := private.org_limit(p_key);
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  if v_limit is null then
    raise exception 'this isn''t included in your plan' using errcode = '55000';
  end if;
  insert into public.org_quota_usage as q (org_id, key, period, used)
  values (p_org, p_key, v_period, p_amount)
  on conflict (org_id, key, period) do update set used = q.used + p_amount
    where q.used + p_amount <= v_limit
  returning q.used into v_used;
  if v_used is null then
    raise exception 'you''ve used this month''s allowance' using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.consume_quota(uuid, text, integer) from public;

-- ---------------------------------------------------------------------------
-- Signup: recruiter accounts
-- ---------------------------------------------------------------------------
create or replace function private.validate_signup(p_email text, p_role public.account_role, p_university_id uuid default null)
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
  if p_role = 'recruiter' then
    if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
      return 'Use your work email.';
    end if;
    if exists (select 1 from public.university_domains d where d.domain = v_domain) then
      return 'Use your company email, not a university one.';
    end if;
    return null;
  end if;
  -- University admins (phase 9) get their own checks when their flow exists.
  if p_role not in ('student', 'faculty') then
    return 'This kind of account can''t sign up here yet.';
  end if;
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    return 'Use your university email.';
  end if;
  if p_role = 'faculty' then
    if not private.domain_admits_faculty(v_domain, null) then
      return 'Your university isn''t on Skilient yet.';
    end if;
    if p_university_id is not null and not private.domain_admits_faculty(v_domain, p_university_id) then
      return 'That university doesn''t use this email domain.';
    end if;
    return null;
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

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_domain text := private.email_domain(new.email);
  v_role public.account_role := 'student';
  v_owners uuid[];
  v_university uuid;
  v_version integer;
begin
  -- Only email signups carry our own metadata, and only student, faculty and recruiter can be asked for.
  if v_provider = 'email' and (v_meta ->> 'role') in ('faculty', 'recruiter') then
    v_role := (v_meta ->> 'role')::public.account_role;
  end if;

  if v_role = 'recruiter' then
    if not private.is_recruiter_domain(v_domain) then
      raise exception 'signup refused: % is not a company email domain', coalesce(v_domain, '(none)')
        using errcode = '42501';
    end if;
    -- Recruiters have no university, no student onboarding and no visible profile: they are
    -- hidden from everyone but themselves (friends-only, and nobody is their friend).
    insert into public.profiles (user_id, role, university_id, full_name, onboarding_complete, visibility)
    values (new.id, 'recruiter', null,
            left(coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1)), 60),
            true, 'friends');
    insert into public.onboarding_state (user_id, role, step, completed_at) values (new.id, 'recruiter', 6, now());
  else
    select array_agg(distinct d.university_id) into v_owners
      from public.university_domains d
     where d.domain = v_domain
       and (case when v_role = 'faculty' then d.kind in ('faculty', 'both') else d.kind in ('student', 'both') end);

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

    -- Faculty have no student onboarding: their home is the teacher portal.
    insert into public.profiles (user_id, role, university_id, full_name, onboarding_complete)
    values (
      new.id,
      v_role,
      v_university,
      left(coalesce(
        nullif(btrim(v_meta ->> 'full_name'), ''),
        nullif(btrim(v_meta ->> 'name'), ''),
        split_part(new.email, '@', 1)
      ), 60),
      v_role = 'faculty' and v_university is not null
    );

    insert into public.onboarding_state (user_id, role, step, completed_at)
    values (new.id, v_role, case when v_role = 'faculty' then 6 else 1 end,
            case when v_role = 'faculty' and v_university is not null then now() end);
  end if;

  v_version := private.current_agreement_version();
  if v_version is not null and v_provider = 'email' and (v_meta ->> 'agreement_version') = v_version::text then
    insert into public.agreement_acceptances (user_id, version) values (new.id, v_version);
  end if;

  insert into public.security_events (user_id, kind, meta)
  values (new.id, 'signup', jsonb_build_object('provider', v_provider, 'role', v_role));

  return new;
end;
$$;

-- The gate's "is this email still allowed" check: a recruiter needs a company domain, and once
-- in an organisation, that organisation's domain.
create or replace function private.email_domain_allowed()
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
       and (case p.role
              when 'faculty' then private.domain_admits_faculty(private.email_domain(u.email), p.university_id)
              when 'recruiter' then private.is_recruiter_domain(private.email_domain(u.email))
                and coalesce((select o.domain = private.email_domain(u.email)
                                from public.org_members m join public.organizations o on o.id = m.org_id
                               where m.user_id = u.id), true)
              else private.domain_admits_students(private.email_domain(u.email), p.university_id) end)
  );
$$;

create or replace function private.guard_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university uuid;
  v_role public.account_role;
  v_org_domain text;
begin
  select p.university_id, p.role into v_university, v_role
    from public.profiles p
   where p.user_id = new.id and p.role in ('student', 'faculty', 'recruiter');
  if not found then
    return new;
  end if;

  if v_role = 'recruiter' then
    select o.domain into v_org_domain
      from public.org_members m join public.organizations o on o.id = m.org_id where m.user_id = new.id;
    if (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change
        and not (private.is_recruiter_domain(private.email_domain(new.email_change))
                 and coalesce(private.email_domain(new.email_change) = v_org_domain, true)))
       or (new.email is distinct from old.email and new.email is not null
           and not (private.is_recruiter_domain(private.email_domain(new.email))
                    and coalesce(private.email_domain(new.email) = v_org_domain, true))) then
      raise exception 'a recruiter account must keep an email at its company' using errcode = '42501';
    end if;
    return new;
  end if;

  if coalesce(new.email_change, '') <> ''
     and new.email_change is distinct from old.email_change
     and not (case when v_role = 'faculty' then private.domain_admits_faculty(private.email_domain(new.email_change), v_university)
                   else private.domain_admits_students(private.email_domain(new.email_change), v_university) end) then
    raise exception 'a university account must keep an email at its university' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and new.email is not null
     and not (case when v_role = 'faculty' then private.domain_admits_faculty(private.email_domain(new.email), v_university)
                   else private.domain_admits_students(private.email_domain(new.email), v_university) end) then
    raise exception 'a university account must keep an email at its university' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- Contact requests and application updates are in-app plus the daily digest; a student may
-- switch either to an instant email in settings (decisions.md 2026-10-03, Ahmed).
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('contact_requests', 'Recruiter contact requests', 'A company asks to talk to you about a role.', 20, 'digest', true),
  ('job_updates', 'Job applications', 'Where your applications stand, and hires you were part of.', 21, 'digest', true),
  ('recruiting', 'Recruiting', 'Organisation decisions, answers to your requests and hiring tasks.', 22, 'digest', true);
insert into public.notification_types (type, category, emailed) values
  ('org_decided', 'recruiting', true),
  ('org_member_joined', 'recruiting', false);

-- ---------------------------------------------------------------------------
-- Creating and editing the organisation
-- ---------------------------------------------------------------------------
create function private.slugify(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), 50);
$$;
revoke all on function private.slugify(text) from public;

create function private.host_of(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(substring(p_url from '^https://([^/:?#]+)')), '^www\.', '');
$$;
revoke all on function private.host_of(text) from public;

create function private.create_organization(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_email text;
  v_domain text;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_website text := btrim(coalesce(p ->> 'website', ''));
  v_host text;
  v_slug text;
  v_base text;
  v_n integer := 1;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'turn on two-factor sign-in before you set up your organisation' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles pr where pr.user_id = v_me and pr.role = 'recruiter') then
    raise exception 'only recruiter accounts set up organisations' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_me) then
    raise exception 'you already belong to an organisation' using errcode = '55000';
  end if;
  if not private.rate_limit('org_create:' || v_me::text, 5, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_me;
  v_domain := private.email_domain(v_email);
  if not private.is_recruiter_domain(v_domain) then
    raise exception 'use your company email address' using errcode = '42501';
  end if;
  if exists (select 1 from public.organizations o where o.domain = v_domain) then
    raise exception 'this company domain already has an organisation; ask its admin to invite you' using errcode = '23505';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'enter the company name' using errcode = '22023';
  end if;
  if v_website !~ '^https://[^[:space:]]+$' or char_length(v_website) > 200 then
    raise exception 'enter the company website starting with https://' using errcode = '22023';
  end if;
  v_host := private.host_of(v_website);
  if v_host is null or not (v_host = v_domain or v_host like '%.' || v_domain or v_domain like '%.' || v_host) then
    raise exception 'the website must match your work email domain (%)', v_domain using errcode = '22023';
  end if;
  if coalesce(p ->> 'size', '') not in ('1-10', '11-50', '51-200', '201-1000', '1000+') then
    raise exception 'pick the company size' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'industry', ''))) not between 2 and 60
     or char_length(btrim(coalesce(p ->> 'city', ''))) not between 2 and 60
     or char_length(btrim(coalesce(p ->> 'signer_role', ''))) not between 2 and 60 then
    raise exception 'enter the industry, city and your role at the company' using errcode = '22023';
  end if;

  v_base := nullif(private.slugify(v_name), '');
  if v_base is null or char_length(v_base) < 3 then
    v_base := 'company-' || substr(md5(v_domain), 1, 6);
  end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(v_base, 50) || '-' || v_n;
  end loop;

  insert into public.organizations (slug, name, domain, website, industry, size, city, locations, linkedin_url,
                                    registration_number, signer_role, created_by)
  values (v_slug, v_name, v_domain, v_website, btrim(p ->> 'industry'), p ->> 'size', btrim(p ->> 'city'),
          array[btrim(p ->> 'city')], nullif(btrim(coalesce(p ->> 'linkedin_url', '')), ''),
          nullif(btrim(coalesce(p ->> 'registration_number', '')), ''), btrim(p ->> 'signer_role'), v_me)
  returning id into v_id;
  insert into public.org_members (org_id, user_id, role) values (v_id, v_me, 'admin');
  return v_id;
end;
$$;

-- What the recruiter's layout needs: their organisation and role, or null.
create function private.my_org()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
             'id', o.id, 'slug', o.slug, 'name', o.name, 'domain', o.domain, 'status', o.status,
             'status_reason', o.status_reason, 'role', m.role, 'member_status', m.status,
             'website', o.website, 'industry', o.industry, 'size', o.size, 'city', o.city,
             'about', o.about, 'locations', to_jsonb(o.locations), 'linkedin_url', o.linkedin_url)
      from public.org_members m
      join public.organizations o on o.id = m.org_id
     where m.user_id = v_me);
end;
$$;

create function private.update_company_page(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
  v_about text := nullif(btrim(coalesce(p ->> 'about', '')), '');
  v_locations text[];
  v_linkedin text := nullif(btrim(coalesce(p ->> 'linkedin_url', '')), '');
begin
  if v_about is not null and char_length(v_about) > 1500 then
    raise exception 'keep the about text under 1,500 characters' using errcode = '22023';
  end if;
  select coalesce(array_agg(l), '{}') into v_locations
    from (select btrim(x) as l from jsonb_array_elements_text(coalesce(p -> 'locations', '[]'::jsonb)) x
           where char_length(btrim(x)) between 2 and 60 limit 10) s;
  if v_linkedin is not null and v_linkedin !~ '^https://([a-z]{2,3}\.)?linkedin\.com/[^[:space:]]+$' then
    raise exception 'enter a LinkedIn page address starting with https://www.linkedin.com/' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'industry', ''))) not between 2 and 60
     or coalesce(p ->> 'size', '') not in ('1-10', '11-50', '51-200', '201-1000', '1000+') then
    raise exception 'enter the industry and company size' using errcode = '22023';
  end if;
  update public.organizations
     set about = v_about, locations = v_locations, linkedin_url = v_linkedin,
         industry = btrim(p ->> 'industry'), size = p ->> 'size'
   where id = v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members and invites
-- ---------------------------------------------------------------------------
create function private.org_seat_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.org_members m where m.org_id = p_org and m.status = 'active')::integer
       + (select count(*) from public.org_invites i
           where i.org_id = p_org and i.used_at is null and i.revoked_at is null and i.expires_at > now())::integer;
$$;
revoke all on function private.org_seat_count(uuid) from public;

create function private.org_members_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
begin
  return jsonb_build_object(
    'seats_limit', private.org_limit('seats'),
    'seats_used', private.org_seat_count(v_org),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name, 'email', u.email, 'role', m.role,
                                          'status', m.status, 'joined_at', m.created_at) order by m.created_at)
        from public.org_members m
        join public.profiles p on p.user_id = m.user_id
        join auth.users u on u.id = m.user_id
       where m.org_id = v_org), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'expires_at', i.expires_at,
                                          'state', case when i.used_at is not null then 'accepted'
                                                        when i.revoked_at is not null then 'revoked'
                                                        when i.expires_at <= now() then 'expired' else 'pending' end)
                       order by i.created_at desc)
        from (select * from public.org_invites where org_id = v_org order by created_at desc limit 50) i), '[]'::jsonb));
end;
$$;

create function private.invite_org_member(p_email text, p_role public.org_role, p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
  v_me uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_domain text := private.email_domain(v_email);
  v_org_domain text;
  v_limit integer := private.org_limit('seats');
  v_id uuid;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'enter a valid email address' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invite' using errcode = '22023';
  end if;
  select o.domain into v_org_domain from public.organizations o where o.id = v_org;
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    raise exception 'invite a work email address, not a personal one' using errcode = '22023';
  end if;
  if v_domain is distinct from v_org_domain then
    raise exception 'teammates must use an @% email address', v_org_domain using errcode = '22023';
  end if;
  if not private.rate_limit('org_invite:' || v_me::text, 30, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('org-seats:' || v_org::text, 0));
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id
              where m.org_id = v_org and lower(u.email) = v_email and m.status = 'active') then
    raise exception 'that person is already on your team' using errcode = '23505';
  end if;
  if v_limit is null or private.org_seat_count(v_org) >= v_limit then
    raise exception 'your plan has no free seats' using errcode = '55000';
  end if;
  update public.org_invites set revoked_at = now()
   where org_id = v_org and email = v_email and used_at is null and revoked_at is null;
  insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
  values (v_org, v_email, p_role, p_token_hash, v_me,
          now() + make_interval(days => private.recruit_limit('invite_days')::integer))
  returning id into v_id;
  return v_id;
end;
$$;

create function private.revoke_org_invite(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
begin
  update public.org_invites set revoked_at = now()
   where id = p_id and org_id = v_org and used_at is null and revoked_at is null;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Anyone holding the link (even signed out) can see who invited them and to what; nothing else.
create function private.org_invite_preview(p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('org_name', o.name, 'email', i.email, 'role', i.role)
    from public.org_invites i
    join public.organizations o on o.id = i.org_id
   where i.token_hash = p_token_hash and i.used_at is null and i.revoked_at is null and i.expires_at > now();
$$;
revoke all on function private.org_invite_preview(text) from public;

-- Invites waiting for the signed-in recruiter's exact email address.
create function private.my_org_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'org_name', o.name, 'role', i.role, 'expires_at', i.expires_at)
                     order by i.created_at desc)
      from public.org_invites i
      join public.organizations o on o.id = i.org_id
      join auth.users u on u.id = v_me and lower(u.email) = i.email
     where i.used_at is null and i.revoked_at is null and i.expires_at > now()
       and exists (select 1 from public.profiles pr where pr.user_id = v_me and pr.role = 'recruiter')), '[]'::jsonb);
end;
$$;

create function private.accept_org_invite(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_email text;
  i public.org_invites;
  v_domain text;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'turn on two-factor sign-in before you join an organisation' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles pr where pr.user_id = v_me and pr.role = 'recruiter') then
    raise exception 'only recruiter accounts join organisations' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_me;
  select * into i from public.org_invites where id = p_id for update;
  if not found or i.email <> v_email then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if i.used_at is not null or i.revoked_at is not null or i.expires_at <= now() then
    raise exception 'this invite has expired or was already used' using errcode = '55000';
  end if;
  select o.domain into v_domain from public.organizations o where o.id = i.org_id and o.status <> 'rejected';
  if v_domain is distinct from private.email_domain(v_email) then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_me) then
    raise exception 'you already belong to an organisation' using errcode = '55000';
  end if;
  update public.org_invites set used_at = now() where id = i.id;
  insert into public.org_members (org_id, user_id, role, invited_by) values (i.org_id, v_me, i.role, i.invited_by);
  perform private.notify(i.invited_by, null, 'org_member_joined', 'organization', i.org_id, '{}'::jsonb);
  return i.org_id;
end;
$$;

create function private.set_org_member_role(p_user uuid, p_role public.org_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
begin
  perform pg_advisory_xact_lock(hashtextextended('org-admins:' || v_org::text, 0));
  if p_role <> 'admin' and not exists (
       select 1 from public.org_members m
        where m.org_id = v_org and m.role = 'admin' and m.status = 'active' and m.user_id <> p_user) then
    raise exception 'an organisation needs at least one admin' using errcode = '55000';
  end if;
  update public.org_members set role = p_role where org_id = v_org and user_id = p_user and status = 'active';
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.remove_org_member(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
begin
  perform pg_advisory_xact_lock(hashtextextended('org-admins:' || v_org::text, 0));
  if not exists (
       select 1 from public.org_members m
        where m.org_id = v_org and m.role = 'admin' and m.status = 'active' and m.user_id <> p_user) then
    raise exception 'an organisation needs at least one admin' using errcode = '55000';
  end if;
  -- The row stays (inactive) so shortlists, notes and hires keep their author; the seat frees up.
  update public.org_members set status = 'inactive' where org_id = v_org and user_id = p_user and status = 'active';
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
end;
$$;

-- The plan page: what the organisation may use and has used (phase 10 fills the real plans).
create function private.org_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin', 'recruiter', 'billing']::public.org_role[], false);
  v_period date := date_trunc('month', now())::date;
begin
  return jsonb_build_object(
    'seats_limit', private.org_limit('seats'),
    'seats_used', private.org_seat_count(v_org),
    'contact_credits_limit', private.org_limit('contact.credits'),
    'contact_credits_used', coalesce((select q.used from public.org_quota_usage q
                                       where q.org_id = v_org and q.key = 'contact.credits' and q.period = v_period), 0),
    'active_posts_limit', private.org_limit('jobs.active_posts'),
    'entitlements', jsonb_build_object(
      'talent.full_profile', private.org_entitled(v_org, 'talent.full_profile'),
      'saved_searches', private.org_entitled(v_org, 'saved_searches'),
      'analytics', private.org_entitled(v_org, 'analytics'),
      'competitions.create', private.org_entitled(v_org, 'competitions.create'),
      'api.access', private.org_entitled(v_org, 'api.access')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff verification (accounts staff, two-factor), audited
-- ---------------------------------------------------------------------------
create function private.ops_orgs(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  if p_status not in ('pending', 'verified', 'suspended', 'rejected') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'name', o.name, 'domain', o.domain, 'website', o.website, 'industry', o.industry,
             'size', o.size, 'city', o.city, 'status', o.status, 'created_at', o.created_at,
             'admin_name', (select p.full_name from public.org_members m join public.profiles p on p.user_id = m.user_id
                             where m.org_id = o.id and m.role = 'admin' order by m.created_at limit 1))
             order by o.created_at)
      from public.organizations o where o.status = p_status::public.org_status), '[]'::jsonb);
end;
$$;

create function private.ops_org_case(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform private.require_accounts();
  select jsonb_build_object(
           'id', o.id, 'name', o.name, 'slug', o.slug, 'domain', o.domain, 'website', o.website,
           'linkedin_url', o.linkedin_url, 'registration_number', o.registration_number, 'signer_role', o.signer_role,
           'industry', o.industry, 'size', o.size, 'city', o.city, 'status', o.status, 'status_reason', o.status_reason,
           'created_at', o.created_at, 'verified_at', o.verified_at,
           'members', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'email', u.email, 'role', m.role, 'status', m.status))
                                  from public.org_members m
                                  join public.profiles p on p.user_id = m.user_id
                                  join auth.users u on u.id = m.user_id
                                 where m.org_id = o.id), '[]'::jsonb),
           'history', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'at', a.created_at) order by a.created_at desc)
                                  from public.ops_audit_log a where a.target_type = 'organization' and a.target_id = o.id::text), '[]'::jsonb))
    into v_row
    from public.organizations o where o.id = p_org;
  if v_row is null then
    raise exception 'organisation not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- action: verify | reject | suspend | reinstate
create function private.decide_org(p_org uuid, p_action text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  o public.organizations;
  v_to public.org_status;
  v_reason text := btrim(coalesce(p_reason, ''));
  r record;
begin
  select * into o from public.organizations where id = p_org for update;
  if not found then
    raise exception 'organisation not found' using errcode = 'P0002';
  end if;
  v_to := case p_action
            when 'verify' then 'verified'
            when 'reject' then 'rejected'
            when 'suspend' then 'suspended'
            when 'reinstate' then 'verified'
            else null end;
  if v_to is null then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  if (p_action = 'verify' and o.status <> 'pending')
     or (p_action = 'reject' and o.status <> 'pending')
     or (p_action = 'suspend' and o.status <> 'verified')
     or (p_action = 'reinstate' and o.status <> 'suspended') then
    raise exception 'this organisation is % and can''t do that', o.status using errcode = '55000';
  end if;
  if p_action in ('reject', 'suspend') and char_length(v_reason) < 3 then
    raise exception 'give a reason the organisation can read' using errcode = '22023';
  end if;
  update public.organizations
     set status = v_to, status_reason = nullif(v_reason, ''),
         verified_by = case when v_to = 'verified' then v_me else verified_by end,
         verified_at = case when v_to = 'verified' then now() else verified_at end
   where id = p_org;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'org.' || p_action, 'organization', p_org::text, coalesce(nullif(v_reason, ''), p_action || ' organisation'),
          jsonb_build_object('status', o.status), jsonb_build_object('status', v_to));
  for r in select m.user_id from public.org_members m where m.org_id = p_org and m.status = 'active' loop
    perform private.notify(r.user_id, null, 'org_decided', 'organization', p_org,
                           jsonb_build_object('org_name', o.name, 'status', v_to, 'reason', nullif(v_reason, '')));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Student controls: block a company
-- ---------------------------------------------------------------------------
create function private.block_company(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not exists (select 1 from public.organizations o where o.id = p_org and o.status in ('verified', 'suspended')) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  insert into public.company_blocks (student_id, org_id) values (v_me, p_org) on conflict do nothing;
end;
$$;

create function private.unblock_company(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.company_blocks where student_id = v_me and org_id = p_org;
end;
$$;

create function private.my_blocked_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug) order by o.name)
      from public.company_blocks b join public.organizations o on o.id = b.org_id
     where b.student_id = v_me), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and public wrappers (security invoker), generated from one list
-- ---------------------------------------------------------------------------
create function pg_temp.expose(p_names text[])
returns void
language plpgsql
as $$
declare
  n text;
  r record;
  v_names text;
begin
  foreach n in array p_names loop
    select p.oid, p.proname, p.provolatile, p.proargnames,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident,
           pg_get_function_result(p.oid) as result
      into r
      from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = n;
    if r.oid is null then
      raise exception 'no private function %', n;
    end if;
    select coalesce(string_agg(a, ', ' order by ord), '') into v_names
      from unnest(coalesce(r.proargnames, '{}'::text[])) with ordinality as t(a, ord);
    execute format('revoke all on function private.%I(%s) from public', n, r.ident);
    execute format('grant execute on function private.%I(%s) to authenticated', n, r.ident);
    execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path = %L as $f$ select private.%I(%s) $f$',
                   n, r.args, r.result, case r.provolatile when 'v' then 'volatile' else 'stable' end, '', n, v_names);
    execute format('revoke all on function public.%I(%s) from public, anon', n, r.ident);
    execute format('grant execute on function public.%I(%s) to authenticated', n, r.ident);
  end loop;
end;
$$;

select pg_temp.expose(array[
  'create_organization', 'my_org', 'update_company_page',
  'org_members_list', 'invite_org_member', 'revoke_org_invite', 'my_org_invites', 'accept_org_invite',
  'set_org_member_role', 'remove_org_member', 'org_plan',
  'ops_orgs', 'ops_org_case', 'decide_org',
  'block_company', 'unblock_company', 'my_blocked_companies'
]);

-- The invite preview is for people who aren't signed in yet (the link in the email).
grant execute on function private.org_invite_preview(text) to anon, authenticated;
create function public.org_invite_preview(p_token_hash text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.org_invite_preview(p_token_hash) $$;
revoke all on function public.org_invite_preview(text) from public;
grant execute on function public.org_invite_preview(text) to anon, authenticated;

drop function pg_temp.expose(text[]);
