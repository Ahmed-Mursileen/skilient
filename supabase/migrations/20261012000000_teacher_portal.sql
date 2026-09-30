-- Phase 7: teacher portal (PRD 5.21; docs/decisions.md 2026-10-03).
-- Faculty sign up with their university email and ask for the teacher role; a Skilient accounts
-- staff member, a university admin or a faculty CSV approves them. Approved teachers post project
-- ideas, supervise and review ventures, endorse students at weight 1.5 and grade code checks.
-- Teachers are never ranked. Every write is a security-definer function in `private` that checks
-- auth.uid() and the teacher's status; tables grant reads only. Reads that build a whole page
-- return one jsonb document so the public wrappers stay one line each (they are generated at the
-- end of this file).

insert into public.platform_config (key, version, value, reason) values
  ('teacher.limits', 1,
   '{"supervisions_max": 15, "endorsements_per_month": 40, "endorsement_weight": 1.5, "per_teammate_per_venture": 5, "concentration_share": 0.3, "concentration_days": 90, "concentration_min": 10, "review_days": 14, "review_remind_days": [7, 12], "grading_cap_default": 10, "grading_teacher_hours": 48, "ideas_per_day": 10, "open_review_requests_per_venture": 3}',
   'PRD 5.21 launch values (decisions.md 2026-10-03)');

create function private.teacher_limit(p_name text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (private.config('teacher.limits') ->> p_name)::numeric;
$$;
revoke all on function private.teacher_limit(text) from public;

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
create type public.teacher_status as enum ('pending', 'approved', 'revoked');
create type public.idea_difficulty as enum ('intro', 'intermediate', 'advanced');
create type public.idea_audience as enum ('university', 'global');
create type public.idea_status as enum ('open', 'closed');
create type public.supervisor_status as enum ('invited', 'active', 'ended');
create type public.review_request_status as enum ('open', 'submitted', 'declined', 'expired', 'cancelled');

create table public.teacher_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete restrict,
  department text not null check (char_length(btrim(department)) between 2 and 80),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  status public.teacher_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  approval_source text check (approval_source in ('staff', 'university_admin', 'csv')),
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  check (status <> 'approved' or approved_at is not null),
  check (status <> 'revoked' or revoked_at is not null)
);
comment on table public.teacher_profiles is
  'The teacher role (PRD 5.21). Written only by request_teacher_role / approve_teacher / revoke_teacher; read own row.';
create index teacher_profiles_university_idx on public.teacher_profiles (university_id, status);
create index teacher_profiles_approved_by_idx on public.teacher_profiles (approved_by) where approved_by is not null;
create index teacher_profiles_revoked_by_idx on public.teacher_profiles (revoked_by) where revoked_by is not null;

create table public.teacher_settings (
  user_id uuid primary key references public.teacher_profiles (user_id) on delete cascade,
  grading_opt_in boolean not null default false,
  weekly_grading_cap smallint not null default 10 check (weekly_grading_cap between 1 and 50),
  grading_skills text[] not null default '{}' check (cardinality(grading_skills) <= 30),
  digest boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table public.teacher_settings is 'Code-check grading opt-in and the weekly digest (PRD 5.21). Read own row.';

-- Pre-approved faculty emails per university (PRD 5.21 "faculty CSV"). Staff and university
-- admins write through import_faculty_csv(); nobody reads the table directly.
create table public.faculty_csv_entries (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 254),
  department text check (department is null or char_length(department) <= 80),
  title text check (title is null or char_length(title) <= 80),
  imported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (university_id, email)
);
create index faculty_csv_entries_imported_by_idx on public.faculty_csv_entries (imported_by) where imported_by is not null;

create table public.project_ideas (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  brief text not null check (char_length(btrim(brief)) between 1 and 2000),
  skills text[] not null default '{}' check (cardinality(skills) between 1 and 10),
  difficulty public.idea_difficulty not null,
  team_size smallint not null check (team_size between 2 and 6),
  duration_weeks smallint not null check (duration_weeks between 1 and 52),
  deliverables text not null check (char_length(btrim(deliverables)) between 1 and 500),
  max_teams smallint not null default 3 check (max_teams between 1 and 50),
  deadline date,
  course_label text check (course_label is null or char_length(btrim(course_label)) between 1 and 60),
  audience public.idea_audience not null default 'university',
  status public.idea_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.project_ideas is 'Teacher project ideas (PRD 5.21). Writes only through save_idea / close_idea.';
create index project_ideas_teacher_idx on public.project_ideas (teacher_id, created_at desc);
create index project_ideas_browse_idx on public.project_ideas (university_id, created_at desc) where status = 'open';
create index project_ideas_global_idx on public.project_ideas (created_at desc) where status = 'open' and audience = 'global';
create index project_ideas_university_idx on public.project_ideas (university_id);
create index project_ideas_skills_idx on public.project_ideas using gin (skills);
create trigger project_ideas_updated_at before update on public.project_ideas
  for each row execute function private.set_updated_at();

alter table public.ventures add column idea_id uuid references public.project_ideas (id) on delete set null;
create index ventures_idea_idx on public.ventures (idea_id) where idea_id is not null;

create table public.venture_supervisors (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade,
  status public.supervisor_status not null default 'invited',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check (status <> 'active' or started_at is not null),
  check (status <> 'ended' or ended_at is not null)
);
comment on table public.venture_supervisors is 'One supervisor per venture at a time (PRD 5.21); history is kept.';
create unique index venture_supervisors_one_current on public.venture_supervisors (venture_id) where status in ('invited', 'active');
create index venture_supervisors_teacher_idx on public.venture_supervisors (teacher_id, status);
create index venture_supervisors_invited_by_idx on public.venture_supervisors (invited_by) where invited_by is not null;

create table public.supervisor_comments (
  id bigint generated always as identity primary key,
  venture_id uuid not null references public.ventures (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
comment on table public.supervisor_comments is 'The supervisor thread (PRD 5.21), separate from team chat. Members and the supervisor only.';
create index supervisor_comments_venture_idx on public.supervisor_comments (venture_id, created_at);
create index supervisor_comments_author_idx on public.supervisor_comments (author_id);

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status public.review_request_status not null default 'open',
  due_at timestamptz not null,
  remind7_at timestamptz,
  remind12_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open') = (closed_at is null))
);
comment on table public.review_requests is 'Review requests (PRD 5.21): from the owner, or started by the supervisor. Due in 14 days.';
create unique index review_requests_one_open on public.review_requests (venture_id, teacher_id) where status = 'open';
create index review_requests_teacher_idx on public.review_requests (teacher_id, status, due_at);
create index review_requests_requested_by_idx on public.review_requests (requested_by);
create index review_requests_venture_idx on public.review_requests (venture_id);

create table public.venture_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.review_requests (id) on delete cascade,
  venture_id uuid not null references public.ventures (id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade,
  -- {"scope": {"score": 1-5, "comment": "..."}, "technical": ..., "collaboration": ..., "documentation": ..., "outcome": ...}
  rubric jsonb not null check (jsonb_typeof(rubric) = 'object'),
  comments text check (comments is null or char_length(comments) <= 2000),
  average numeric(3, 2) not null check (average between 1 and 5),
  created_at timestamptz not null default now()
);
comment on table public.venture_reviews is 'Faculty reviews, rubric v1 (PRD 5.21). The CV shows a badge only, never the scores.';
create index venture_reviews_venture_idx on public.venture_reviews (venture_id);
create index venture_reviews_teacher_idx on public.venture_reviews (teacher_id);

-- A teacher who gives more than 30% of their last 90 days of endorsements to one student is
-- flagged for a trust reviewer (PRD 5.21). The reviewer decides; nothing is removed automatically.
create table public.teacher_concentration_flags (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (user_id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  given integer not null check (given >= 1),
  total integer not null check (total >= given),
  status public.review_flag_status not null default 'open',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 2000),
  created_at timestamptz not null default now(),
  check ((status = 'open') = (reviewed_at is null))
);
create unique index teacher_concentration_flags_one_open on public.teacher_concentration_flags (teacher_id, student_id) where status = 'open';
create index teacher_concentration_flags_student_idx on public.teacher_concentration_flags (student_id);
create index teacher_concentration_flags_reviewed_by_idx on public.teacher_concentration_flags (reviewed_by) where reviewed_by is not null;

alter table public.contribution_confirmations
  add column confirmer_role text not null default 'peer' check (confirmer_role in ('peer', 'supervisor'));
alter table public.endorsements
  add column endorser_kind text not null default 'peer' check (endorser_kind in ('peer', 'teacher'));
alter table public.code_checks
  add column due_at timestamptz,
  add column routed_to_staff_at timestamptz;
comment on column public.code_checks.routed_to_staff_at is
  'When the check moved from the university''s teachers to Skilient reviewers (null: still with the teachers).';
-- Every check already waiting was with Skilient reviewers.
update public.code_checks set routed_to_staff_at = now(), due_at = submitted_at + interval '72 hours' where status = 'submitted';

-- ---------------------------------------------------------------------------
-- RLS: reads only; every write is a function below
-- ---------------------------------------------------------------------------
alter table public.teacher_profiles enable row level security;
alter table public.teacher_settings enable row level security;
alter table public.faculty_csv_entries enable row level security;
alter table public.project_ideas enable row level security;
alter table public.venture_supervisors enable row level security;
alter table public.supervisor_comments enable row level security;
alter table public.review_requests enable row level security;
alter table public.venture_reviews enable row level security;
alter table public.teacher_concentration_flags enable row level security;
revoke all on table public.teacher_profiles, public.teacher_settings, public.faculty_csv_entries, public.project_ideas,
  public.venture_supervisors, public.supervisor_comments, public.review_requests, public.venture_reviews,
  public.teacher_concentration_flags from anon, authenticated;
grant select on table public.teacher_profiles, public.teacher_settings, public.project_ideas, public.venture_supervisors,
  public.supervisor_comments, public.review_requests, public.venture_reviews to authenticated;

create policy teacher_profiles_read_own on public.teacher_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy teacher_settings_read_own on public.teacher_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy project_ideas_read on public.project_ideas for select to authenticated
  using (teacher_id = (select auth.uid()) or audience = 'global' or university_id = (select private.current_university_id()));
create policy venture_supervisors_read on public.venture_supervisors for select to authenticated
  using (teacher_id = (select auth.uid()) or private.is_venture_member(venture_id));
create policy review_requests_read on public.review_requests for select to authenticated
  using (teacher_id = (select auth.uid()) or requested_by = (select auth.uid()) or private.is_venture_member(venture_id));
create policy venture_reviews_read on public.venture_reviews for select to authenticated
  using (teacher_id = (select auth.uid()) or private.is_venture_member(venture_id));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.is_approved_teacher(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teacher_profiles t where t.user_id = p_user and t.status = 'approved');
$$;

create function private.require_teacher()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or not private.is_approved_teacher(v_me) then
    raise exception 'approved teachers only' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

create function private.is_uni_admin_of(p_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                  where p.user_id = (select auth.uid()) and p.role = 'university_admin' and p.university_id = p_university);
$$;

-- The caller supervises the venture right now.
create function private.is_venture_supervisor(p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venture_supervisors s
     where s.venture_id = p_venture and s.teacher_id = (select auth.uid()) and s.status = 'active'
       and private.is_approved_teacher(s.teacher_id));
$$;

-- A teacher who supervises the venture, or holds an open review request for it, reads its full data.
create function private.is_venture_teacher(p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_venture_supervisor(p_venture)
      or exists (
        select 1 from public.review_requests r
         where r.venture_id = p_venture and r.teacher_id = (select auth.uid()) and r.status = 'open'
           and private.is_approved_teacher(r.teacher_id));
$$;
revoke all on function private.is_approved_teacher(uuid), private.require_teacher(), private.is_uni_admin_of(uuid),
  private.is_venture_supervisor(uuid), private.is_venture_teacher(uuid) from public;
grant execute on function private.is_approved_teacher(uuid), private.is_uni_admin_of(uuid), private.is_venture_supervisor(uuid),
  private.is_venture_teacher(uuid) to authenticated;

-- Teachers read full venture data only where they supervise or hold an open review request;
-- otherwise they see what a student at their university sees.
create or replace function private.can_view_venture(p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ventures v
     where v.id = p_venture
       and not private.is_blocked_with(v.owner_id)
       and (
         v.visibility = 'public'
         or (v.visibility = 'university' and v.university_id = private.current_university_id())
         or private.is_venture_member(v.id)
         or private.has_venture_invite(v.id)
         or private.is_venture_teacher(v.id)
       )
  );
$$;

drop policy ventures_read on public.ventures;
create policy ventures_read on public.ventures for select to authenticated
  using (
    not private.is_blocked_with(owner_id)
    and (
      visibility = 'public'
      or (visibility = 'university' and university_id = (select private.current_university_id()))
      or private.is_venture_member(id)
      or private.has_venture_invite(id)
      or private.is_venture_teacher(id)
    )
  );
drop policy venture_deliverables_read on public.venture_deliverables;
create policy venture_deliverables_read on public.venture_deliverables for select to authenticated
  using (private.is_venture_member(venture_id) or private.is_venture_teacher(venture_id));
create policy supervisor_comments_read on public.supervisor_comments for select to authenticated
  using (private.is_venture_member(venture_id) or private.is_venture_supervisor(venture_id));

-- ---------------------------------------------------------------------------
-- Notifications: one "Faculty" category, in-app only (the weekly digest is separate)
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('faculty', 'Faculty supervision and reviews', 'Supervisors, reviews and teacher updates. Teachers get one weekly digest instead of emails.', 11, 'off', false);
insert into public.notification_types (type, category, emailed) values
  ('teacher_decided', 'faculty', false),
  ('supervision_requested', 'faculty', false),
  ('supervision_answered', 'faculty', false),
  ('supervisor_comment', 'faculty', false),
  ('supervisor_confirmed', 'faculty', false),
  ('review_requested', 'faculty', false),
  ('review_reminder', 'faculty', false),
  ('review_received', 'faculty', false),
  ('review_expired', 'faculty', false);

-- ---------------------------------------------------------------------------
-- Signup: faculty accounts (validate_signup, handle_new_user, email checks)
-- ---------------------------------------------------------------------------
create function private.domain_admits_faculty(p_domain text, p_university_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.university_domains d
     where d.domain = p_domain and d.kind in ('faculty', 'both')
       and (p_university_id is null or d.university_id = p_university_id));
$$;
revoke all on function private.domain_admits_faculty(text, uuid) from public;

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
  -- Students and faculty sign up here; recruiters (phase 8) and university admins (phase 9) get
  -- their own checks when their flows exist.
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
  -- Only email signups carry our own metadata, and only student and faculty can be asked for.
  if v_provider = 'email' and (v_meta ->> 'role') = 'faculty' then
    v_role := 'faculty';
  end if;

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
       and (case when p.role = 'faculty'
                 then private.domain_admits_faculty(private.email_domain(u.email), p.university_id)
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
begin
  select p.university_id, p.role into v_university, v_role
    from public.profiles p
   where p.user_id = new.id and p.role in ('student', 'faculty');
  if not found then
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
-- Verification: request, approve, revoke, faculty CSV
-- ---------------------------------------------------------------------------
create function private.notify_teacher_decided(p_user uuid, p_approved boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.notify(p_user, null, 'teacher_decided', 'teacher', p_user, jsonb_build_object('approved', p_approved));
$$;
revoke all on function private.notify_teacher_decided(uuid, boolean) from public;

create function private.request_teacher_role(p_department text, p_title text)
returns public.teacher_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  p public.profiles;
  t public.teacher_profiles;
  v_email text;
  v_dept text := btrim(coalesce(p_department, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_csv boolean;
begin
  select * into p from public.profiles where user_id = v_me;
  if p.role <> 'faculty' or p.university_id is null then
    raise exception 'only faculty accounts can ask for the teacher role' using errcode = '42501';
  end if;
  if char_length(v_dept) not between 2 and 80 or char_length(v_title) not between 2 and 80 then
    raise exception 'enter your department and title' using errcode = '22023';
  end if;
  if not private.rate_limit('teacher_request:' || v_me::text, 5, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select * into t from public.teacher_profiles where user_id = v_me for update;
  if found and t.status = 'approved' then
    raise exception 'you are already an approved teacher' using errcode = '55000';
  end if;
  if found and t.status = 'revoked' then
    raise exception 'your university removed your teacher role; ask them to approve you again' using errcode = '55000';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_me;
  v_csv := exists (select 1 from public.faculty_csv_entries c where c.university_id = p.university_id and c.email = v_email);
  insert into public.teacher_profiles (user_id, university_id, department, title, status, approved_at, approval_source)
  values (v_me, p.university_id, v_dept, v_title,
          case when v_csv then 'approved' else 'pending' end::public.teacher_status,
          case when v_csv then now() end, case when v_csv then 'csv' end)
  on conflict (user_id) do update set department = excluded.department, title = excluded.title, requested_at = now()
  returning * into t;
  if v_csv then
    perform private.notify_teacher_decided(v_me, true);
  end if;
  return t.status;
end;
$$;

-- Approval is by the teacher's university admin or Skilient accounts staff (two-factor).
create function private.approve_teacher(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  t public.teacher_profiles;
  v_staff boolean := private.is_staff('accounts');
begin
  select * into t from public.teacher_profiles where user_id = p_user for update;
  if not found then
    raise exception 'teacher request not found' using errcode = 'P0002';
  end if;
  if not (v_staff or private.is_uni_admin_of(t.university_id)) then
    raise exception 'only the university admin or Skilient accounts staff can approve teachers' using errcode = '42501';
  end if;
  if t.status = 'approved' then
    raise exception 'already approved' using errcode = '55000';
  end if;
  update public.teacher_profiles
     set status = 'approved', approved_by = v_me, approved_at = now(), revoked_by = null, revoked_at = null,
         approval_source = case when v_staff then 'staff' else 'university_admin' end
   where user_id = p_user;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'teacher.approve', 'teacher', p_user::text, 'approved the teacher role',
          jsonb_build_object('status', t.status), jsonb_build_object('status', 'approved'));
  perform private.notify_teacher_decided(p_user, true);
end;
$$;

create function private.revoke_teacher(p_user uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  t public.teacher_profiles;
begin
  select * into t from public.teacher_profiles where user_id = p_user for update;
  if not found then
    raise exception 'teacher not found' using errcode = 'P0002';
  end if;
  if not (private.is_staff('accounts') or private.is_uni_admin_of(t.university_id)) then
    raise exception 'only the university admin or Skilient accounts staff can remove teachers' using errcode = '42501';
  end if;
  if t.status = 'revoked' then
    raise exception 'already removed' using errcode = '55000';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  update public.teacher_profiles set status = 'revoked', revoked_by = v_me, revoked_at = now() where user_id = p_user;
  -- Past reviews and endorsements stay ("former faculty"); what is still open ends.
  update public.venture_supervisors set status = 'ended', ended_at = now() where teacher_id = p_user and status in ('invited', 'active');
  update public.review_requests set status = 'cancelled', closed_at = now() where teacher_id = p_user and status = 'open';
  update public.code_checks set claimed_by = null, claimed_at = null where claimed_by = p_user and status = 'submitted';
  update public.project_ideas set status = 'closed' where teacher_id = p_user and status = 'open';
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'teacher.revoke', 'teacher', p_user::text, left(btrim(p_reason), 2000),
          jsonb_build_object('status', t.status), jsonb_build_object('status', 'revoked'));
  perform private.notify_teacher_decided(p_user, false);
end;
$$;

-- p_rows: [{"email": "...", "department": "...", "title": "..."}]. Adds the emails as pre-approved
-- and approves matching pending requests at that university.
create function private.import_faculty_csv(p_university uuid, p_rows jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_n integer := 0;
  v_row jsonb;
  v_email text;
  r record;
begin
  if not (private.is_staff('accounts') or private.is_uni_admin_of(p_university)) then
    raise exception 'only the university admin or Skilient accounts staff can import faculty' using errcode = '42501';
  end if;
  if not exists (select 1 from public.universities where id = p_university) then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'send between 1 and 2000 rows' using errcode = '22023';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(btrim(coalesce(v_row ->> 'email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+$' or char_length(v_email) > 254 then
      raise exception 'not an email address: %', left(v_email, 60) using errcode = '22023';
    end if;
    insert into public.faculty_csv_entries (university_id, email, department, title, imported_by)
    values (p_university, v_email, left(nullif(btrim(v_row ->> 'department'), ''), 80), left(nullif(btrim(v_row ->> 'title'), ''), 80), v_me)
    on conflict (university_id, email) do update set department = excluded.department, title = excluded.title;
    v_n := v_n + 1;
  end loop;
  for r in
    update public.teacher_profiles t
       set status = 'approved', approved_at = now(), approved_by = v_me, approval_source = 'csv'
      from auth.users u
     where u.id = t.user_id and t.university_id = p_university and t.status = 'pending'
       and exists (select 1 from public.faculty_csv_entries c where c.university_id = p_university and c.email = lower(u.email))
    returning t.user_id
  loop
    perform private.notify_teacher_decided(r.user_id, true);
  end loop;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'teacher.import_csv', 'university', p_university::text, 'imported ' || v_n || ' faculty emails', null,
          jsonb_build_object('rows', v_n));
  return v_n;
end;
$$;

create function private.require_accounts_or_admin(p_university uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff('accounts') or (p_university is not null and private.is_uni_admin_of(p_university))) then
    raise exception 'accounts staff only, with two-factor on' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_accounts_or_admin(uuid) from public;

-- The staff list of teacher requests: pending first, then recent decisions.
create function private.teacher_requests(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts_or_admin(null);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', t.user_id, 'name', p.full_name, 'email', u.email, 'university_id', t.university_id,
             'university', un.name, 'department', t.department, 'title', t.title, 'status', t.status,
             'requested_at', t.requested_at, 'approval_source', t.approval_source, 'decided_at', coalesce(t.revoked_at, t.approved_at))
           order by case when p_status = 'pending' then t.requested_at end asc, coalesce(t.revoked_at, t.approved_at) desc)
      from (select * from public.teacher_profiles x
             where (p_status = 'pending' and x.status = 'pending')
                or (p_status = 'decided' and x.status in ('approved', 'revoked'))
             order by x.requested_at desc
             limit 200) t
      join public.profiles p on p.user_id = t.user_id
      join auth.users u on u.id = t.user_id
      join public.universities un on un.id = t.university_id), '[]'::jsonb);
end;
$$;

create function private.ops_universities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts_or_admin(null);
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name) from public.universities u), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher state, home, settings
-- ---------------------------------------------------------------------------
create function private.teacher_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('status', t.status, 'department', t.department, 'title', t.title,
                            'university_id', t.university_id, 'university', u.name)
    from public.teacher_profiles t
    join public.universities u on u.id = t.university_id
   where t.user_id = (select auth.uid());
$$;

create function private.pk_week_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
$$;
revoke all on function private.pk_week_start() from public;

-- Checks a teacher holds plus those they graded this week (Pakistan time, Monday start).
create function private.teacher_week_grading(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.code_checks c where c.claimed_by = p_user and c.status = 'submitted')::integer
       + (select count(*) from public.code_checks c where c.grader_id = p_user and c.graded_at >= private.pk_week_start())::integer;
$$;
revoke all on function private.teacher_week_grading(uuid) from public;

-- Skilient staff grade with their own (trust reviewer) tools; teachers have their own queue.
create function private.teacher_conflict(p_teacher uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.code_check_conflict(p_teacher, p_student)
      or exists (select 1 from public.venture_supervisors s
                   join public.venture_members m on m.venture_id = s.venture_id
                  where s.teacher_id = p_teacher and m.user_id = p_student and s.status in ('active', 'ended'));
$$;
revoke all on function private.teacher_conflict(uuid, uuid) from public;

create function private.teacher_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  s public.teacher_settings;
  t public.teacher_profiles;
  v_uni uuid;
begin
  select * into t from public.teacher_profiles where user_id = v_me;
  select * into s from public.teacher_settings where user_id = v_me;
  v_uni := t.university_id;
  return jsonb_build_object(
    'department', t.department, 'title', t.title,
    'invites', (select count(*) from public.venture_supervisors x where x.teacher_id = v_me and x.status = 'invited'),
    'review_requests', (select count(*) from public.review_requests x where x.teacher_id = v_me and x.status = 'open'),
    'supervising', (select count(*) from public.venture_supervisors x where x.teacher_id = v_me and x.status = 'active'),
    'supervise_cap', private.teacher_limit('supervisions_max'),
    'ideas_open', (select count(*) from public.project_ideas i where i.teacher_id = v_me and private.idea_is_open(i)),
    'checks_available', case when coalesce(s.grading_opt_in, false) then (
        select count(*) from public.code_checks c
          join public.profiles sp on sp.user_id = c.user_id
         where c.status = 'submitted' and c.routed_to_staff_at is null and c.claimed_by is null
           and sp.university_id = v_uni and c.skill_id = any (s.grading_skills)
           and not private.teacher_conflict(v_me, c.user_id)) else 0 end,
    'checks_mine', (select count(*) from public.code_checks c where c.claimed_by = v_me and c.status = 'submitted'),
    'grading_opt_in', coalesce(s.grading_opt_in, false),
    'grading_used', private.teacher_week_grading(v_me),
    'grading_cap', coalesce(s.weekly_grading_cap, private.teacher_limit('grading_cap_default')),
    'endorsements_month', (select count(*) from public.endorsements e where e.endorser_id = v_me and e.created_at >= private.pk_month_start()),
    'endorsements_limit', private.teacher_limit('endorsements_per_month'));
end;
$$;

create function private.teacher_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  s public.teacher_settings;
begin
  select * into s from public.teacher_settings where user_id = v_me;
  return jsonb_build_object(
    'grading_opt_in', coalesce(s.grading_opt_in, false),
    'weekly_grading_cap', coalesce(s.weekly_grading_cap, private.teacher_limit('grading_cap_default')),
    'digest', coalesce(s.digest, true),
    'grading_skills', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.name)
                                  from public.skills k where k.id = any (coalesce(s.grading_skills, '{}'))), '[]'::jsonb));
end;
$$;

create function private.save_teacher_settings(p_opt_in boolean, p_cap integer, p_skills text[], p_digest boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  v_skills text[] := private.valid_skill_ids(coalesce(p_skills, '{}'));
begin
  if p_cap is null or p_cap not between 1 and 50 then
    raise exception 'the weekly limit is between 1 and 50' using errcode = '22023';
  end if;
  if coalesce(p_opt_in, false) and cardinality(v_skills) = 0 then
    raise exception 'choose at least one skill to grade' using errcode = '22023';
  end if;
  if cardinality(v_skills) > 30 then
    raise exception 'choose up to 30 skills' using errcode = '22023';
  end if;
  insert into public.teacher_settings (user_id, grading_opt_in, weekly_grading_cap, grading_skills, digest)
  values (v_me, coalesce(p_opt_in, false), p_cap, v_skills, coalesce(p_digest, true))
  on conflict (user_id) do update
    set grading_opt_in = excluded.grading_opt_in, weekly_grading_cap = excluded.weekly_grading_cap,
        grading_skills = excluded.grading_skills, digest = excluded.digest, updated_at = now();
  -- Opting out gives back what they hold.
  if not coalesce(p_opt_in, false) then
    update public.code_checks set claimed_by = null, claimed_at = null where claimed_by = v_me and status = 'submitted';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Project ideas
-- ---------------------------------------------------------------------------
-- Open: not closed by the teacher, before its deadline (end of that day, Pakistan time), and
-- fewer teams than its limit (abandoned ventures free their place).
create function private.idea_teams(p_idea uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.ventures v where v.idea_id = p_idea and v.status <> 'abandoned';
$$;

create function private.idea_is_open(i public.project_ideas)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select i.status = 'open'
     and (i.deadline is null or i.deadline >= (now() at time zone 'Asia/Karachi')::date)
     and private.idea_teams(i.id) < i.max_teams;
$$;
revoke all on function private.idea_teams(uuid), private.idea_is_open(public.project_ideas) from public;

create function private.idea_json(i public.project_ideas)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'teacher_id', i.teacher_id, 'teacher_name', p.full_name, 'teacher_department', tp.department,
    'teacher_title', tp.title, 'former_faculty', tp.status = 'revoked', 'university', un.name,
    'title', i.title, 'brief', i.brief, 'difficulty', i.difficulty, 'team_size', i.team_size,
    'duration_weeks', i.duration_weeks, 'deliverables', i.deliverables, 'max_teams', i.max_teams,
    'deadline', i.deadline, 'course_label', i.course_label, 'audience', i.audience, 'status', i.status,
    'teams', private.idea_teams(i.id), 'is_open', private.idea_is_open(i), 'created_at', i.created_at,
    'skills', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.name)
                          from public.skills k where k.id = any (i.skills)), '[]'::jsonb))
    from public.teacher_profiles tp
    join public.profiles p on p.user_id = tp.user_id
    join public.universities un on un.id = i.university_id
   where tp.user_id = i.teacher_id;
$$;
revoke all on function private.idea_json(public.project_ideas) from public;

create function private.save_idea(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  t public.teacher_profiles;
  i public.project_ideas;
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_brief text := btrim(coalesce(p ->> 'brief', ''));
  v_skills text[] := private.valid_skill_ids(coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'skills', '[]'::jsonb))), '{}'));
  v_diff public.idea_difficulty;
  v_size smallint;
  v_weeks smallint;
  v_deliv text := btrim(coalesce(p ->> 'deliverables', ''));
  v_max smallint := coalesce(nullif(p ->> 'max_teams', '')::smallint, 3);
  v_deadline date := nullif(p ->> 'deadline', '')::date;
  v_label text := nullif(btrim(coalesce(p ->> 'course_label', '')), '');
  v_aud public.idea_audience := coalesce(nullif(p ->> 'audience', '')::public.idea_audience, 'university');
  v_id uuid;
begin
  v_diff := (p ->> 'difficulty')::public.idea_difficulty;
  v_size := (p ->> 'team_size')::smallint;
  v_weeks := (p ->> 'duration_weeks')::smallint;
  if char_length(v_title) not between 3 and 100 or char_length(v_brief) not between 1 and 2000
     or char_length(v_deliv) not between 1 and 500 or cardinality(v_skills) not between 1 and 10
     or v_size not between 2 and 6 or v_weeks not between 1 and 52 or v_max not between 1 and 50
     or (v_label is not null and char_length(v_label) > 60) then
    raise exception 'check the idea''s fields' using errcode = '22023';
  end if;
  if v_deadline is not null and v_deadline < (now() at time zone 'Asia/Karachi')::date then
    raise exception 'the deadline can''t be in the past' using errcode = '22023';
  end if;
  select * into t from public.teacher_profiles where user_id = v_me;
  if p_id is null then
    if not private.rate_limit('idea:' || v_me::text, private.teacher_limit('ideas_per_day')::integer, interval '1 day') then
      raise exception 'rate limited' using errcode = '54000';
    end if;
    insert into public.project_ideas (teacher_id, university_id, title, brief, skills, difficulty, team_size, duration_weeks,
                                      deliverables, max_teams, deadline, course_label, audience)
    values (v_me, t.university_id, v_title, v_brief, v_skills, v_diff, v_size, v_weeks, v_deliv, v_max, v_deadline, v_label, v_aud)
    returning id into v_id;
    return v_id;
  end if;
  select * into i from public.project_ideas where id = p_id and teacher_id = v_me for update;
  if not found then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;
  -- Once a team has started from the idea, only its limits and label can change.
  if private.idea_teams(p_id) > 0 and (v_title, v_brief, v_skills, v_diff, v_size, v_weeks, v_deliv)
       is distinct from (i.title, i.brief, i.skills, i.difficulty, i.team_size, i.duration_weeks, i.deliverables) then
    raise exception 'a team has started from this idea, so only its team limit, deadline, label and audience can change' using errcode = '55000';
  end if;
  if v_max < private.idea_teams(p_id) then
    raise exception 'the limit can''t be below the % teams already started', private.idea_teams(p_id) using errcode = '23514';
  end if;
  update public.project_ideas
     set title = v_title, brief = v_brief, skills = v_skills, difficulty = v_diff, team_size = v_size, duration_weeks = v_weeks,
         deliverables = v_deliv, max_teams = v_max, deadline = v_deadline, course_label = v_label, audience = v_aud
   where id = p_id;
  return p_id;
end;
$$;

create function private.set_idea_status(p_id uuid, p_open boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  i public.project_ideas;
begin
  select * into i from public.project_ideas where id = p_id and teacher_id = v_me for update;
  if not found then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;
  if p_open and i.deadline is not null and i.deadline < (now() at time zone 'Asia/Karachi')::date then
    raise exception 'move the deadline before reopening this idea' using errcode = '55000';
  end if;
  update public.project_ideas set status = case when p_open then 'open' else 'closed' end::public.idea_status where id = p_id;
end;
$$;

-- p_mine: the caller's own ideas (any status); otherwise open ideas they can see: their
-- university's and global ones. Never ordered by anything but date.
create function private.ideas_list(p_mine boolean default false, p_skill text default null, p_difficulty text default null,
                                    p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_uni uuid := private.current_university_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_ids uuid[];
begin
  v_ids := array(
    select i.id from public.project_ideas i
     where (case when coalesce(p_mine, false) then i.teacher_id = v_me
                 else (i.audience = 'global' or i.university_id = v_uni) and private.idea_is_open(i) end)
       and (p_skill is null or p_skill = any (i.skills))
       and (p_difficulty is null or i.difficulty::text = p_difficulty)
     order by i.created_at desc
     limit v_limit);
  return coalesce((select jsonb_agg(private.idea_json(i) order by i.created_at desc)
                     from public.project_ideas i where i.id = any (v_ids)), '[]'::jsonb);
end;
$$;

create function private.idea_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  i public.project_ideas;
  v_json jsonb;
begin
  select * into i from public.project_ideas where id = p_id;
  if not found or not (i.teacher_id = v_me or i.audience = 'global' or i.university_id = private.current_university_id()) then
    return null;
  end if;
  v_json := private.idea_json(i);
  -- The teacher sees which teams started from the idea.
  if i.teacher_id = v_me then
    v_json := v_json || jsonb_build_object('ventures', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'status', v.status, 'members',
                                          (select count(*) from public.venture_members m where m.venture_id = v.id))
                       order by v.created_at)
        from public.ventures v where v.idea_id = i.id), '[]'::jsonb));
  end if;
  return v_json;
end;
$$;

-- "Start a venture from this idea": the student's prefilled form creates a normal venture, linked
-- to the idea, and the idea's teacher is invited to supervise it.
create function private.start_venture_from_idea(p_idea uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  i public.project_ideas;
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where user_id = v_me and role = 'student' and status = 'active') then
    raise exception 'only active students start ventures' using errcode = '42501';
  end if;
  select * into i from public.project_ideas where id = p_idea for update;
  if not found or not (i.audience = 'global' or i.university_id = private.current_university_id()) then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;
  if not private.idea_is_open(i) then
    raise exception 'this idea is closed: it reached its team limit or its deadline' using errcode = '55000';
  end if;
  v_id := private.create_venture(p || jsonb_build_object('type', 'project'));
  update public.ventures set idea_id = i.id where id = v_id;
  if private.is_approved_teacher(i.teacher_id) then
    insert into public.venture_supervisors (venture_id, teacher_id, invited_by) values (v_id, i.teacher_id, v_me);
    perform private.notify(i.teacher_id, v_me, 'supervision_requested', 'venture', v_id,
                           private.venture_data(v_id) || jsonb_build_object('idea_title', i.title));
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supervision
-- ---------------------------------------------------------------------------
create function private.invite_supervisor(p_venture uuid, p_teacher uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
  v_me uuid := (select auth.uid());
begin
  if v.status not in ('recruiting', 'in_progress') then
    raise exception 'this venture is %', v.status using errcode = '55000';
  end if;
  if not exists (select 1 from public.teacher_profiles t
                  where t.user_id = p_teacher and t.status = 'approved' and t.university_id = v.university_id) then
    raise exception 'choose an approved teacher at your university' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.venture_members m where m.venture_id = p_venture and m.user_id = p_teacher) then
    raise exception 'a team member can''t supervise' using errcode = '22023';
  end if;
  if exists (select 1 from public.venture_supervisors s where s.venture_id = p_venture and s.status in ('invited', 'active')) then
    raise exception 'this venture already has a supervisor or a pending invite' using errcode = '23505';
  end if;
  if not private.rate_limit('supervise_invite:' || v_me::text, 10, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.venture_supervisors (venture_id, teacher_id, invited_by) values (p_venture, p_teacher, v_me);
  perform private.notify(p_teacher, v_me, 'supervision_requested', 'venture', p_venture, private.venture_data(p_venture));
end;
$$;

create function private.respond_supervision(p_venture uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  s public.venture_supervisors;
  v public.ventures;
begin
  -- The cap holds under parallel accepts.
  perform pg_advisory_xact_lock(hashtextextended('supervise:' || v_me::text, 0));
  select * into s from public.venture_supervisors where venture_id = p_venture and teacher_id = v_me and status = 'invited' for update;
  if not found then
    raise exception 'no invite to answer' using errcode = 'P0002';
  end if;
  select * into v from public.ventures where id = p_venture for update;
  if coalesce(p_accept, false) then
    if v.status not in ('recruiting', 'in_progress') then
      raise exception 'this venture is %', v.status using errcode = '55000';
    end if;
    if (select count(*) from public.venture_supervisors x where x.teacher_id = v_me and x.status = 'active')
         >= private.teacher_limit('supervisions_max') then
      raise exception 'you supervise % ventures already, which is the most at once', private.teacher_limit('supervisions_max')::integer
        using errcode = '23514';
    end if;
    update public.venture_supervisors set status = 'active', started_at = now() where id = s.id;
  else
    update public.venture_supervisors set status = 'ended', ended_at = now() where id = s.id;
  end if;
  perform private.notify(v.owner_id, v_me, 'supervision_answered', 'venture', p_venture,
                         private.venture_data(p_venture) || jsonb_build_object('accepted', coalesce(p_accept, false)));
end;
$$;

create function private.end_supervision(p_venture uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  s public.venture_supervisors;
  v public.ventures;
begin
  select * into s from public.venture_supervisors where venture_id = p_venture and status in ('invited', 'active') for update;
  if not found then
    raise exception 'this venture has no supervisor' using errcode = 'P0002';
  end if;
  select * into v from public.ventures where id = p_venture;
  if s.teacher_id <> v_me and v.owner_id <> v_me then
    raise exception 'only the supervisor or the owner can end supervision' using errcode = '42501';
  end if;
  update public.venture_supervisors set status = 'ended', ended_at = now() where id = s.id;
  perform private.notify(case when v_me = s.teacher_id then v.owner_id else s.teacher_id end, v_me, 'supervision_answered', 'venture',
                         p_venture, private.venture_data(p_venture) || jsonb_build_object('accepted', false, 'ended', true));
end;
$$;

-- Who supervises the venture now, for anyone who can see it.
create function private.supervision_for(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  s public.venture_supervisors;
  v public.ventures;
begin
  if not private.can_view_venture(p_venture) then
    return null;
  end if;
  select * into v from public.ventures where id = p_venture;
  select * into s from public.venture_supervisors where venture_id = p_venture and status in ('invited', 'active');
  if not found or (s.status = 'invited' and v_me not in (v.owner_id, s.teacher_id)) then
    return null;
  end if;
  return (select jsonb_build_object('teacher_id', s.teacher_id, 'name', p.full_name, 'department', t.department, 'title', t.title,
                                    'status', s.status, 'started_at', s.started_at)
            from public.teacher_profiles t join public.profiles p on p.user_id = t.user_id where t.user_id = s.teacher_id);
end;
$$;

-- Approved teachers the owner can ask to supervise or review.
create function private.teachers_for_venture(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.ventures;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or v.owner_id is distinct from (select auth.uid()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', t.user_id, 'name', p.full_name, 'department', t.department, 'title', t.title,
             'active', (select count(*) from public.venture_supervisors x where x.teacher_id = t.user_id and x.status = 'active'),
             'cap', private.teacher_limit('supervisions_max')) order by p.full_name)
      from public.teacher_profiles t
      join public.profiles p on p.user_id = t.user_id
     where t.status = 'approved' and t.university_id = v.university_id
       and not exists (select 1 from public.venture_members m where m.venture_id = p_venture and m.user_id = t.user_id)), '[]'::jsonb);
end;
$$;

create function private.post_supervisor_comment(p_venture uuid, p_body text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  s public.venture_supervisors;
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
  m record;
begin
  select * into s from public.venture_supervisors where venture_id = p_venture and status = 'active';
  if not (private.is_venture_member(p_venture) or (found and s.teacher_id = v_me and private.is_approved_teacher(v_me))) then
    raise exception 'members and the supervisor only' using errcode = '42501';
  end if;
  if not found then
    raise exception 'this venture has no supervisor yet' using errcode = '55000';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'write between 1 and 2000 characters' using errcode = '22023';
  end if;
  if not private.rate_limit('supervisor_comment:' || v_me::text, 60, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.supervisor_comments (venture_id, author_id, body) values (p_venture, v_me, v_body) returning id into v_id;
  if v_me = s.teacher_id then
    for m in select user_id from public.venture_members where venture_id = p_venture loop
      perform private.notify(m.user_id, v_me, 'supervisor_comment', 'venture', p_venture, private.venture_data(p_venture));
    end loop;
  else
    perform private.notify(s.teacher_id, v_me, 'supervisor_comment', 'venture', p_venture, private.venture_data(p_venture));
  end if;
  return v_id;
end;
$$;

create function private.supervisor_thread(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not (private.is_venture_member(p_venture) or private.is_venture_supervisor(p_venture)) then
    return null;
  end if;
  return jsonb_build_object(
    'supervisor_id', (select s.teacher_id from public.venture_supervisors s where s.venture_id = p_venture and s.status = 'active'),
    'me', v_me,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'author_id', c.author_id, 'author_name', p.full_name, 'body', c.body, 'created_at', c.created_at,
               'supervisor', exists (select 1 from public.teacher_profiles t where t.user_id = c.author_id))
             order by c.created_at, c.id)
        from (select * from public.supervisor_comments x where x.venture_id = p_venture order by x.created_at desc, x.id desc limit 200) c
        join public.profiles p on p.user_id = c.author_id), '[]'::jsonb));
end;
$$;

-- A supervisor confirms the version of an entry the timeline shows: faculty-confirmed, and
-- peer-verified (PRD 5.21).
create function private.supervisor_confirm_contribution(p_entry uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  o public.contributions;
  v_current uuid;
begin
  select * into o from public.contributions where id = p_entry;
  if not found or not private.is_venture_supervisor(o.venture_id) then
    raise exception 'contribution not found' using errcode = 'P0002';
  end if;
  if o.corrects_id is not null then
    raise exception 'confirm the entry, not a correction' using errcode = '22023';
  end if;
  if o.source <> 'manual' then
    raise exception 'GitHub entries are already verified' using errcode = '22023';
  end if;
  select c.id into v_current from public.contributions c
   where c.id = o.id or c.corrects_id = o.id
   order by c.created_at desc, (c.id = o.id)
   limit 1;
  insert into public.contribution_confirmations (contribution_id, confirmer_id, confirmer_role)
  values (v_current, v_me, 'supervisor')
  on conflict do nothing;
  if found then
    perform private.notify(o.user_id, v_me, 'supervisor_confirmed', 'venture', o.venture_id, private.venture_data(o.venture_id));
  end if;
  return true;
end;
$$;

create or replace view public.contributions_with_status
with (security_invoker = true)
as
select o.id,
       o.venture_id,
       o.user_id,
       e.id as current_id,
       e.kind,
       e.description,
       e.evidence_url,
       e.hours,
       o.source,
       o.commit_sha,
       o.created_at,
       case when e.id <> o.id then e.created_at end as corrected_at,
       (select count(*)::integer from public.contribution_confirmations k where k.contribution_id = e.id) as confirmations,
       ((o.source = 'github' and not o.before_venture)
         or exists (select 1 from public.contribution_confirmations k where k.contribution_id = e.id)) as peer_verified,
       exists (select 1 from public.contribution_confirmations k
                where k.contribution_id = e.id and k.confirmer_id = (select auth.uid())) as confirmed_by_me,
       exists (select 1 from public.venture_members m where m.venture_id = o.venture_id and m.user_id = o.user_id)
         as by_member,
       o.before_venture,
       e.skill_ids,
       exists (select 1 from public.contribution_confirmations k
                where k.contribution_id = e.id and k.confirmer_role = 'supervisor') as faculty_confirmed
  from public.contributions o
  cross join lateral (
    select c.* from public.contributions c
     where c.id = o.id or c.corrects_id = o.id
     order by c.created_at desc, (c.id = o.id)
     limit 1
  ) e
 where o.corrects_id is null;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create function private.request_review(p_venture uuid, p_teacher uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v.status not in ('in_progress', 'completed') then
    raise exception 'reviews open once the venture is in progress' using errcode = '55000';
  end if;
  if not exists (select 1 from public.teacher_profiles t
                  where t.user_id = p_teacher and t.status = 'approved' and t.university_id = v.university_id) then
    raise exception 'choose an approved teacher at your university' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.venture_members m where m.venture_id = p_venture and m.user_id = p_teacher) then
    raise exception 'a team member can''t review' using errcode = '22023';
  end if;
  if exists (select 1 from public.review_requests r where r.venture_id = p_venture and r.teacher_id = p_teacher and r.status = 'open') then
    raise exception 'that teacher already has an open review request for this venture' using errcode = '23505';
  end if;
  if (select count(*) from public.review_requests r where r.venture_id = p_venture and r.status = 'open')
       >= private.teacher_limit('open_review_requests_per_venture') then
    raise exception 'you have % open review requests; wait for an answer first', private.teacher_limit('open_review_requests_per_venture')::integer
      using errcode = '23514';
  end if;
  insert into public.review_requests (venture_id, teacher_id, requested_by, due_at)
  values (p_venture, p_teacher, v_me, now() + make_interval(days => private.teacher_limit('review_days')::integer))
  returning id into v_id;
  perform private.notify(p_teacher, v_me, 'review_requested', 'review', v_id, private.venture_data(p_venture));
  return v_id;
end;
$$;

-- The supervisor starts a review on their own.
create function private.start_review(p_venture uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  v public.ventures;
  v_id uuid;
begin
  if not private.is_venture_supervisor(p_venture) then
    raise exception 'only the venture''s supervisor can start a review' using errcode = '42501';
  end if;
  select * into v from public.ventures where id = p_venture;
  if v.status not in ('in_progress', 'completed') then
    raise exception 'reviews open once the venture is in progress' using errcode = '55000';
  end if;
  select id into v_id from public.review_requests where venture_id = p_venture and teacher_id = v_me and status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  insert into public.review_requests (venture_id, teacher_id, requested_by, due_at)
  values (p_venture, v_me, v_me, now() + make_interval(days => private.teacher_limit('review_days')::integer))
  returning id into v_id;
  return v_id;
end;
$$;

-- The teacher declines, or the owner withdraws, an open request.
create function private.close_review_request(p_request uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  r public.review_requests;
  v public.ventures;
begin
  select * into r from public.review_requests where id = p_request for update;
  if not found or r.status <> 'open' then
    raise exception 'review request not found' using errcode = 'P0002';
  end if;
  select * into v from public.ventures where id = r.venture_id;
  if v_me = r.teacher_id then
    update public.review_requests set status = 'declined', closed_at = now() where id = p_request;
    if r.requested_by <> v_me then
      perform private.notify(r.requested_by, v_me, 'review_expired', 'review', p_request,
                             private.venture_data(r.venture_id) || jsonb_build_object('declined', true));
    end if;
  elsif v_me = v.owner_id then
    update public.review_requests set status = 'cancelled', closed_at = now() where id = p_request;
  else
    raise exception 'review request not found' using errcode = 'P0002';
  end if;
end;
$$;

-- p_rubric: {"scope": {"score": 1-5, "comment": "..."}, "technical": ..., "collaboration": ...,
-- "documentation": ..., "outcome": ...} (PRD 5.21 rubric v1).
create function private.submit_review(p_request uuid, p_rubric jsonb, p_comments text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  r public.review_requests;
  v_keys text[] := array['scope', 'technical', 'collaboration', 'documentation', 'outcome'];
  v_key text;
  v_rubric jsonb := '{}'::jsonb;
  v_sum numeric := 0;
  v_score integer;
  v_comment text;
  v_id uuid;
  m record;
begin
  select * into r from public.review_requests where id = p_request and teacher_id = v_me for update;
  if not found or r.status <> 'open' then
    raise exception 'review request not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rubric) is distinct from 'object' then
    raise exception 'score each part of the rubric' using errcode = '22023';
  end if;
  foreach v_key in array v_keys loop
    begin
      v_score := (p_rubric -> v_key ->> 'score')::integer;
    exception when others then
      v_score := null;
    end;
    v_comment := btrim(coalesce(p_rubric -> v_key ->> 'comment', ''));
    if v_score is null or v_score not between 1 and 5 then
      raise exception 'score every part from 1 to 5' using errcode = '22023';
    end if;
    if char_length(v_comment) not between 3 and 500 then
      raise exception 'add a short comment to every part' using errcode = '22023';
    end if;
    v_rubric := v_rubric || jsonb_build_object(v_key, jsonb_build_object('score', v_score, 'comment', v_comment));
    v_sum := v_sum + v_score;
  end loop;
  if p_comments is not null and char_length(p_comments) > 2000 then
    raise exception 'keep the overall comment under 2000 characters' using errcode = '23514';
  end if;
  insert into public.venture_reviews (request_id, venture_id, teacher_id, rubric, comments, average)
  values (p_request, r.venture_id, v_me, v_rubric, nullif(btrim(coalesce(p_comments, '')), ''), round(v_sum / 5, 2))
  returning id into v_id;
  update public.review_requests set status = 'submitted', closed_at = now() where id = p_request;
  for m in select user_id from public.venture_members where venture_id = r.venture_id loop
    perform private.notify(m.user_id, v_me, 'review_received', 'venture', r.venture_id, private.venture_data(r.venture_id));
  end loop;
  return v_id;
end;
$$;

-- A venture's reviews for anyone who can see it: the scores and comments go to the team and the
-- reviewer only; everyone else sees that faculty reviewed it, who, and when.
create function private.venture_reviews_for(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_member boolean := private.is_venture_member(p_venture);
begin
  if not private.can_view_venture(p_venture) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'teacher_name', p.full_name, 'department', t.department, 'title', t.title,
             'former_faculty', t.status = 'revoked', 'created_at', r.created_at,
             'average', case when v_member or r.teacher_id = v_me then r.average end,
             'rubric', case when v_member or r.teacher_id = v_me then r.rubric end,
             'comments', case when v_member or r.teacher_id = v_me then r.comments end)
           order by r.created_at desc)
      from public.venture_reviews r
      join public.teacher_profiles t on t.user_id = r.teacher_id
      join public.profiles p on p.user_id = r.teacher_id
     where r.venture_id = p_venture), '[]'::jsonb);
end;
$$;

-- The owner's view of the review requests on their venture.
create function private.review_requests_for(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_venture_member(p_venture) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'teacher_name', p.full_name, 'status', r.status, 'due_at', r.due_at,
                                        'created_at', r.created_at) order by r.created_at desc)
      from public.review_requests r join public.profiles p on p.user_id = r.teacher_id
     where r.venture_id = p_venture), '[]'::jsonb);
end;
$$;

create function private.teacher_review_requests(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'venture_id', r.venture_id, 'venture_title', v.title, 'venture_status', v.status,
             'requested_by', rp.full_name, 'started_by_me', r.requested_by = v_me, 'status', r.status, 'due_at', r.due_at,
             'created_at', r.created_at, 'closed_at', r.closed_at)
           order by case when p_status = 'open' then r.due_at end asc, r.created_at desc)
      from (select * from public.review_requests x
             where x.teacher_id = v_me and ((p_status = 'open' and x.status = 'open') or (p_status <> 'open' and x.status <> 'open'))
             order by x.created_at desc limit 100) r
      join public.ventures v on v.id = r.venture_id
      join public.profiles rp on rp.user_id = r.requested_by), '[]'::jsonb);
end;
$$;

create function private.teacher_review_request(p_request uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  r public.review_requests;
begin
  select * into r from public.review_requests where id = p_request and teacher_id = v_me;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', r.id, 'venture_id', r.venture_id, 'venture_title', (select title from public.ventures where id = r.venture_id),
    'status', r.status, 'due_at', r.due_at, 'requested_by', (select full_name from public.profiles where user_id = r.requested_by),
    'review', (select jsonb_build_object('rubric', x.rubric, 'comments', x.comments, 'average', x.average, 'created_at', x.created_at)
                 from public.venture_reviews x where x.request_id = r.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- What a teacher sees of a venture they supervise or review
-- ---------------------------------------------------------------------------
create function private.teacher_venture(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  v public.ventures;
  s public.venture_supervisors;
  v_open uuid;
  v_reviewed boolean;
begin
  select * into s from public.venture_supervisors where venture_id = p_venture and teacher_id = v_me order by created_at desc limit 1;
  select id into v_open from public.review_requests where venture_id = p_venture and teacher_id = v_me and status = 'open';
  v_reviewed := exists (select 1 from public.venture_reviews r where r.venture_id = p_venture and r.teacher_id = v_me);
  if s.id is null and v_open is null and not v_reviewed then
    return null;
  end if;
  select * into v from public.ventures where id = p_venture;
  return jsonb_build_object(
    'id', v.id, 'title', v.title, 'description', v.description, 'status', v.status, 'type', v.type,
    'supervision', s.status, 'i_supervise', coalesce(s.status = 'active', false), 'open_request', v_open, 'reviewed', v_reviewed,
    'can_read', private.is_venture_teacher(p_venture),
    'can_endorse', v_reviewed or coalesce(s.status in ('active', 'ended'), false),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.name)
                          from public.skills k where k.id = any (v.skill_ids)), '[]'::jsonb),
    'idea', (select jsonb_build_object('id', i.id, 'title', i.title) from public.project_ideas i where i.id = v.idea_id),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name, 'role', m.team_role) order by m.joined_at)
                           from public.venture_members m join public.profiles p on p.user_id = m.user_id
                          where m.venture_id = p_venture), '[]'::jsonb));
end;
$$;

create function private.teacher_contributions(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_teacher();
  if not private.is_venture_teacher(p_venture) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'author', p.full_name, 'kind', c.kind, 'description', c.description, 'evidence_url', c.evidence_url,
             'hours', c.hours, 'source', c.source, 'peer_verified', c.peer_verified, 'faculty_confirmed', c.faculty_confirmed,
             'created_at', c.created_at) order by c.created_at desc)
      from public.contributions_with_status c join public.profiles p on p.user_id = c.user_id
     where c.venture_id = p_venture), '[]'::jsonb);
end;
$$;

create function private.teacher_deliverables(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_teacher();
  if not private.is_venture_teacher(p_venture) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'url', d.url) order by d.created_at)
                     from public.venture_deliverables d where d.venture_id = p_venture), '[]'::jsonb);
end;
$$;

-- Supervised ventures, invites, and ventures the teacher reviewed.
create function private.teacher_ventures()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'status', x.status, 'relation', x.relation,
                                        'members', x.members, 'since', x.since) order by x.rank, x.since desc)
      from (
        select v.id, v.title, v.status, 'supervising' as relation, 1 as rank, s.started_at as since,
               (select count(*) from public.venture_members m where m.venture_id = v.id) as members
          from public.venture_supervisors s join public.ventures v on v.id = s.venture_id
         where s.teacher_id = v_me and s.status = 'active'
        union all
        select v.id, v.title, v.status, 'invited', 0, s.created_at,
               (select count(*) from public.venture_members m where m.venture_id = v.id)
          from public.venture_supervisors s join public.ventures v on v.id = s.venture_id
         where s.teacher_id = v_me and s.status = 'invited'
        union all
        select v.id, v.title, v.status, 'reviewed', 2, max(r.created_at),
               (select count(*) from public.venture_members m where m.venture_id = v.id)
          from public.venture_reviews r join public.ventures v on v.id = r.venture_id
         where r.teacher_id = v_me
         group by v.id, v.title, v.status
        union all
        select v.id, v.title, v.status, 'ended', 3, s.ended_at,
               (select count(*) from public.venture_members m where m.venture_id = v.id)
          from public.venture_supervisors s join public.ventures v on v.id = s.venture_id
         where s.teacher_id = v_me and s.status = 'ended' and s.started_at is not null
      ) x), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher endorsements (weight 1.5, PRD 5.21)
-- ---------------------------------------------------------------------------
create function private.teacher_may_endorse(p_teacher uuid, p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.venture_reviews r where r.venture_id = p_venture and r.teacher_id = p_teacher)
      or exists (select 1 from public.venture_supervisors s
                  where s.venture_id = p_venture and s.teacher_id = p_teacher and s.status in ('active', 'ended') and s.started_at is not null);
$$;
revoke all on function private.teacher_may_endorse(uuid, uuid) from public;

-- p_items: [{"skill": "<skill id>", "evidence": "<contribution id>" | null}, ...]. Only members of
-- a venture the teacher reviewed or supervised, only for skills tagged in that venture.
create function private.teacher_endorse(p_endorsee uuid, p_venture uuid, p_items jsonb, p_note text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  v public.ventures;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_count integer;
  v_given integer;
  v_month integer;
  v_item jsonb;
  v_skill text;
  v_evidence uuid;
  v_names text[] := '{}';
  v_first uuid;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('endorse:' || v_me::text, 0));
  select * into v from public.ventures where id = p_venture;
  if not found or not private.teacher_may_endorse(v_me, p_venture) then
    raise exception 'you can endorse members of ventures you reviewed or supervised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.venture_members m where m.venture_id = p_venture and m.user_id = p_endorsee) then
    raise exception 'teammate not found' using errcode = 'P0002';
  end if;
  if v.status not in ('in_progress', 'completed') then
    raise exception 'endorsements open once the venture is in progress' using errcode = '55000';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'choose at least one skill' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if (select count(distinct e ->> 'skill') from jsonb_array_elements(p_items) e) <> v_count then
    raise exception 'each skill once' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'keep the note under 280 characters' using errcode = '23514';
  end if;
  select count(*)::integer into v_given from public.endorsements
   where endorser_id = v_me and endorsee_id = p_endorsee and venture_id = p_venture;
  if v_given + v_count > private.teacher_limit('per_teammate_per_venture') then
    raise exception 'you can endorse up to % skills per student per venture', private.teacher_limit('per_teammate_per_venture')::integer
      using errcode = '23514';
  end if;
  select count(*)::integer into v_month from public.endorsements
   where endorser_id = v_me and created_at >= private.pk_month_start();
  if v_month + v_count > private.teacher_limit('endorsements_per_month') then
    raise exception 'you can give up to % endorsements a month', private.teacher_limit('endorsements_per_month')::integer
      using errcode = '23514';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_skill := v_item ->> 'skill';
    if v_skill is null or not (v_skill = any (v.skill_ids))
       or not exists (select 1 from public.skills s where s.id = v_skill and s.retired_at is null) then
      raise exception 'that skill isn''t tagged in this venture' using errcode = '22023';
    end if;
    if exists (select 1 from public.endorsements
                where endorser_id = v_me and endorsee_id = p_endorsee and venture_id = p_venture and skill_id = v_skill) then
      raise exception 'you already endorsed them for %', (select name from public.skills where id = v_skill) using errcode = '23505';
    end if;
    v_evidence := null;
    if nullif(v_item ->> 'evidence', '') is not null then
      begin
        v_evidence := (v_item ->> 'evidence')::uuid;
      exception when invalid_text_representation then
        raise exception 'that evidence isn''t one of their entries in this venture' using errcode = '22023';
      end;
      if not exists (select 1 from public.contributions c
                      where c.id = v_evidence and c.venture_id = p_venture and c.user_id = p_endorsee and c.corrects_id is null) then
        raise exception 'that evidence isn''t one of their entries in this venture' using errcode = '22023';
      end if;
    end if;
    insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, evidence_id, note, endorser_kind)
    values (v_me, p_endorsee, p_venture, v_skill, v_evidence, v_note, 'teacher')
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    v_names := v_names || (select name from public.skills where id = v_skill);
  end loop;
  perform private.notify(p_endorsee, v_me, 'endorsement_received', 'endorsement', v_first,
                         private.venture_data(p_venture)
                           || jsonb_build_object('skills', to_jsonb(v_names),
                                                 'username', (select username from public.profiles where user_id = p_endorsee)));
  return v_count;
end;
$$;

create function private.teacher_endorse_options(p_venture uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  v public.ventures;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or not private.teacher_may_endorse(v_me, p_venture) or v.status not in ('in_progress', 'completed') then
    return jsonb_build_object('allowed', false, 'month_left', 0, 'teammates', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'month_left', greatest(0, private.teacher_limit('endorsements_per_month')::integer
                              - (select count(*)::integer from public.endorsements e where e.endorser_id = v_me and e.created_at >= private.pk_month_start())),
    'teammates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'name', p.full_name,
               'skills', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
                                     from public.skills s where s.id = any (v.skill_ids) and s.retired_at is null), '[]'::jsonb),
               'given', coalesce((select jsonb_agg(e.skill_id) from public.endorsements e
                                   where e.endorser_id = v_me and e.endorsee_id = m.user_id and e.venture_id = p_venture), '[]'::jsonb),
               'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'description', c.description, 'kind', c.kind,
                                                                          'skills', coalesce((select jsonb_agg(k) from unnest(v.skill_ids) k
                                                                                               where private.entry_shows_skill(c.id, k)), '[]'::jsonb))
                                                      order by c.created_at desc)
                                      from public.contributions c
                                     where c.venture_id = p_venture and c.user_id = m.user_id and c.corrects_id is null), '[]'::jsonb))
             order by m.joined_at)
        from public.venture_members m join public.profiles p on p.user_id = m.user_id
       where m.venture_id = p_venture), '[]'::jsonb));
end;
$$;

-- Former-faculty marking and the faculty label on a profile's endorsements.
drop function public.endorsements_for(uuid);
drop function private.endorsements_for(uuid);
create function private.endorsements_for(p_user uuid)
returns table (
  id uuid, skill_id text, skill_name text, endorser_id uuid, endorser_name text, endorser_username text,
  endorser_avatar_path text, venture_id uuid, venture_title text, note text, has_evidence boolean,
  hidden boolean, created_at timestamptz, endorser_kind text, former_faculty boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.skill_id, s.name, e.endorser_id, p.full_name,
         case when private.can_view_profile(e.endorser_id) then p.username end,
         case when private.can_view_profile(e.endorser_id) then p.avatar_path end,
         case when private.can_view_venture(e.venture_id) then e.venture_id end,
         case when private.can_view_venture(e.venture_id) then v.title end,
         e.note, e.evidence_id is not null,
         e.hidden, e.created_at, e.endorser_kind,
         e.endorser_kind = 'teacher' and exists (select 1 from public.teacher_profiles t where t.user_id = e.endorser_id and t.status = 'revoked')
    from public.endorsements e
    join public.skills s on s.id = e.skill_id
    join public.profiles p on p.user_id = e.endorser_id
    join public.ventures v on v.id = e.venture_id
   where e.endorsee_id = p_user
     and private.can_view_profile(p_user)
     and (not e.hidden or p_user = (select auth.uid()))
     and (e.endorser_id = (select auth.uid()) or not private.is_blocked_with(e.endorser_id))
   order by s.name, e.created_at desc;
$$;
revoke all on function private.endorsements_for(uuid) from public;
grant execute on function private.endorsements_for(uuid) to authenticated;
create function public.endorsements_for(p_user uuid)
returns table (
  id uuid, skill_id text, skill_name text, endorser_id uuid, endorser_name text, endorser_username text,
  endorser_avatar_path text, venture_id uuid, venture_title text, note text, has_evidence boolean,
  hidden boolean, created_at timestamptz, endorser_kind text, former_faculty boolean
)
language sql stable security invoker set search_path = ''
as $$ select * from private.endorsements_for(p_user) $$;
revoke all on function public.endorsements_for(uuid) from public, anon;
grant execute on function public.endorsements_for(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ranking: teacher endorsements weigh 1.5 and count alone toward L4; a teacher endorsement is
-- Luminary's external signal. Teachers are never ranked (only students are scored).
-- ---------------------------------------------------------------------------
create or replace function private.score_endorsements(p_user uuid, p_f jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e jsonb := p_f->'endorsements';
  v_items jsonb;
  v_sum numeric;
  v_counting integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'endorser_id', x.endorser_id, 'skill_id', x.skill_id, 'venture_id', x.venture_id,
           'weight', x.weight, 'mutual', x.mutual, 'ring', x.ring, 'points', round(x.points, 2))
           order by x.created_at, x.id), '[]'::jsonb),
         coalesce(sum(x.points), 0),
         count(*) filter (where x.points > 0)::integer
    into v_items, v_sum, v_counting
    from (
      select y.*,
             (e->>'points')::numeric * y.weight
               * (case when y.mutual then (e->>'mutual')::numeric else 1 end)
               * (case when y.ring then 0 else 1 end) as points
        from (
          select n.id, n.endorser_id, n.skill_id, n.venture_id, n.created_at,
                 case when n.endorser_kind = 'teacher' then private.teacher_limit('endorsement_weight')
                      else coalesce((e->'tier_weights'->>coalesce(rs.tier::text, 'none'))::numeric, (e->'tier_weights'->>'none')::numeric)
                 end as weight,
                 exists (select 1 from public.endorsements b where b.endorser_id = p_user and b.endorsee_id = n.endorser_id) as mutual,
                 exists (select 1 from public.anti_gaming_flags f
                          where f.kind = 'ring' and f.status in ('open', 'upheld') and f.endorsement_ids @> array[n.id]) as ring
            from public.endorsements n
            left join public.ranking_scores rs on rs.user_id = n.endorser_id
           where n.endorsee_id = p_user and not n.hidden
        ) y
    ) x;
  return jsonb_build_object('points', round(least((p_f->'caps'->>'endorsements')::numeric, v_sum), 2),
                            'counting', v_counting, 'items', v_items);
end;
$$;

create or replace function private.compute_ranking(p_user uuid, p_as_of timestamptz default now(), p_f jsonb default null,
                                                   p_prev_peak numeric default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_f, (select value from private.ranking_formula()));
  v_work jsonb;
  v_skills jsonb;
  v_endorsements jsonb;
  v_credentials jsonb;
  v_momentum jsonb;
  v_adjustments jsonb;
  v_proof numeric;
  v_facts jsonb;
begin
  v_work := private.score_work(p_user, f);
  v_skills := private.score_skills(p_user, f);
  v_endorsements := private.score_endorsements(p_user, f);
  v_credentials := private.score_credentials(p_user, f, (p_as_of at time zone 'Asia/Karachi')::date);
  v_momentum := private.score_momentum(p_user, f, p_as_of,
                                       coalesce(p_prev_peak, (select s.momentum_peak from public.ranking_scores s where s.user_id = p_user), 0));
  v_adjustments := private.score_adjustments(p_user, f, p_as_of);
  v_proof := (v_work->>'points')::numeric + (v_skills->>'points')::numeric + (v_endorsements->>'points')::numeric
             + (v_credentials->>'points')::numeric;
  select jsonb_build_object(
           'peer_verified_entries', (select count(*) from private.verified_entries(p_user)),
           'active_ventures', (select count(distinct x.venture_id) from private.verified_entries(p_user) x
                                 join public.ventures v on v.id = x.venture_id and v.status in ('in_progress', 'completed')),
           'counting_endorsements', (v_endorsements->>'counting')::integer,
           'completed_ventures', jsonb_array_length(v_work->'ventures'),
           'max_level', coalesce((select max(u.level) from public.user_skills u where u.user_id = p_user), 0),
           -- Luminary's external signal (PRD 5.13): a teacher's endorsement that still counts.
           'teacher_endorsement', exists (select 1 from jsonb_array_elements(v_endorsements->'items') i
                                           join public.endorsements en on en.id = (i->>'id')::uuid
                                          where en.endorser_kind = 'teacher' and (i->>'points')::numeric > 0),
           'hire', false)
    into v_facts;
  return jsonb_build_object(
    'work', v_work, 'skills', v_skills, 'endorsements', v_endorsements, 'credentials', v_credentials,
    'momentum', v_momentum, 'adjustments', v_adjustments, 'facts', v_facts,
    'proof', round(v_proof, 2),
    'total', greatest(0, round(v_proof + (v_momentum->>'points')::numeric + (v_adjustments->>'points')::numeric, 2)),
    'as_of', p_as_of);
end;
$$;

-- L4 from endorsements: two different teammates, or one teacher, with evidence tied to the skill.
create or replace function private.l4_skills(p_user uuid)
returns table (skill_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.skill_id
    from public.endorsements e
   where e.endorsee_id = p_user and not e.hidden and e.evidence_id is not null
     and private.entry_shows_skill(e.evidence_id, e.skill_id)
   group by e.skill_id
  having count(distinct e.endorser_id) >= private.endorsement_limit('peer_verified_min')
      or bool_or(e.endorser_kind = 'teacher')
  union
  select c.skill_id from public.code_checks c where c.user_id = p_user and c.status = 'passed';
$$;

-- The peer-verified chip: two teammates, or one teacher.
create or replace function private.refresh_peer_verified(p_user uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.user_skills u
     set peer_verified = (coalesce(e.endorsers, 0) >= private.endorsement_limit('peer_verified_min') or coalesce(e.teachers, 0) > 0)
    from (select s.skill_id, count(distinct x.endorser_id)::integer as endorsers,
                 count(*) filter (where x.endorser_kind = 'teacher')::integer as teachers
            from public.user_skills s
            left join public.endorsements x on x.endorsee_id = s.user_id and x.skill_id = s.skill_id and not x.hidden
           where s.user_id = p_user
           group by s.skill_id) e
   where u.user_id = p_user and u.skill_id = e.skill_id
     and u.peer_verified is distinct from (coalesce(e.endorsers, 0) >= private.endorsement_limit('peer_verified_min') or coalesce(e.teachers, 0) > 0);
$$;

create or replace function private.user_skills_peer_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.peer_verified := (
    select count(distinct x.endorser_id) >= private.endorsement_limit('peer_verified_min') or coalesce(bool_or(x.endorser_kind = 'teacher'), false)
      from public.endorsements x
     where x.endorsee_id = new.user_id and x.skill_id = new.skill_id and not x.hidden
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Endorsement concentration, inside the anti-gaming stage of the nightly run
-- ---------------------------------------------------------------------------
create function private.detect_teacher_concentration()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_days integer := private.teacher_limit('concentration_days')::integer;
  v_share numeric := private.teacher_limit('concentration_share');
  v_min integer := private.teacher_limit('concentration_min')::integer;
  v_n integer := 0;
  r record;
begin
  for r in
    select t.teacher_id, t.student_id, t.given, t.total
      from (select e.endorser_id as teacher_id, e.endorsee_id as student_id, count(*)::integer as given,
                   sum(count(*)) over (partition by e.endorser_id)::integer as total
              from public.endorsements e
             where e.endorser_kind = 'teacher' and e.created_at > now() - make_interval(days => v_days)
             group by e.endorser_id, e.endorsee_id) t
     where t.total >= v_min and t.given::numeric / t.total > v_share
       and not exists (select 1 from public.teacher_concentration_flags f
                        where f.teacher_id = t.teacher_id and f.student_id = t.student_id and f.status = 'open')
  loop
    insert into public.teacher_concentration_flags (teacher_id, student_id, given, total)
    values (r.teacher_id, r.student_id, r.given, r.total);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.detect_teacher_concentration() from public;

alter function private.detect_rings(jsonb) rename to detect_rings_base;
create function private.detect_rings(p_f jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return private.detect_rings_base(p_f) + private.detect_teacher_concentration();
end;
$$;
revoke all on function private.detect_rings(jsonb) from public;

create function private.teacher_flag_queue(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_trust_reviewer();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'teacher', tp.full_name, 'student', sp.full_name, 'given', f.given, 'total', f.total,
             'status', f.status, 'created_at', f.created_at, 'reason', f.reason)
           order by case when p_status = 'open' then f.created_at end asc, f.reviewed_at desc)
      from (select * from public.teacher_concentration_flags x
             where (p_status = 'open' and x.status = 'open') or (p_status <> 'open' and x.status <> 'open')
             order by x.created_at desc limit 100) f
      join public.profiles tp on tp.user_id = f.teacher_id
      join public.profiles sp on sp.user_id = f.student_id), '[]'::jsonb);
end;
$$;

create function private.review_teacher_flag(p_id uuid, p_upheld boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  f public.teacher_concentration_flags;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select * into f from public.teacher_concentration_flags where id = p_id for update;
  if not found or f.status <> 'open' then
    raise exception 'flag not found' using errcode = 'P0002';
  end if;
  update public.teacher_concentration_flags
     set status = case when p_upheld then 'upheld' else 'cleared' end::public.review_flag_status,
         reviewed_by = v_me, reviewed_at = now(), reason = left(btrim(p_reason), 2000)
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_upheld then 'teacher_flag.uphold' else 'teacher_flag.clear' end, 'teacher_flag', p_id::text,
          left(btrim(p_reason), 2000), jsonb_build_object('status', 'open'),
          jsonb_build_object('status', case when p_upheld then 'upheld' else 'cleared' end));
end;
$$;

-- ---------------------------------------------------------------------------
-- The CV: "Reviewed by faculty" badge and a faculty-confirmed count, never a score
-- ---------------------------------------------------------------------------
alter function private.cv_snapshot(uuid) rename to cv_snapshot_base;
create function private.cv_snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := private.cv_snapshot_base(p_user);
  v_projects jsonb;
begin
  if jsonb_typeof(v -> 'projects') is distinct from 'array' then
    return v;
  end if;
  select coalesce(jsonb_agg(
           p || jsonb_build_object(
             'faculty_confirmed', (
               select count(*)::integer from public.contributions o
                where o.venture_id = (p ->> 'id')::uuid and o.user_id = p_user and o.corrects_id is null
                  and exists (select 1 from public.contribution_confirmations k
                               where k.confirmer_role = 'supervisor'
                                 and k.contribution_id = (select c.id from public.contributions c
                                                           where c.id = o.id or c.corrects_id = o.id
                                                           order by c.created_at desc, (c.id = o.id) limit 1))),
             'faculty_reviewed', exists (select 1 from public.venture_reviews r where r.venture_id = (p ->> 'id')::uuid))
           order by ord), '[]'::jsonb)
    into v_projects
    from jsonb_array_elements(v -> 'projects') with ordinality as t (p, ord);
  return jsonb_set(v, '{projects}', v_projects);
end;
$$;
revoke all on function private.cv_snapshot(uuid), private.cv_snapshot_base(uuid) from public;

-- ---------------------------------------------------------------------------
-- Code-check grading by teachers (48 h with the university's teachers, then Skilient reviewers)
-- ---------------------------------------------------------------------------
-- Is there an opted-in teacher at the student's university for this skill who isn't in conflict?
create function private.teachers_available(p_student uuid, p_skill text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_profiles t
      join public.teacher_settings s on s.user_id = t.user_id
      join public.profiles sp on sp.user_id = p_student
     where t.status = 'approved' and t.university_id = sp.university_id and s.grading_opt_in
       and p_skill = any (s.grading_skills) and not private.teacher_conflict(t.user_id, p_student));
$$;
revoke all on function private.teachers_available(uuid, text) from public;

create function private.code_checks_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    new.due_at := now() + make_interval(hours => private.code_check_limit('due_hours')::integer);
    if new.routed_to_staff_at is null and not private.teachers_available(new.user_id, new.skill_id) then
      new.routed_to_staff_at := now();
    end if;
  end if;
  -- Skilient reviewers take checks only once they have moved to them; teachers may hold them before.
  if tg_op = 'UPDATE' and new.claimed_by is not null and new.claimed_by is distinct from old.claimed_by
     and new.routed_to_staff_at is null and not private.is_approved_teacher(new.claimed_by) then
    raise exception 'this code check is with the university''s teachers for now' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.code_checks_route() from public;
create trigger code_checks_route before insert or update on public.code_checks
  for each row execute function private.code_checks_route();

-- Skilient's queue shows only checks that have moved to it.
create or replace function private.code_check_queue(p_status text default 'submitted')
returns table (id uuid, student_name text, skill_name text, status public.code_check_status, claimed_by_name text,
               claimed_by_me boolean, conflict boolean, submitted_at timestamptz, overdue boolean, graded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select c.id, p.full_name, s.name, c.status, cp.full_name, c.claimed_by = v_me, private.code_check_conflict(v_me, c.user_id),
         c.submitted_at, c.status = 'submitted' and c.submitted_at < now() - make_interval(hours => private.code_check_limit('due_hours')),
         c.graded_at
    from public.code_checks c
    join public.profiles p on p.user_id = c.user_id
    join public.skills s on s.id = c.skill_id
    left join public.profiles cp on cp.user_id = c.claimed_by
   where (p_status = 'submitted' and c.status = 'submitted' and c.routed_to_staff_at is not null)
      or (p_status = 'graded' and c.status in ('passed', 'failed') and c.grader_id is not null and c.graded_at > now() - interval '30 days')
   order by case when p_status = 'submitted' then c.submitted_at end asc, c.graded_at desc
   limit 200;
end;
$$;

-- The code is shown to its student during the attempt, to the trust reviewer or teacher who claimed it.
create or replace function private.code_check_snippet_access(p_check uuid, p_user uuid, p_aal text)
returns table (role text, installation_id bigint, repo_id bigint, sha text, path text, start_line integer, end_line integer)
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.user_id = p_user then 'student' else 'grader' end,
         ur.installation_id, c.repo_id, c.sha, c.path, c.start_line, c.end_line
    from public.code_checks c
    left join public.github_user_repos ur on ur.user_id = c.user_id and ur.repo_id = c.repo_id
   where c.id = p_check and c.path is not null
     and (
       (c.user_id = p_user and c.status = 'in_progress'
        and (c.deadline_at is null or now() <= c.deadline_at + make_interval(secs => private.code_check_limit('grace_seconds'))))
       or (c.status = 'submitted' and c.claimed_by = p_user and c.user_id <> p_user
           and ((p_aal = 'aal2' and exists (select 1 from public.staff_roles r where r.user_id = p_user and r.role in ('trust_reviewer', 'super_admin')))
                or private.is_approved_teacher(p_user)))
     );
$$;

create function private.teacher_code_check_queue(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  t public.teacher_profiles;
  s public.teacher_settings;
begin
  select * into t from public.teacher_profiles where user_id = v_me;
  select * into s from public.teacher_settings where user_id = v_me;
  if p_status = 'graded' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'student_name', p.full_name, 'skill_name', k.name, 'status', c.status,
                                          'graded_at', c.graded_at) order by c.graded_at desc)
        from public.code_checks c join public.profiles p on p.user_id = c.user_id join public.skills k on k.id = c.skill_id
       where c.grader_id = v_me and c.status in ('passed', 'failed') and c.graded_at > now() - interval '60 days'), '[]'::jsonb);
  end if;
  if not coalesce(s.grading_opt_in, false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'student_name', p.full_name, 'skill_name', k.name, 'submitted_at', c.submitted_at, 'due_at', c.due_at,
             'hand_over_at', c.submitted_at + make_interval(hours => private.teacher_limit('grading_teacher_hours')::integer),
             'claimed_by_me', c.claimed_by = v_me, 'conflict', private.teacher_conflict(v_me, c.user_id))
           order by c.submitted_at)
      from public.code_checks c
      join public.profiles p on p.user_id = c.user_id
      join public.skills k on k.id = c.skill_id
     where c.status = 'submitted' and c.routed_to_staff_at is null and p.university_id = t.university_id
       and c.skill_id = any (s.grading_skills) and (c.claimed_by is null or c.claimed_by = v_me)), '[]'::jsonb);
end;
$$;

create function private.teacher_code_check_case(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  c public.code_checks;
  v_mine boolean;
begin
  select * into c from public.code_checks where id = p_id;
  if not found then
    return null;
  end if;
  v_mine := (c.status = 'submitted' and c.claimed_by = v_me) or (c.status in ('passed', 'failed') and c.grader_id = v_me);
  if not v_mine and not (c.status = 'submitted' and c.routed_to_staff_at is null and c.claimed_by is null
                         and exists (select 1 from public.profiles sp, public.teacher_profiles t
                                      where sp.user_id = c.user_id and t.user_id = v_me and t.university_id = sp.university_id)) then
    return null;
  end if;
  return jsonb_build_object(
    'id', c.id, 'status', c.status, 'skill', (select name from public.skills where id = c.skill_id),
    'student', (select full_name from public.profiles where user_id = c.user_id),
    'submitted_at', c.submitted_at, 'due_at', c.due_at, 'claimed_by_me', c.claimed_by = v_me,
    'claimed', c.claimed_by is not null, 'conflict', private.teacher_conflict(v_me, c.user_id),
    -- The requirement, the code and the answers show once the teacher holds the check (or after grading).
    'prompt', case when v_mine then (select prompt from public.code_check_prompts where id = c.prompt_id) end,
    'answers', case when v_mine then c.answers end,
    'rubric', case when c.status in ('passed', 'failed') and v_mine then c.rubric end,
    'feedback', case when c.status in ('passed', 'failed') and v_mine then c.feedback end);
end;
$$;

create function private.teacher_claim_code_check(p_id uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  c public.code_checks;
  s public.teacher_settings;
  t public.teacher_profiles;
begin
  -- The weekly cap holds under parallel claims by the same teacher.
  perform pg_advisory_xact_lock(hashtextextended('grade:' || v_me::text, 0));
  -- Two teachers never claim the same check: the second skips the locked row and is refused.
  select * into c from public.code_checks where id = p_id and status = 'submitted' for update skip locked;
  if not found then
    if exists (select 1 from public.code_checks where id = p_id and status = 'submitted') then
      raise exception 'someone else is claiming this code check right now' using errcode = '55000';
    end if;
    raise exception 'this code check isn''t waiting for a grade' using errcode = '55000';
  end if;
  if not coalesce(p_claim, false) then
    if c.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this code check' using errcode = '55000';
    end if;
    update public.code_checks set claimed_by = null, claimed_at = null where id = p_id;
    return;
  end if;
  if c.claimed_by = v_me then
    return;
  end if;
  if c.claimed_by is not null then
    raise exception 'someone else is grading this code check' using errcode = '55000';
  end if;
  select * into s from public.teacher_settings where user_id = v_me;
  select * into t from public.teacher_profiles where user_id = v_me;
  if not coalesce(s.grading_opt_in, false) then
    raise exception 'turn on code-check grading in your settings first' using errcode = '42501';
  end if;
  if c.routed_to_staff_at is not null then
    raise exception 'this code check has moved to Skilient reviewers' using errcode = '55000';
  end if;
  if not exists (select 1 from public.profiles sp where sp.user_id = c.user_id and sp.university_id = t.university_id) then
    raise exception 'this student is at another university' using errcode = '42501';
  end if;
  if not (c.skill_id = any (s.grading_skills)) then
    raise exception 'that skill isn''t one you chose to grade' using errcode = '42501';
  end if;
  if private.teacher_conflict(v_me, c.user_id) then
    raise exception 'you know this student (a friend, teammate or supervised team), so someone else grades it' using errcode = '42501';
  end if;
  if private.teacher_week_grading(v_me) >= s.weekly_grading_cap then
    raise exception 'you reached your weekly limit of % code checks', s.weekly_grading_cap using errcode = '23514';
  end if;
  update public.code_checks set claimed_by = v_me, claimed_at = now() where id = p_id;
end;
$$;

create function private.teacher_grade_code_check(p_id uuid, p_rubric jsonb, p_feedback text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  c public.code_checks;
  v_passed integer;
  v_pass boolean;
  v_rubric jsonb;
begin
  if p_feedback is null or char_length(btrim(p_feedback)) < 3 then
    raise exception 'give the student some feedback' using errcode = '22023';
  end if;
  select * into c from public.code_checks where id = p_id for update;
  if c.id is null or c.status <> 'submitted' then
    raise exception 'this code check isn''t waiting for a grade' using errcode = '55000';
  end if;
  if c.claimed_by is distinct from v_me then
    raise exception 'claim the code check before grading' using errcode = '55000';
  end if;
  if jsonb_typeof(p_rubric) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_rubric) k where k in ('behaviour', 'design', 'change', 'accuracy')) <> 4
     or (select count(*) from jsonb_object_keys(p_rubric)) <> 4
     or exists (select 1 from jsonb_each(p_rubric) e where jsonb_typeof(e.value -> 'pass') <> 'boolean') then
    raise exception 'mark each of the four rubric parts' using errcode = '22023';
  end if;
  v_rubric := (select jsonb_object_agg(e.key, jsonb_build_object('pass', (e.value ->> 'pass')::boolean,
                                                                 'comment', left(coalesce(e.value ->> 'comment', ''), 500)))
                 from jsonb_each(p_rubric) e);
  v_passed := (select count(*) from jsonb_each(v_rubric) e where (e.value ->> 'pass')::boolean);
  v_pass := v_passed >= private.code_check_limit('pass_parts');
  update public.code_checks
     set status = case when v_pass then 'passed' else 'failed' end::public.code_check_status,
         rubric = v_rubric, feedback = left(btrim(p_feedback), 2000), grader_id = v_me, graded_at = now(),
         claimed_by = null, claimed_at = null
   where id = p_id;
  perform private.notify(c.user_id, null, 'code_check_graded', 'code_check', c.id,
                         jsonb_build_object('skill', (select name from public.skills where id = c.skill_id), 'passed', v_pass));
  if v_pass then
    perform private.recompute_user_skills(c.user_id);
  end if;
  return v_pass;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs: teacher-reminders (hourly), teacher-digest (weekly)
-- ---------------------------------------------------------------------------
create function private.teacher_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_n integer := 0;
  v_moved integer;
  v_days integer[] := array(select jsonb_array_elements_text(private.config('teacher.limits') -> 'review_remind_days')::integer);
  r record;
begin
  v_run := public.job_run_start('teacher-reminders');
  begin
    -- Review reminders at 7 and 12 days after the request; each is sent once.
    for r in
      select q.id, q.teacher_id, q.venture_id from public.review_requests q
       where q.status = 'open' and q.remind7_at is null and q.created_at <= now() - make_interval(days => v_days[1])
    loop
      update public.review_requests set remind7_at = now() where id = r.id;
      perform private.notify(r.teacher_id, null, 'review_reminder', 'review', r.id, private.venture_data(r.venture_id));
      v_n := v_n + 1;
    end loop;
    for r in
      select q.id, q.teacher_id, q.venture_id from public.review_requests q
       where q.status = 'open' and q.remind12_at is null and q.created_at <= now() - make_interval(days => v_days[2])
    loop
      update public.review_requests set remind12_at = now() where id = r.id;
      perform private.notify(r.teacher_id, null, 'review_reminder', 'review', r.id, private.venture_data(r.venture_id));
      v_n := v_n + 1;
    end loop;
    -- Unanswered requests expire at 14 days.
    for r in
      update public.review_requests set status = 'expired', closed_at = now()
       where status = 'open' and due_at <= now()
      returning id, requested_by, teacher_id, venture_id
    loop
      perform private.notify(r.requested_by, null, 'review_expired', 'review', r.id, private.venture_data(r.venture_id));
      v_n := v_n + 1;
    end loop;
    -- Code checks nobody claimed within 48 hours, or that a teacher held past the 72-hour due time,
    -- move to Skilient reviewers.
    update public.code_checks
       set routed_to_staff_at = now(), claimed_by = null, claimed_at = null
     where status = 'submitted' and routed_to_staff_at is null
       and ((claimed_by is null and submitted_at <= now() - make_interval(hours => private.teacher_limit('grading_teacher_hours')::integer))
            or (claimed_by is not null and due_at <= now()));
    get diagnostics v_moved = row_count;
    v_n := v_n + v_moved;
    -- Ideas past their deadline close.
    update public.project_ideas set status = 'closed'
     where status = 'open' and deadline is not null and deadline < (now() at time zone 'Asia/Karachi')::date;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return 0;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
  return v_n;
end;
$$;
revoke all on function private.teacher_reminders() from public;
select cron.schedule('teacher-reminders', '7 * * * *', $$select private.teacher_reminders()$$);

-- What the weekly digest says: counts only, no student work.
create function private.teacher_digest_data(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'invites', (select count(*) from public.venture_supervisors s where s.teacher_id = p_user and s.status = 'invited'),
    'review_requests', (select count(*) from public.review_requests r where r.teacher_id = p_user and r.status = 'open'),
    'review_due_soon', (select count(*) from public.review_requests r
                         where r.teacher_id = p_user and r.status = 'open' and r.due_at < now() + interval '3 days'),
    'checks_waiting', (select count(*) from public.code_checks c
                         join public.profiles sp on sp.user_id = c.user_id
                         join public.teacher_profiles t on t.user_id = p_user and t.university_id = sp.university_id
                         join public.teacher_settings ts on ts.user_id = p_user and ts.grading_opt_in
                        where c.status = 'submitted' and c.routed_to_staff_at is null and c.claimed_by is null
                          and c.skill_id = any (ts.grading_skills) and not private.teacher_conflict(p_user, c.user_id)),
    'ideas_closing', (select count(*) from public.project_ideas i
                       where i.teacher_id = p_user and i.status = 'open'
                         and i.deadline between (now() at time zone 'Asia/Karachi')::date and (now() at time zone 'Asia/Karachi')::date + 7));
$$;
revoke all on function private.teacher_digest_data(uuid) from public;

create function private.queue_teacher_digests()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select t.user_id from public.teacher_profiles t
      left join public.teacher_settings s on s.user_id = t.user_id
     where t.status = 'approved' and coalesce(s.digest, true)
  loop
    if (select sum(value::integer) from jsonb_each_text(private.teacher_digest_data(r.user_id))) > 0 then
      perform pgmq.send('notification_emails', jsonb_build_object('kind', 'teacher_digest', 'user_id', r.user_id));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.queue_teacher_digests() from public;
-- Mondays 09:00 in Pakistan.
select cron.schedule('teacher-digest', '0 4 * * 1', $$select private.queue_teacher_digests()$$);

-- ---------------------------------------------------------------------------
-- Grants and public wrappers (security invoker), generated from one list
-- ---------------------------------------------------------------------------

revoke all on function
  private.request_teacher_role(text, text),
  private.approve_teacher(uuid),
  private.revoke_teacher(uuid, text),
  private.import_faculty_csv(uuid, jsonb),
  private.teacher_requests(text),
  private.ops_universities(),
  private.teacher_state(),
  private.teacher_home(),
  private.teacher_settings_get(),
  private.save_teacher_settings(boolean, integer, text[], boolean),
  private.save_idea(uuid, jsonb),
  private.set_idea_status(uuid, boolean),
  private.ideas_list(boolean, text, text, integer),
  private.idea_get(uuid),
  private.start_venture_from_idea(uuid, jsonb),
  private.invite_supervisor(uuid, uuid),
  private.respond_supervision(uuid, boolean),
  private.end_supervision(uuid),
  private.supervision_for(uuid),
  private.teachers_for_venture(uuid),
  private.post_supervisor_comment(uuid, text),
  private.supervisor_thread(uuid),
  private.supervisor_confirm_contribution(uuid),
  private.request_review(uuid, uuid),
  private.start_review(uuid),
  private.close_review_request(uuid),
  private.submit_review(uuid, jsonb, text),
  private.venture_reviews_for(uuid),
  private.review_requests_for(uuid),
  private.teacher_review_requests(text),
  private.teacher_review_request(uuid),
  private.teacher_venture(uuid),
  private.teacher_contributions(uuid),
  private.teacher_deliverables(uuid),
  private.teacher_ventures(),
  private.teacher_endorse(uuid, uuid, jsonb, text),
  private.teacher_endorse_options(uuid),
  private.teacher_flag_queue(text),
  private.review_teacher_flag(uuid, boolean, text),
  private.teacher_code_check_queue(text),
  private.teacher_code_check_case(uuid),
  private.teacher_claim_code_check(uuid, boolean),
  private.teacher_grade_code_check(uuid, jsonb, text)
  from public;
grant execute on function
  private.request_teacher_role(text, text),
  private.approve_teacher(uuid),
  private.revoke_teacher(uuid, text),
  private.import_faculty_csv(uuid, jsonb),
  private.teacher_requests(text),
  private.ops_universities(),
  private.teacher_state(),
  private.teacher_home(),
  private.teacher_settings_get(),
  private.save_teacher_settings(boolean, integer, text[], boolean),
  private.save_idea(uuid, jsonb),
  private.set_idea_status(uuid, boolean),
  private.ideas_list(boolean, text, text, integer),
  private.idea_get(uuid),
  private.start_venture_from_idea(uuid, jsonb),
  private.invite_supervisor(uuid, uuid),
  private.respond_supervision(uuid, boolean),
  private.end_supervision(uuid),
  private.supervision_for(uuid),
  private.teachers_for_venture(uuid),
  private.post_supervisor_comment(uuid, text),
  private.supervisor_thread(uuid),
  private.supervisor_confirm_contribution(uuid),
  private.request_review(uuid, uuid),
  private.start_review(uuid),
  private.close_review_request(uuid),
  private.submit_review(uuid, jsonb, text),
  private.venture_reviews_for(uuid),
  private.review_requests_for(uuid),
  private.teacher_review_requests(text),
  private.teacher_review_request(uuid),
  private.teacher_venture(uuid),
  private.teacher_contributions(uuid),
  private.teacher_deliverables(uuid),
  private.teacher_ventures(),
  private.teacher_endorse(uuid, uuid, jsonb, text),
  private.teacher_endorse_options(uuid),
  private.teacher_flag_queue(text),
  private.review_teacher_flag(uuid, boolean, text),
  private.teacher_code_check_queue(text),
  private.teacher_code_check_case(uuid),
  private.teacher_claim_code_check(uuid, boolean),
  private.teacher_grade_code_check(uuid, jsonb, text)
  to authenticated;

create function public.request_teacher_role(p_department text, p_title text) returns public.teacher_status
language sql volatile security invoker set search_path = '' as $$ select private.request_teacher_role(p_department, p_title) $$;
create function public.approve_teacher(p_user uuid) returns void
language sql volatile security invoker set search_path = '' as $$ select private.approve_teacher(p_user) $$;
create function public.revoke_teacher(p_user uuid, p_reason text) returns void
language sql volatile security invoker set search_path = '' as $$ select private.revoke_teacher(p_user, p_reason) $$;
create function public.import_faculty_csv(p_university uuid, p_rows jsonb) returns integer
language sql volatile security invoker set search_path = '' as $$ select private.import_faculty_csv(p_university, p_rows) $$;
create function public.teacher_requests(p_status text default 'pending') returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_requests(p_status) $$;
create function public.ops_universities() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.ops_universities() $$;
create function public.teacher_state() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_state() $$;
create function public.teacher_home() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_home() $$;
create function public.teacher_settings_get() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_settings_get() $$;
create function public.save_teacher_settings(p_opt_in boolean, p_cap integer, p_skills text[], p_digest boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.save_teacher_settings(p_opt_in, p_cap, p_skills, p_digest) $$;
create function public.save_idea(p_id uuid, p jsonb) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.save_idea(p_id, p) $$;
create function public.set_idea_status(p_id uuid, p_open boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.set_idea_status(p_id, p_open) $$;
create function public.ideas_list(p_mine boolean default false, p_skill text default null, p_difficulty text default null, p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.ideas_list(p_mine, p_skill, p_difficulty, p_limit) $$;
create function public.idea_get(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.idea_get(p_id) $$;
create function public.start_venture_from_idea(p_idea uuid, p jsonb) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.start_venture_from_idea(p_idea, p) $$;
create function public.invite_supervisor(p_venture uuid, p_teacher uuid) returns void
language sql volatile security invoker set search_path = '' as $$ select private.invite_supervisor(p_venture, p_teacher) $$;
create function public.respond_supervision(p_venture uuid, p_accept boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.respond_supervision(p_venture, p_accept) $$;
create function public.end_supervision(p_venture uuid) returns void
language sql volatile security invoker set search_path = '' as $$ select private.end_supervision(p_venture) $$;
create function public.supervision_for(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.supervision_for(p_venture) $$;
create function public.teachers_for_venture(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teachers_for_venture(p_venture) $$;
create function public.post_supervisor_comment(p_venture uuid, p_body text) returns bigint
language sql volatile security invoker set search_path = '' as $$ select private.post_supervisor_comment(p_venture, p_body) $$;
create function public.supervisor_thread(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.supervisor_thread(p_venture) $$;
create function public.supervisor_confirm_contribution(p_entry uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$ select private.supervisor_confirm_contribution(p_entry) $$;
create function public.request_review(p_venture uuid, p_teacher uuid) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.request_review(p_venture, p_teacher) $$;
create function public.start_review(p_venture uuid) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.start_review(p_venture) $$;
create function public.close_review_request(p_request uuid) returns void
language sql volatile security invoker set search_path = '' as $$ select private.close_review_request(p_request) $$;
create function public.submit_review(p_request uuid, p_rubric jsonb, p_comments text default null) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.submit_review(p_request, p_rubric, p_comments) $$;
create function public.venture_reviews_for(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.venture_reviews_for(p_venture) $$;
create function public.review_requests_for(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.review_requests_for(p_venture) $$;
create function public.teacher_review_requests(p_status text default 'open') returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_review_requests(p_status) $$;
create function public.teacher_review_request(p_request uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_review_request(p_request) $$;
create function public.teacher_venture(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_venture(p_venture) $$;
create function public.teacher_contributions(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_contributions(p_venture) $$;
create function public.teacher_deliverables(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_deliverables(p_venture) $$;
create function public.teacher_ventures() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_ventures() $$;
create function public.teacher_endorse(p_endorsee uuid, p_venture uuid, p_items jsonb, p_note text default null) returns integer
language sql volatile security invoker set search_path = '' as $$ select private.teacher_endorse(p_endorsee, p_venture, p_items, p_note) $$;
create function public.teacher_endorse_options(p_venture uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_endorse_options(p_venture) $$;
create function public.teacher_flag_queue(p_status text default 'open') returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_flag_queue(p_status) $$;
create function public.review_teacher_flag(p_id uuid, p_upheld boolean, p_reason text) returns void
language sql volatile security invoker set search_path = '' as $$ select private.review_teacher_flag(p_id, p_upheld, p_reason) $$;
create function public.teacher_code_check_queue(p_status text default 'open') returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_code_check_queue(p_status) $$;
create function public.teacher_code_check_case(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.teacher_code_check_case(p_id) $$;
create function public.teacher_claim_code_check(p_id uuid, p_claim boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.teacher_claim_code_check(p_id, p_claim) $$;
create function public.teacher_grade_code_check(p_id uuid, p_rubric jsonb, p_feedback text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select private.teacher_grade_code_check(p_id, p_rubric, p_feedback) $$;

revoke all on function
  public.request_teacher_role(text, text),
  public.approve_teacher(uuid),
  public.revoke_teacher(uuid, text),
  public.import_faculty_csv(uuid, jsonb),
  public.teacher_requests(text),
  public.ops_universities(),
  public.teacher_state(),
  public.teacher_home(),
  public.teacher_settings_get(),
  public.save_teacher_settings(boolean, integer, text[], boolean),
  public.save_idea(uuid, jsonb),
  public.set_idea_status(uuid, boolean),
  public.ideas_list(boolean, text, text, integer),
  public.idea_get(uuid),
  public.start_venture_from_idea(uuid, jsonb),
  public.invite_supervisor(uuid, uuid),
  public.respond_supervision(uuid, boolean),
  public.end_supervision(uuid),
  public.supervision_for(uuid),
  public.teachers_for_venture(uuid),
  public.post_supervisor_comment(uuid, text),
  public.supervisor_thread(uuid),
  public.supervisor_confirm_contribution(uuid),
  public.request_review(uuid, uuid),
  public.start_review(uuid),
  public.close_review_request(uuid),
  public.submit_review(uuid, jsonb, text),
  public.venture_reviews_for(uuid),
  public.review_requests_for(uuid),
  public.teacher_review_requests(text),
  public.teacher_review_request(uuid),
  public.teacher_venture(uuid),
  public.teacher_contributions(uuid),
  public.teacher_deliverables(uuid),
  public.teacher_ventures(),
  public.teacher_endorse(uuid, uuid, jsonb, text),
  public.teacher_endorse_options(uuid),
  public.teacher_flag_queue(text),
  public.review_teacher_flag(uuid, boolean, text),
  public.teacher_code_check_queue(text),
  public.teacher_code_check_case(uuid),
  public.teacher_claim_code_check(uuid, boolean),
  public.teacher_grade_code_check(uuid, jsonb, text)
  from public, anon;
grant execute on function
  public.request_teacher_role(text, text),
  public.approve_teacher(uuid),
  public.revoke_teacher(uuid, text),
  public.import_faculty_csv(uuid, jsonb),
  public.teacher_requests(text),
  public.ops_universities(),
  public.teacher_state(),
  public.teacher_home(),
  public.teacher_settings_get(),
  public.save_teacher_settings(boolean, integer, text[], boolean),
  public.save_idea(uuid, jsonb),
  public.set_idea_status(uuid, boolean),
  public.ideas_list(boolean, text, text, integer),
  public.idea_get(uuid),
  public.start_venture_from_idea(uuid, jsonb),
  public.invite_supervisor(uuid, uuid),
  public.respond_supervision(uuid, boolean),
  public.end_supervision(uuid),
  public.supervision_for(uuid),
  public.teachers_for_venture(uuid),
  public.post_supervisor_comment(uuid, text),
  public.supervisor_thread(uuid),
  public.supervisor_confirm_contribution(uuid),
  public.request_review(uuid, uuid),
  public.start_review(uuid),
  public.close_review_request(uuid),
  public.submit_review(uuid, jsonb, text),
  public.venture_reviews_for(uuid),
  public.review_requests_for(uuid),
  public.teacher_review_requests(text),
  public.teacher_review_request(uuid),
  public.teacher_venture(uuid),
  public.teacher_contributions(uuid),
  public.teacher_deliverables(uuid),
  public.teacher_ventures(),
  public.teacher_endorse(uuid, uuid, jsonb, text),
  public.teacher_endorse_options(uuid),
  public.teacher_flag_queue(text),
  public.review_teacher_flag(uuid, boolean, text),
  public.teacher_code_check_queue(text),
  public.teacher_code_check_case(uuid),
  public.teacher_claim_code_check(uuid, boolean),
  public.teacher_grade_code_check(uuid, jsonb, text)
  to authenticated;
