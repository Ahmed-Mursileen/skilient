-- Phase 9, part 1: university portal core (PRD 5.22, 5.23; decisions.md 2026-10-04 "phase 9").
--
-- University admins (owner | admin | career | coordinator | comms), the claim flow verified by
-- Skilient accounts staff, admin invites with seats, extra email domains, departments and
-- programmes, and the plan stub. Billing is phase 10: `private.uni_plan` is a fail-closed stub
-- (free unless the university is claimed and listed in `platform_config` `uni.test_plans`, SQL only)
-- and `private.uni_entitled` / `private.uni_limit` answer only for known keys.
-- Two-factor is required here as well as at the route: `private.require_uni` reads the session's aal.
-- Admin actions are written to `university_audit_log` (staff actions keep using ops_audit_log).

-- ---------------------------------------------------------------------------
-- Types and config
-- ---------------------------------------------------------------------------
create type public.uni_admin_role as enum ('owner', 'admin', 'career', 'coordinator', 'comms');
create type public.uni_request_status as enum ('pending', 'approved', 'rejected');

insert into public.platform_config (key, version, value, reason) values
  ('uni.test_plans', 1, '{}',
   'Phase 9 stub: {university_id: basic|growth|campus}, set by SQL only, empty in production; phase 10 replaces it with licences');

alter table public.universities
  add column claimed_at timestamptz,
  add column owner_id uuid references auth.users (id) on delete set null,
  add column slug_changed_at timestamptz;
create index universities_owner_idx on public.universities (owner_id);

-- ---------------------------------------------------------------------------
-- Plan stub (server-side only; phase 10 replaces uni_plan with the subscription registry)
-- ---------------------------------------------------------------------------
create function private.uni_plan(p_university uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_university is not null
            and exists (select 1 from public.universities u where u.id = p_university and u.owner_id is not null)
            and (private.config('uni.test_plans') ->> p_university::text) in ('basic', 'growth', 'campus')
           then private.config('uni.test_plans') ->> p_university::text
           else 'free' end;
$$;
revoke all on function private.uni_plan(uuid) from public;

-- Known keys only: anything else is denied (fail-closed).
create function private.uni_entitled(p_university uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(case p_key
           when 'uni.dashboard' then private.uni_plan(p_university) in ('basic', 'growth', 'campus')
           when 'uni.dashboard_full' then private.uni_plan(p_university) in ('growth', 'campus')
           when 'uni.exports' then private.uni_plan(p_university) in ('growth', 'campus')
           when 'uni.student_records' then private.uni_plan(p_university) in ('growth', 'campus')
           when 'uni.skills_gap' then private.uni_plan(p_university) in ('growth', 'campus')
           when 'uni.outcomes' then private.uni_plan(p_university) in ('growth', 'campus')
           when 'uni.faculty_panel' then private.uni_plan(p_university) in ('growth', 'campus')
           when 'uni.benchmark' then private.uni_plan(p_university) = 'campus'
           when 'uni.accreditation' then private.uni_plan(p_university) = 'campus'
           else false end, false);
$$;
revoke all on function private.uni_entitled(uuid, text) from public;

-- Limits by level (free / Basic / Growth / Campus); null = not a known limit (denied).
create function private.uni_limit(p_university uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_key
           when 'uni.admin_seats' then case private.uni_plan(p_university) when 'basic' then 2 when 'growth' then 5 when 'campus' then 10 else 1 end
           when 'uni.hackathons' then case private.uni_plan(p_university) when 'growth' then 2 when 'campus' then 4 else 0 end
           when 'uni.job_fairs' then case private.uni_plan(p_university) when 'growth' then 1 when 'campus' then 2 else 0 end
           else null end;
$$;
revoke all on function private.uni_limit(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Universities: owner, claim time, slug changes; public email domains never allowed
-- ---------------------------------------------------------------------------

-- A webmail domain can never admit anyone as a university (decisions.md 2026-10-04, Ahmed).
create function private.refuse_public_university_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.personal_email_domains d where d.domain = new.domain) then
    raise exception 'a public email domain can''t be a university domain' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_public_university_domain() from public;
create trigger university_domains_not_public before insert or update of domain on public.university_domains
  for each row execute function private.refuse_public_university_domain();

-- ---------------------------------------------------------------------------
-- Departments and programmes (5.23 "Structure")
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);
comment on table public.departments is 'A university''s own departments; once it has any, its students pick from them. Written by functions.';
create unique index departments_name_idx on public.departments (university_id, lower(name));

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);
comment on table public.programmes is 'Programmes of a department (display and picker only; profiles keep programme as text).';
create unique index programmes_name_idx on public.programmes (department_id, lower(name));

alter table public.departments enable row level security;
alter table public.programmes enable row level security;
revoke all on table public.departments, public.programmes from anon, authenticated;
grant select on table public.departments, public.programmes to authenticated;
-- Department names are not private: any signed-in user may read the lists (pickers, filters).
create policy departments_read on public.departments for select to authenticated using (true);
create policy programmes_read on public.programmes for select to authenticated using (true);

-- profiles.department stays the text everything else filters on (leaderboards, Explore,
-- recruiter filters); department_id links it to the university's own list.
alter table public.profiles add column department_id uuid references public.departments (id) on delete set null;
create index profiles_department_id_idx on public.profiles (department_id);

-- Keeps department_id and the text in step: a picked id writes its name; a changed text links
-- to the university's department of that name (case-insensitive), or unlinks.
create function private.sync_profile_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.department_id is not null and (tg_op = 'INSERT' or new.department_id is distinct from old.department_id) then
    select d.name into new.department from public.departments d
     where d.id = new.department_id and d.university_id = new.university_id;
    if not found then
      new.department_id := null;
    end if;
  elsif tg_op = 'INSERT' or new.department is distinct from old.department or new.university_id is distinct from old.university_id then
    select d.id into new.department_id from public.departments d
     where d.university_id = new.university_id and lower(d.name) = lower(btrim(coalesce(new.department, '')));
  end if;
  return new;
end;
$$;
revoke all on function private.sync_profile_department() from public;
create trigger profiles_sync_department before insert or update of department, department_id, university_id on public.profiles
  for each row execute function private.sync_profile_department();

-- Adding or renaming a department links matching profiles; a rename rewrites their text.
create function private.department_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles p set department_id = new.id
     where p.university_id = new.university_id and p.department_id is null and lower(p.department) = lower(new.name);
  elsif new.name is distinct from old.name then
    update public.profiles p set department = new.name where p.department_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function private.department_changed() from public;
create trigger departments_changed after insert or update of name on public.departments
  for each row execute function private.department_changed();

-- Backfill (decisions.md 2026-10-04, Ahmed): link every profile whose text matches its
-- university's list. No university has a list at this migration, so this is for re-runs and
-- staging copies; the trigger above does the same for each department added later.
update public.profiles p set department_id = d.id
  from public.departments d
 where d.university_id = p.university_id and p.department_id is null and lower(d.name) = lower(p.department);

-- ---------------------------------------------------------------------------
-- University admins
-- ---------------------------------------------------------------------------
create table public.university_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete cascade,
  role public.uni_admin_role not null,
  department_id uuid references public.departments (id) on delete restrict,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((role = 'coordinator') = (department_id is not null))
);
comment on table public.university_admins is 'Who runs a university''s portal (PRD 5.23). One university per account. Written by functions only.';
create index university_admins_university_idx on public.university_admins (university_id, role);
create index university_admins_department_idx on public.university_admins (department_id);
create index university_admins_invited_by_idx on public.university_admins (invited_by);
create unique index university_admins_one_owner_idx on public.university_admins (university_id) where role = 'owner';

alter table public.university_admins enable row level security;
revoke all on table public.university_admins from anon, authenticated;
grant select on table public.university_admins to authenticated;
create policy university_admins_read_own on public.university_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- What admins did (invites, roles, structure, awards, hides, calendar). Staff keep ops_audit_log.
create table public.university_audit_log (
  id bigint generated always as identity primary key,
  university_id uuid not null references public.universities (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 40),
  target_id text check (target_id is null or char_length(target_id) <= 200),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.university_audit_log is 'University admin actions (PRD 5.23). Append-only; read by that university''s owner/admins and staff through functions.';
create index university_audit_log_uni_idx on public.university_audit_log (university_id, created_at desc);
create index university_audit_log_actor_idx on public.university_audit_log (actor_id);
alter table public.university_audit_log enable row level security;
revoke all on table public.university_audit_log from anon, authenticated;

create function private.uni_audit(p_university uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.university_audit_log (university_id, actor_id, action, target_type, target_id, detail)
  values (p_university, (select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function private.uni_audit(uuid, text, text, text, jsonb) from public;

-- The caller's admin row when they hold one of the roles. Two-factor is enforced here as well as
-- at the route: an admin session without it can read or change nothing.
create function private.require_uni(p_roles public.uni_admin_role[] default array['owner', 'admin']::public.uni_admin_role[])
returns public.university_admins
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  a public.university_admins;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'turn on two-factor sign-in to use the university portal' using errcode = '42501';
  end if;
  select ua.* into a
    from public.university_admins ua
    join public.profiles p on p.user_id = ua.user_id and p.role in ('university_admin', 'faculty')
                          and p.university_id = ua.university_id and p.status <> 'deleting'
   where ua.user_id = v_me;
  if a.user_id is null or not (a.role = any (p_roles)) then
    raise exception 'you don''t have access to this part of the university portal' using errcode = '42501';
  end if;
  return a;
end;
$$;
revoke all on function private.require_uni(public.uni_admin_role[]) from public;

-- Owner or admin of this university on a two-factor session. Phase 7's teacher approval, revoke
-- and CSV import call this. A department coordinator counts only inside uni_approve_teacher /
-- uni_revoke_teacher, which check the teacher's department first and set a transaction-local flag.
create or replace function private.is_uni_admin_of(p_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.university_admins ua
                  where ua.user_id = (select auth.uid()) and ua.university_id = p_university
                    and (ua.role in ('owner', 'admin')
                         or (ua.role = 'coordinator'
                             and coalesce(current_setting('skilient.coordinator_university', true), '') = p_university::text)));
$$;

-- ---------------------------------------------------------------------------
-- Claims (5.23 Onboarding): letter in a private bucket, verified by accounts staff
-- ---------------------------------------------------------------------------
create table public.university_claims (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 80),
  note text check (note is null or char_length(note) <= 1000),
  letter_path text not null check (letter_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$'),
  letter_bytes bigint not null check (letter_bytes between 1 and 5242880),
  status public.uni_request_status not null default 'pending',
  review_reason text check (review_reason is null or char_length(review_reason) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  letter_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null))
);
comment on table public.university_claims is 'Requests to own a university''s portal (PRD 5.23); letters deleted 90 days after the decision.';
create index university_claims_university_idx on public.university_claims (university_id, created_at desc);
create index university_claims_requester_idx on public.university_claims (requester_id);
create index university_claims_reviewed_by_idx on public.university_claims (reviewed_by);
create index university_claims_queue_idx on public.university_claims (status, created_at);
create unique index university_claims_one_open_idx on public.university_claims (university_id) where status = 'pending';

alter table public.university_claims enable row level security;
revoke all on table public.university_claims from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('university-claims', 'university-claims', false, 5242880, array['application/pdf', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- An upload into your own folder, by a university-admin account, a few at most.
create function private.claim_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$'
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'university_admin')
     and (select count(*) from storage.objects o
           where o.bucket_id = 'university-claims' and o.owner_id = (select auth.uid())::text) < 5;
$$;
revoke all on function private.claim_upload_allowed(text) from public;
grant execute on function private.claim_upload_allowed(text) to authenticated;

create policy university_claims_files_read on storage.objects for select to authenticated
  using (bucket_id = 'university-claims'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff('accounts'))));
create policy university_claims_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'university-claims' and private.claim_upload_allowed(name));

create or replace function private.queue_storage_cleanup(p_bucket text, p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.send('storage_cleanup', jsonb_build_object('bucket', p_bucket, 'path', p_path))
   where p_path is not null
     and p_bucket in ('post-media', 'chat-media', 'avatars', 'credentials', 'cv-exports', 'feedback',
                      'university-claims', 'university-media');
$$;

-- ---------------------------------------------------------------------------
-- Admin invites and domain / final-year requests
-- ---------------------------------------------------------------------------
create table public.university_admin_invites (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$' and char_length(email) <= 254),
  role public.uni_admin_role not null check (role <> 'owner'),
  department_id uuid references public.departments (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((role = 'coordinator') = (department_id is not null))
);
comment on table public.university_admin_invites is 'Invites to a university portal seat; only the SHA-256 of the token is stored.';
create index university_admin_invites_uni_idx on public.university_admin_invites (university_id, created_at desc);
create index university_admin_invites_email_idx on public.university_admin_invites (email);
create index university_admin_invites_department_idx on public.university_admin_invites (department_id);
create index university_admin_invites_invited_by_idx on public.university_admin_invites (invited_by);
alter table public.university_admin_invites enable row level security;
revoke all on table public.university_admin_invites from anon, authenticated;

create table public.university_domain_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  domain text not null check (
    char_length(domain) <= 253
    and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'),
  kind public.domain_kind not null default 'both',
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  requested_by uuid references auth.users (id) on delete set null,
  status public.uni_request_status not null default 'pending',
  review_reason text check (review_reason is null or char_length(review_reason) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.university_domain_requests is 'Extra email domains asked for by a university owner; approved by accounts staff.';
create index university_domain_requests_uni_idx on public.university_domain_requests (university_id, created_at desc);
create index university_domain_requests_queue_idx on public.university_domain_requests (status, created_at);
create index university_domain_requests_requested_by_idx on public.university_domain_requests (requested_by);
create index university_domain_requests_reviewed_by_idx on public.university_domain_requests (reviewed_by);
create unique index university_domain_requests_open_idx on public.university_domain_requests (domain) where status = 'pending';
alter table public.university_domain_requests enable row level security;
revoke all on table public.university_domain_requests from anon, authenticated;

-- final_year_batch also drives graduation (phase 6), so admins only ask; accounts staff apply it.
create table public.final_year_batch_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  batch_year smallint check (batch_year is null or batch_year between 2000 and 2100),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  requested_by uuid references auth.users (id) on delete set null,
  status public.uni_request_status not null default 'pending',
  review_reason text check (review_reason is null or char_length(review_reason) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.final_year_batch_requests is 'An owner asks staff to set or clear the final-year batch exception (decisions.md 2026-10-04).';
create index final_year_batch_requests_uni_idx on public.final_year_batch_requests (university_id, created_at desc);
create index final_year_batch_requests_queue_idx on public.final_year_batch_requests (status, created_at);
create index final_year_batch_requests_requested_by_idx on public.final_year_batch_requests (requested_by);
create index final_year_batch_requests_reviewed_by_idx on public.final_year_batch_requests (reviewed_by);
alter table public.final_year_batch_requests enable row level security;
revoke all on table public.final_year_batch_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('university', 'Your university', 'Announcements, events, awards and portal news from your university.', 23, 'digest', false);
insert into public.notification_types (type, category, emailed) values
  ('uni_claim_decided', 'university', true),
  ('uni_admin_joined', 'university', false),
  ('uni_domain_decided', 'university', false),
  ('uni_batch_decided', 'university', false);

-- ---------------------------------------------------------------------------
-- Signup: university-admin accounts (an email on a faculty or both domain of that university)
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
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    return 'Use your university email.';
  end if;
  -- University officials (phase 9) and faculty: a faculty or both domain of that university.
  if p_role in ('faculty', 'university_admin') then
    if not private.domain_admits_faculty(v_domain, null) then
      return 'Your university isn''t on Skilient yet.';
    end if;
    if p_university_id is not null and not private.domain_admits_faculty(v_domain, p_university_id) then
      return 'That university doesn''t use this email domain.';
    end if;
    return null;
  end if;
  if p_role <> 'student' then
    return 'This kind of account can''t sign up here yet.';
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
  -- Only email signups carry our own metadata.
  if v_provider = 'email' and (v_meta ->> 'role') in ('faculty', 'recruiter', 'university_admin') then
    v_role := (v_meta ->> 'role')::public.account_role;
  end if;

  if v_role = 'recruiter' then
    if not private.is_recruiter_domain(v_domain) then
      raise exception 'signup refused: % is not a company email domain', coalesce(v_domain, '(none)')
        using errcode = '42501';
    end if;
    insert into public.profiles (user_id, role, university_id, full_name, onboarding_complete, visibility)
    values (new.id, 'recruiter', null,
            left(coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1)), 60),
            true, 'friends');
    insert into public.onboarding_state (user_id, role, step, completed_at) values (new.id, 'recruiter', 6, now());
  else
    select array_agg(distinct d.university_id) into v_owners
      from public.university_domains d
     where d.domain = v_domain
       and (case when v_role in ('faculty', 'university_admin') then d.kind in ('faculty', 'both')
                 else d.kind in ('student', 'both') end);

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
    -- A university official must name their university: nothing to choose later.
    if v_role = 'university_admin' and v_university is null then
      raise exception 'signup refused: choose the university' using errcode = '42501';
    end if;

    -- Faculty and university officials have no student onboarding. Officials are hidden like
    -- recruiters (friends-only, nobody is their friend): they are never on boards or in search.
    insert into public.profiles (user_id, role, university_id, full_name, onboarding_complete, visibility)
    values (
      new.id,
      v_role,
      v_university,
      left(coalesce(
        nullif(btrim(v_meta ->> 'full_name'), ''),
        nullif(btrim(v_meta ->> 'name'), ''),
        split_part(new.email, '@', 1)
      ), 60),
      (v_role = 'faculty' and v_university is not null) or v_role = 'university_admin',
      case when v_role = 'university_admin' then 'friends'::public.profile_visibility else 'university'::public.profile_visibility end
    );

    insert into public.onboarding_state (user_id, role, step, completed_at)
    values (new.id, v_role, case when v_role = 'student' then 1 else 6 end,
            case when (v_role = 'faculty' and v_university is not null) or v_role = 'university_admin' then now() end);
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
              when 'university_admin' then private.domain_admits_faculty(private.email_domain(u.email), p.university_id)
              when 'recruiter' then private.is_recruiter_domain(private.email_domain(u.email))
                and coalesce((select o.domain = private.email_domain(u.email)
                                from public.org_members m join public.organizations o on o.id = m.org_id
                               where m.user_id = u.id), true)
              else private.domain_admits_students(private.email_domain(u.email), p.university_id) end)
  );
$$;

-- University officials keep an email at their university (the phase 1 trigger covers the others).
create function private.guard_uni_admin_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university uuid;
begin
  select p.university_id into v_university from public.profiles p where p.user_id = new.id and p.role = 'university_admin';
  if not found then
    return new;
  end if;
  if (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change
      and not private.domain_admits_faculty(private.email_domain(new.email_change), v_university))
     or (new.email is distinct from old.email and new.email is not null
         and not private.domain_admits_faculty(private.email_domain(new.email), v_university)) then
    raise exception 'a university account must keep an email at its university' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_uni_admin_email_change() from public;
create trigger users_guard_uni_admin_email before update of email, email_change on auth.users
  for each row execute function private.guard_uni_admin_email_change();

-- ---------------------------------------------------------------------------
-- The portal's own view of the caller
-- ---------------------------------------------------------------------------
create function private.uni_entitlements(p_university uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', private.uni_plan(p_university),
    'entitlements', jsonb_build_object(
      'uni.dashboard', private.uni_entitled(p_university, 'uni.dashboard'),
      'uni.dashboard_full', private.uni_entitled(p_university, 'uni.dashboard_full'),
      'uni.exports', private.uni_entitled(p_university, 'uni.exports'),
      'uni.student_records', private.uni_entitled(p_university, 'uni.student_records'),
      'uni.skills_gap', private.uni_entitled(p_university, 'uni.skills_gap'),
      'uni.outcomes', private.uni_entitled(p_university, 'uni.outcomes'),
      'uni.faculty_panel', private.uni_entitled(p_university, 'uni.faculty_panel'),
      'uni.benchmark', private.uni_entitled(p_university, 'uni.benchmark'),
      'uni.accreditation', private.uni_entitled(p_university, 'uni.accreditation')),
    'limits', jsonb_build_object(
      'uni.admin_seats', private.uni_limit(p_university, 'uni.admin_seats'),
      'uni.hackathons', private.uni_limit(p_university, 'uni.hackathons'),
      'uni.job_fairs', private.uni_limit(p_university, 'uni.job_fairs')));
$$;
revoke all on function private.uni_entitlements(uuid) from public;

-- The portal layout: the caller's university, role and plan, or null (no seat, or no two-factor).
create function private.my_uni()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  a public.university_admins;
begin
  if v_me is null or coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    return null;
  end if;
  select ua.* into a from public.university_admins ua where ua.user_id = v_me;
  if a.user_id is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
             'university_id', u.id, 'name', u.name, 'slug', u.slug, 'city', u.city, 'role', a.role,
             'department_id', a.department_id, 'department', d.name, 'claimed_at', u.claimed_at,
             'is_owner', a.role = 'owner')
           || private.uni_entitlements(u.id)
      from public.universities u
      left join public.departments d on d.id = a.department_id
     where u.id = a.university_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim flow (university-admin accounts, two-factor)
-- ---------------------------------------------------------------------------
-- The claim page: the caller's university, whether it is claimed, and their own claims.
create function private.my_uni_claim()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_uni uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select p.university_id into v_uni from public.profiles p where p.user_id = v_me and p.role = 'university_admin';
  if v_uni is null then
    raise exception 'only university official accounts claim a university' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'university_id', u.id, 'university', u.name, 'claimed', u.owner_id is not null,
             'is_admin', exists (select 1 from public.university_admins ua where ua.user_id = v_me),
             'open_claim_by_other', exists (select 1 from public.university_claims c
                                             where c.university_id = u.id and c.status = 'pending' and c.requester_id <> v_me),
             'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'title', c.title,
                                                                     'review_reason', c.review_reason, 'created_at', c.created_at,
                                                                     'reviewed_at', c.reviewed_at) order by c.created_at desc)
                                   from public.university_claims c where c.requester_id = v_me), '[]'::jsonb))
      from public.universities u where u.id = v_uni);
end;
$$;

-- p: {title, note?, path}. The letter must already be the caller's object in the private bucket.
create function private.submit_uni_claim(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_uni uuid;
  v_path text := p ->> 'path';
  v_object storage.objects;
  v_mime text;
  v_bytes bigint;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'turn on two-factor sign-in before you claim a university' using errcode = '42501';
  end if;
  select pr.university_id into v_uni from public.profiles pr where pr.user_id = v_me and pr.role = 'university_admin';
  if v_uni is null then
    raise exception 'only university official accounts claim a university' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_me
                  and private.domain_admits_faculty(private.email_domain(u.email), v_uni)) then
    raise exception 'use an official email at this university' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-claim:' || v_uni::text, 0));
  if exists (select 1 from public.universities u where u.id = v_uni and u.owner_id is not null) then
    raise exception 'this university already has an owner; ask them for an invite' using errcode = '55000';
  end if;
  if exists (select 1 from public.university_claims c where c.university_id = v_uni and c.status = 'pending') then
    raise exception 'a claim for this university is already waiting for review' using errcode = '23505';
  end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 2 and 80 then
    raise exception 'enter your job title' using errcode = '22023';
  end if;
  if char_length(coalesce(p ->> 'note', '')) > 1000 then
    raise exception 'keep the note under 1,000 characters' using errcode = '22023';
  end if;
  if v_path is null or v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|webp)$' or split_part(v_path, '/', 1) <> v_me::text then
    raise exception 'upload the letter first' using errcode = '22023';
  end if;
  select * into v_object from storage.objects o where o.bucket_id = 'university-claims' and o.name = v_path;
  if not found or v_object.owner_id is distinct from v_me::text then
    raise exception 'upload the letter first' using errcode = '22023';
  end if;
  v_mime := v_object.metadata ->> 'mimetype';
  v_bytes := coalesce((v_object.metadata ->> 'size')::bigint, 0);
  if not ((v_path like '%.pdf' and v_mime = 'application/pdf') or (v_path like '%.webp' and v_mime = 'image/webp')) then
    raise exception 'upload a PDF or an image' using errcode = '22023';
  end if;
  if v_bytes <= 0 or v_bytes > 5242880 then
    raise exception 'letters can be up to 5 MB' using errcode = '23514';
  end if;
  if not private.rate_limit('uni_claim:' || v_me::text, 5, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.university_claims (university_id, requester_id, title, note, letter_path, letter_bytes)
  values (v_uni, v_me, btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'note', '')), ''), v_path, v_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admins and invites
-- ---------------------------------------------------------------------------
create function private.uni_seat_count(p_university uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.university_admins a where a.university_id = p_university)::integer
       + (select count(*) from public.university_admin_invites i
           where i.university_id = p_university and i.used_at is null and i.revoked_at is null and i.expires_at > now())::integer;
$$;
revoke all on function private.uni_seat_count(uuid) from public;

create function private.uni_admins_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'seats_limit', private.uni_limit(a.university_id, 'uni.admin_seats'),
    'seats_used', private.uni_seat_count(a.university_id),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', p.full_name, 'email', u.email, 'role', x.role,
                                          'department_id', x.department_id, 'department', d.name, 'since', x.created_at)
                       order by (x.role = 'owner') desc, x.created_at)
        from public.university_admins x
        join public.profiles p on p.user_id = x.user_id
        join auth.users u on u.id = x.user_id
        left join public.departments d on d.id = x.department_id
       where x.university_id = a.university_id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'department', d.name,
                                          'expires_at', i.expires_at,
                                          'state', case when i.used_at is not null then 'accepted'
                                                        when i.revoked_at is not null then 'revoked'
                                                        when i.expires_at <= now() then 'expired' else 'pending' end)
                       order by i.created_at desc)
        from (select * from public.university_admin_invites where university_id = a.university_id order by created_at desc limit 50) i
        left join public.departments d on d.id = i.department_id), '[]'::jsonb));
end;
$$;

create function private.invite_uni_admin(p_email text, p_role public.uni_admin_role, p_department uuid, p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_domain text := private.email_domain(v_email);
  v_limit integer;
  v_id uuid;
begin
  if p_role is null or p_role = 'owner' then
    raise exception 'pick a role: admin, career office, department coordinator or communications' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'enter a valid email address' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invite' using errcode = '22023';
  end if;
  if not private.domain_admits_faculty(v_domain, a.university_id) then
    raise exception 'invite an official email at your university (a staff or faculty domain)' using errcode = '22023';
  end if;
  if (p_role = 'coordinator') <> (p_department is not null)
     or (p_department is not null and not exists (select 1 from public.departments d
                                                    where d.id = p_department and d.university_id = a.university_id)) then
    raise exception 'a department coordinator needs one of your departments' using errcode = '22023';
  end if;
  if not private.rate_limit('uni_invite:' || a.user_id::text, 30, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-seats:' || a.university_id::text, 0));
  if exists (select 1 from public.university_admins x join auth.users u on u.id = x.user_id
              where lower(u.email) = v_email) then
    raise exception 'that person already has a university portal seat' using errcode = '23505';
  end if;
  update public.university_admin_invites set revoked_at = now()
   where university_id = a.university_id and email = v_email and used_at is null and revoked_at is null;
  v_limit := private.uni_limit(a.university_id, 'uni.admin_seats');
  if v_limit is null or private.uni_seat_count(a.university_id) >= v_limit then
    raise exception 'your university''s plan has no free admin seats' using errcode = '55000';
  end if;
  insert into public.university_admin_invites (university_id, email, role, department_id, token_hash, invited_by, expires_at)
  values (a.university_id, v_email, p_role, p_department, p_token_hash, a.user_id, now() + interval '7 days')
  returning id into v_id;
  perform private.uni_audit(a.university_id, 'admin.invite', 'invite', v_id::text, jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

create function private.revoke_uni_invite(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  update public.university_admin_invites set revoked_at = now()
   where id = p_id and university_id = a.university_id and used_at is null and revoked_at is null;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'admin.invite_revoke', 'invite', p_id::text);
end;
$$;

-- Anyone holding the link (even signed out) sees the university, the email and the role.
create function private.uni_invite_preview(p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('university', u.name, 'university_id', u.id, 'email', i.email, 'role', i.role)
    from public.university_admin_invites i
    join public.universities u on u.id = i.university_id
   where i.token_hash = p_token_hash and i.used_at is null and i.revoked_at is null and i.expires_at > now();
$$;
revoke all on function private.uni_invite_preview(text) from public;

-- Invites waiting for the caller's exact email (a university-official or faculty account).
create function private.my_uni_invites()
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
    select jsonb_agg(jsonb_build_object('id', i.id, 'university', un.name, 'role', i.role, 'department', d.name,
                                        'expires_at', i.expires_at) order by i.created_at desc)
      from public.university_admin_invites i
      join public.universities un on un.id = i.university_id
      left join public.departments d on d.id = i.department_id
      join auth.users u on u.id = v_me and lower(u.email) = i.email
      join public.profiles pr on pr.user_id = v_me and pr.role in ('university_admin', 'faculty') and pr.university_id = i.university_id
     where i.used_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb);
end;
$$;

create function private.accept_uni_invite(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_email text;
  i public.university_admin_invites;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'turn on two-factor sign-in before you join the university portal' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_me;
  select * into i from public.university_admin_invites where id = p_id for update;
  if not found or i.email <> v_email then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if i.used_at is not null or i.revoked_at is not null or i.expires_at <= now() then
    raise exception 'this invite has expired or was already used' using errcode = '55000';
  end if;
  -- Students can never be admins; officials and faculty only, at this university.
  if not exists (select 1 from public.profiles pr where pr.user_id = v_me and pr.role in ('university_admin', 'faculty')
                  and pr.university_id = i.university_id and pr.status <> 'deleting') then
    raise exception 'only staff or faculty accounts at this university can join its portal' using errcode = '42501';
  end if;
  if exists (select 1 from public.university_admins x where x.user_id = v_me) then
    raise exception 'you already have a university portal seat' using errcode = '55000';
  end if;
  update public.university_admin_invites set used_at = now() where id = i.id;
  insert into public.university_admins (user_id, university_id, role, department_id, invited_by)
  values (v_me, i.university_id, i.role, i.department_id, i.invited_by);
  perform private.uni_audit(i.university_id, 'admin.join', 'admin', v_me::text, jsonb_build_object('role', i.role));
  perform private.notify(i.invited_by, v_me, 'uni_admin_joined', 'university', i.university_id, '{}'::jsonb);
  return i.university_id;
end;
$$;

-- Owner and admins change roles; nobody changes the owner here (transfer_uni_ownership does).
create function private.set_uni_admin_role(p_user uuid, p_role public.uni_admin_role, p_department uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  x public.university_admins;
begin
  select * into x from public.university_admins where user_id = p_user and university_id = a.university_id for update;
  if not found then
    raise exception 'admin not found' using errcode = 'P0002';
  end if;
  if x.role = 'owner' or p_role = 'owner' then
    raise exception 'the owner changes only through a transfer of ownership' using errcode = '42501';
  end if;
  if (p_role = 'coordinator') <> (p_department is not null)
     or (p_department is not null and not exists (select 1 from public.departments d
                                                    where d.id = p_department and d.university_id = a.university_id)) then
    raise exception 'a department coordinator needs one of your departments' using errcode = '22023';
  end if;
  update public.university_admins set role = p_role, department_id = p_department where user_id = p_user;
  perform private.uni_audit(a.university_id, 'admin.role', 'admin', p_user::text,
                            jsonb_build_object('from', x.role, 'to', p_role));
end;
$$;

-- Removes a seat (anyone but the owner); an admin may also remove themselves.
create function private.remove_uni_admin(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  a public.university_admins;
  x public.university_admins;
begin
  if p_user = v_me then
    a := private.require_uni(array['admin', 'career', 'coordinator', 'comms']::public.uni_admin_role[]);
  else
    a := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  end if;
  select * into x from public.university_admins where user_id = p_user and university_id = a.university_id for update;
  if not found then
    raise exception 'admin not found' using errcode = 'P0002';
  end if;
  if x.role = 'owner' then
    raise exception 'transfer ownership before the owner leaves' using errcode = '55000';
  end if;
  delete from public.university_admins where user_id = p_user;
  perform private.uni_audit(a.university_id, 'admin.remove', 'admin', p_user::text, jsonb_build_object('role', x.role));
end;
$$;

-- The owner hands ownership to an existing admin and becomes an admin.
create function private.transfer_uni_ownership(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner']::public.uni_admin_role[]);
begin
  if p_user = a.user_id then
    raise exception 'you already own this university''s portal' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-seats:' || a.university_id::text, 0));
  if not exists (select 1 from public.university_admins x where x.user_id = p_user and x.university_id = a.university_id
                    and x.role = 'admin') then
    raise exception 'make them an admin first' using errcode = '55000';
  end if;
  update public.university_admins set role = 'admin' where user_id = a.user_id;
  update public.university_admins set role = 'owner', department_id = null where user_id = p_user;
  update public.universities set owner_id = p_user where id = a.university_id;
  perform private.uni_audit(a.university_id, 'admin.transfer_ownership', 'admin', p_user::text,
                            jsonb_build_object('from', a.user_id));
end;
$$;

-- The university's own history of admin actions (owner and admins).
create function private.uni_audit_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('action', l.action, 'target_type', l.target_type, 'actor', p.full_name,
                                        'detail', l.detail, 'at', l.created_at) order by l.created_at desc)
      from (select * from public.university_audit_log where university_id = a.university_id order by created_at desc limit 100) l
      left join public.profiles p on p.user_id = l.actor_id), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Domains and the final-year batch: requests to staff
-- ---------------------------------------------------------------------------
create function private.request_uni_domain(p_domain text, p_kind public.domain_kind, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_id uuid;
begin
  if v_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' or char_length(v_domain) > 253 then
    raise exception 'enter a domain like students.example.edu.pk' using errcode = '22023';
  end if;
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    raise exception 'a public email domain can''t be a university domain' using errcode = '22023';
  end if;
  if exists (select 1 from public.university_domains d where d.university_id = a.university_id and d.domain = v_domain) then
    raise exception 'your university already uses this domain' using errcode = '23505';
  end if;
  if exists (select 1 from public.university_domain_requests r where r.domain = v_domain and r.status = 'pending') then
    raise exception 'this domain is already waiting for review' using errcode = '23505';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'say who uses this domain (3 to 500 characters)' using errcode = '22023';
  end if;
  if not private.rate_limit('uni_domain:' || a.university_id::text, 10, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.university_domain_requests (university_id, domain, kind, reason, requested_by)
  values (a.university_id, v_domain, coalesce(p_kind, 'both'), btrim(p_reason), a.user_id)
  returning id into v_id;
  perform private.uni_audit(a.university_id, 'domain.request', 'domain', v_domain, jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;

create function private.uni_domains()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'domains', coalesce((select jsonb_agg(jsonb_build_object('domain', d.domain, 'kind', d.kind, 'source', d.source) order by d.domain)
                           from public.university_domains d where d.university_id = a.university_id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'domain', r.domain, 'kind', r.kind, 'status', r.status,
                                                              'review_reason', r.review_reason, 'created_at', r.created_at)
                                           order by r.created_at desc)
                            from public.university_domain_requests r where r.university_id = a.university_id), '[]'::jsonb));
end;
$$;

create function private.request_final_year_batch(p_year integer, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner']::public.uni_admin_role[]);
  v_id uuid;
begin
  if p_year is not null and p_year not between 2000 and 2100 then
    raise exception 'enter a graduating year' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'give a reason (3 to 500 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from public.final_year_batch_requests r where r.university_id = a.university_id and r.status = 'pending') then
    raise exception 'a request is already waiting for Skilient' using errcode = '23505';
  end if;
  insert into public.final_year_batch_requests (university_id, batch_year, reason, requested_by)
  values (a.university_id, p_year, btrim(p_reason), a.user_id) returning id into v_id;
  perform private.uni_audit(a.university_id, 'final_year.request', 'university', a.university_id::text, jsonb_build_object('year', p_year));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Structure: departments and programmes (owner and admins)
-- ---------------------------------------------------------------------------
create function private.uni_structure()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career', 'coordinator', 'comms']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'name', d.name,
               'students', (select count(*) from public.profiles p where p.department_id = d.id and p.role = 'student'),
               'programmes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
                                         from public.programmes g where g.department_id = d.id), '[]'::jsonb))
             order by d.name)
        from public.departments d where d.university_id = a.university_id), '[]'::jsonb),
    'unassigned', (select count(*) from public.profiles p
                    where p.university_id = a.university_id and p.role = 'student' and p.department_id is null
                      and exists (select 1 from public.departments d where d.university_id = a.university_id)));
end;
$$;

create function private.save_department(p_id uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 2 and 80 then
    raise exception 'department names are 2 to 80 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.departments d where d.university_id = a.university_id and lower(d.name) = lower(v_name)
               and d.id is distinct from p_id) then
    raise exception 'you already have a department with that name' using errcode = '23505';
  end if;
  if p_id is null then
    if (select count(*) from public.departments d where d.university_id = a.university_id) >= 100 then
      raise exception 'up to 100 departments' using errcode = '23514';
    end if;
    insert into public.departments (university_id, name) values (a.university_id, v_name) returning id into v_id;
  else
    update public.departments set name = v_name where id = p_id and university_id = a.university_id returning id into v_id;
    if v_id is null then
      raise exception 'department not found' using errcode = 'P0002';
    end if;
  end if;
  perform private.uni_audit(a.university_id, 'structure.department', 'department', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

create function private.delete_department(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  if exists (select 1 from public.university_admins x where x.department_id = p_id) then
    raise exception 'move this department''s coordinator first' using errcode = '55000';
  end if;
  delete from public.departments where id = p_id and university_id = a.university_id;
  if not found then
    raise exception 'department not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'structure.department_delete', 'department', p_id::text);
end;
$$;

create function private.save_programme(p_department uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not exists (select 1 from public.departments d where d.id = p_department and d.university_id = a.university_id) then
    raise exception 'department not found' using errcode = 'P0002';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'programme names are 2 to 80 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.programmes g where g.department_id = p_department) >= 30 then
    raise exception 'up to 30 programmes a department' using errcode = '23514';
  end if;
  insert into public.programmes (department_id, name) values (p_department, v_name)
  on conflict do nothing returning id into v_id;
  if v_id is null then
    raise exception 'that programme is already listed' using errcode = '23505';
  end if;
  return v_id;
end;
$$;

create function private.delete_programme(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  delete from public.programmes g using public.departments d
   where g.id = p_id and d.id = g.department_id and d.university_id = a.university_id;
  if not found then
    raise exception 'programme not found' using errcode = 'P0002';
  end if;
end;
$$;

-- The profile pickers: the caller's university list when it has one, else the platform list.
create function private.department_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'own_list', exists (select 1 from public.departments d where d.university_id = p.university_id),
    'department_id', p.department_id,
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'name', d.name,
               'programmes', coalesce((select jsonb_agg(g.name order by g.name) from public.programmes g where g.department_id = d.id), '[]'::jsonb))
             order by d.name)
        from public.departments d where d.university_id = p.university_id), '[]'::jsonb))
    from public.profiles p where p.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Teachers (5.23 "People"): the university's own screen; coordinators for their department
-- ---------------------------------------------------------------------------
create function private.uni_teachers(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  v_dept text := (select d.name from public.departments d where d.id = a.department_id);
begin
  if p_status not in ('pending', 'approved', 'revoked') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', t.user_id, 'name', p.full_name, 'email', u.email, 'department', t.department, 'title', t.title,
             'status', t.status, 'requested_at', t.requested_at, 'approved_at', t.approved_at,
             'on_csv', exists (select 1 from public.faculty_csv_entries c where c.university_id = t.university_id and c.email = lower(u.email)))
             order by t.requested_at)
      from public.teacher_profiles t
      join public.profiles p on p.user_id = t.user_id
      join auth.users u on u.id = t.user_id
     where t.university_id = a.university_id and t.status = p_status::public.teacher_status
       and (a.role <> 'coordinator' or lower(t.department) = lower(v_dept))), '[]'::jsonb);
end;
$$;

-- Coordinators act only on teachers of their department; owner and admins on everyone.
create function private.uni_teacher_scope(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  t public.teacher_profiles;
begin
  select * into t from public.teacher_profiles where user_id = p_user;
  if not found or t.university_id <> a.university_id then
    raise exception 'teacher request not found' using errcode = 'P0002';
  end if;
  if a.role = 'coordinator' then
    if not exists (select 1 from public.departments d where d.id = a.department_id and lower(d.name) = lower(t.department)) then
      raise exception 'coordinators approve teachers of their own department' using errcode = '42501';
    end if;
    perform set_config('skilient.coordinator_university', a.university_id::text, true);
  end if;
end;
$$;
revoke all on function private.uni_teacher_scope(uuid) from public;

create function private.uni_approve_teacher(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.uni_teacher_scope(p_user);
  perform private.approve_teacher(p_user);
  perform set_config('skilient.coordinator_university', '', true);
end;
$$;

create function private.uni_revoke_teacher(p_user uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.uni_teacher_scope(p_user);
  perform private.revoke_teacher(p_user, p_reason);
  perform set_config('skilient.coordinator_university', '', true);
end;
$$;

create function private.uni_import_faculty(p_rows jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
begin
  return private.import_faculty_csv(a.university_id, p_rows);
end;
$$;

-- Department assignment from the university's list (coordinators for their own department).
create function private.uni_set_teacher_department(p_user uuid, p_department uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  v_name text;
begin
  select d.name into v_name from public.departments d where d.id = p_department and d.university_id = a.university_id;
  if v_name is null then
    raise exception 'department not found' using errcode = 'P0002';
  end if;
  if a.role = 'coordinator' and p_department <> a.department_id then
    raise exception 'coordinators assign their own department only' using errcode = '42501';
  end if;
  update public.teacher_profiles set department = v_name where user_id = p_user and university_id = a.university_id;
  if not found then
    raise exception 'teacher not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'teacher.department', 'teacher', p_user::text, jsonb_build_object('department', v_name));
end;
$$;

-- ---------------------------------------------------------------------------
-- /ops: claims, domain requests, final-year requests (accounts staff, two-factor), audited
-- ---------------------------------------------------------------------------
create function private.ops_uni_queue(p_q text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return jsonb_build_object(
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'university', u.name, 'requester', p.full_name, 'email', au.email,
                                          'title', c.title, 'created_at', c.created_at) order by c.created_at)
        from public.university_claims c
        join public.universities u on u.id = c.university_id
        join public.profiles p on p.user_id = c.requester_id
        join auth.users au on au.id = c.requester_id
       where c.status = 'pending'), '[]'::jsonb),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'university', u.name, 'domain', r.domain, 'kind', r.kind,
                                          'reason', r.reason, 'created_at', r.created_at) order by r.created_at)
        from public.university_domain_requests r join public.universities u on u.id = r.university_id
       where r.status = 'pending'), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'university', u.name, 'batch_year', r.batch_year,
                                          'current', u.final_year_batch, 'reason', r.reason, 'created_at', r.created_at) order by r.created_at)
        from public.final_year_batch_requests r join public.universities u on u.id = r.university_id
       where r.status = 'pending'), '[]'::jsonb),
    'claimed', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'owner', p.full_name, 'claimed_at', u.claimed_at,
                                          'plan', private.uni_plan(u.id)) order by u.name)
        from public.universities u left join public.profiles p on p.user_id = u.owner_id
       where u.owner_id is not null
         and (p_q is null or u.name ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%')), '[]'::jsonb));
end;
$$;

create function private.ops_uni_claim(p_id uuid)
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
           'id', c.id, 'university_id', u.id, 'university', u.name, 'claimed', u.owner_id is not null,
           'domains', (select jsonb_agg(d.domain order by d.domain) from public.university_domains d where d.university_id = u.id),
           'requester', p.full_name, 'email', au.email, 'title', c.title, 'note', c.note,
           'letter_path', case when c.letter_deleted_at is null then c.letter_path end,
           'letter_type', case when c.letter_path like '%.pdf' then 'pdf' else 'image' end,
           'status', c.status, 'review_reason', c.review_reason, 'created_at', c.created_at, 'reviewed_at', c.reviewed_at,
           'has_two_factor', exists (select 1 from auth.mfa_factors f where f.user_id = c.requester_id and f.status = 'verified'))
    into v_row
    from public.university_claims c
    join public.universities u on u.id = c.university_id
    join public.profiles p on p.user_id = c.requester_id
    join auth.users au on au.id = c.requester_id
   where c.id = p_id;
  if v_row is null then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create function private.decide_uni_claim(p_id uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  c public.university_claims;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into c from public.university_claims where id = p_id for update;
  if not found then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'this claim was already decided' using errcode = '55000';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'give a reason the requester can read' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uni-claim:' || c.university_id::text, 0));
  if p_approve then
    if exists (select 1 from public.universities u where u.id = c.university_id and u.owner_id is not null) then
      raise exception 'this university already has an owner (see the dispute procedure)' using errcode = '55000';
    end if;
    if exists (select 1 from public.university_admins x where x.user_id = c.requester_id) then
      raise exception 'the requester already has a portal seat' using errcode = '55000';
    end if;
    insert into public.university_admins (user_id, university_id, role) values (c.requester_id, c.university_id, 'owner');
    update public.universities set owner_id = c.requester_id, claimed_at = now() where id = c.university_id;
  end if;
  update public.university_claims
     set status = case when p_approve then 'approved' else 'rejected' end::public.uni_request_status,
         review_reason = v_reason, reviewed_by = v_me, reviewed_at = now()
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_approve then 'uni.claim_approve' else 'uni.claim_reject' end, 'university', c.university_id::text,
          v_reason, jsonb_build_object('claim', p_id, 'status', 'pending'),
          jsonb_build_object('claim', p_id, 'status', case when p_approve then 'approved' else 'rejected' end));
  perform private.notify(c.requester_id, null, 'uni_claim_decided', 'university', c.university_id,
                         jsonb_build_object('approved', p_approve, 'reason', v_reason));
end;
$$;

create function private.decide_uni_domain(p_id uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  r public.university_domain_requests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into r from public.university_domain_requests where id = p_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'this request was already decided' using errcode = '55000';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'give a reason the university can read' using errcode = '22023';
  end if;
  if p_approve then
    -- Applies to signup at once; the public-domain trigger refuses webmail here too.
    insert into public.university_domains (university_id, domain, kind, source)
    values (r.university_id, r.domain, r.kind, 'ops')
    on conflict (university_id, domain) do update set kind = excluded.kind;
  end if;
  update public.university_domain_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.uni_request_status,
         review_reason = v_reason, reviewed_by = v_me, reviewed_at = now()
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_approve then 'uni.domain_approve' else 'uni.domain_reject' end, 'university', r.university_id::text,
          v_reason, null, jsonb_build_object('domain', r.domain, 'kind', r.kind));
  perform private.notify(r.requested_by, null, 'uni_domain_decided', 'university', r.university_id,
                         jsonb_build_object('approved', p_approve, 'domain', r.domain, 'reason', v_reason));
end;
$$;

create function private.decide_final_year_batch(p_id uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  r public.final_year_batch_requests;
  v_before smallint;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into r from public.final_year_batch_requests where id = p_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'this request was already decided' using errcode = '55000';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'give a reason the university can read' using errcode = '22023';
  end if;
  select u.final_year_batch into v_before from public.universities u where u.id = r.university_id;
  if p_approve then
    update public.universities set final_year_batch = r.batch_year where id = r.university_id;
  end if;
  update public.final_year_batch_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.uni_request_status,
         review_reason = v_reason, reviewed_by = v_me, reviewed_at = now()
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_approve then 'uni.final_year_approve' else 'uni.final_year_reject' end, 'university',
          r.university_id::text, v_reason, jsonb_build_object('final_year_batch', v_before),
          jsonb_build_object('final_year_batch', case when p_approve then r.batch_year else v_before end));
  perform private.notify(r.requested_by, null, 'uni_batch_decided', 'university', r.university_id,
                         jsonb_build_object('approved', p_approve, 'year', r.batch_year, 'reason', v_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily: claim letters go 90 days after the decision; stray uploads after a day
-- ---------------------------------------------------------------------------
create function private.uni_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  c record;
  v_n integer := 0;
begin
  v_run := public.job_run_start('uni-daily');
  begin
    for c in
      update public.university_claims set letter_deleted_at = now()
       where status <> 'pending' and letter_deleted_at is null and reviewed_at < now() - interval '90 days'
      returning letter_path
    loop
      perform private.queue_storage_cleanup('university-claims', c.letter_path);
      v_n := v_n + 1;
    end loop;
    for c in
      select o.name from storage.objects o
       where o.bucket_id = 'university-claims' and o.created_at < now() - interval '1 day'
         and not exists (select 1 from public.university_claims x where x.letter_path = o.name)
    loop
      perform private.queue_storage_cleanup('university-claims', c.name);
      v_n := v_n + 1;
    end loop;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
end;
$$;
revoke all on function private.uni_daily() from public;
select cron.schedule('uni-daily', '23 19 * * *', $$select private.uni_daily()$$); -- 00:23 PKT

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
  'my_uni', 'my_uni_claim', 'submit_uni_claim',
  'uni_admins_list', 'invite_uni_admin', 'revoke_uni_invite', 'my_uni_invites', 'accept_uni_invite',
  'set_uni_admin_role', 'remove_uni_admin', 'transfer_uni_ownership', 'uni_audit_list',
  'request_uni_domain', 'uni_domains', 'request_final_year_batch',
  'uni_structure', 'save_department', 'delete_department', 'save_programme', 'delete_programme', 'department_options',
  'uni_teachers', 'uni_approve_teacher', 'uni_revoke_teacher', 'uni_import_faculty', 'uni_set_teacher_department',
  'ops_uni_queue', 'ops_uni_claim', 'decide_uni_claim', 'decide_uni_domain', 'decide_final_year_batch'
]);

grant execute on function private.uni_invite_preview(text) to anon, authenticated;
create function public.uni_invite_preview(p_token_hash text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.uni_invite_preview(p_token_hash) $$;
revoke all on function public.uni_invite_preview(text) from public;
grant execute on function public.uni_invite_preview(text) to anon, authenticated;

-- Helpers other definer functions and later migrations call.
grant execute on function private.uni_plan(uuid), private.uni_entitled(uuid, text), private.uni_limit(uuid, text)
  to authenticated, service_role;

drop function pg_temp.expose(text[]);

-- A student at a university with its own department list must pick from it (checked here, so a
-- direct write can't skip it). Without a list, the app's platform-wide list applies.
create function private.check_profile_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'student' and new.department is not null
     and (tg_op = 'INSERT' or new.department is distinct from old.department)
     and exists (select 1 from public.departments d where d.university_id = new.university_id)
     and new.department_id is null then
    raise exception 'choose one of your university''s departments' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_profile_department() from public;
-- Runs after profiles_sync_department (trigger names fire in alphabetical order).
create trigger profiles_tcheck_department before insert or update of department on public.profiles
  for each row execute function private.check_profile_department();
