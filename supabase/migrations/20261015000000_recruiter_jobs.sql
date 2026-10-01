-- Phase 8, slice 3: jobs and applications, the hiring pipeline, hires with their 90-day outcome,
-- the company page, skill competitions, and the student's Opportunities rows (PRD 5.20).
--
-- Money is phase 10: a hire records the organisation, the hire type (intern or full-time) and the
-- date with an `unbilled` fee marker so the billing work can invoice exactly; nothing is charged here.

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create type public.job_status as enum ('draft', 'live', 'closed');
create type public.application_stage as enum ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');

create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  type text not null check (type in ('internship', 'full_time', 'part_time')),
  location text check (location is null or char_length(btrim(location)) between 2 and 80),
  remote boolean not null default false,
  -- A stipend or salary range is required on every post (PRD 5.20).
  salary_min integer not null check (salary_min > 0),
  salary_max integer not null,
  currency text not null default 'PKR' check (currency in ('PKR', 'USD')),
  pay_period text not null default 'month' check (pay_period in ('month', 'year')),
  min_tier public.ranking_tier,
  -- [{skill, min_level}]
  min_skill_levels jsonb not null default '[]'::jsonb check (jsonb_typeof(min_skill_levels) = 'array'),
  openings integer not null default 1 check (openings between 1 and 100),
  deadline date not null,
  description text not null check (char_length(description) between 50 and 5000),
  status public.job_status not null default 'draft',
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_max >= salary_min),
  check (remote or location is not null)
);
comment on table public.job_posts is 'Jobs and internships (PRD 5.20). Salary fields are not null: posts without pay are refused.';
create index job_posts_org_idx on public.job_posts (org_id, status, created_at desc);
create index job_posts_live_idx on public.job_posts (published_at desc) where status = 'live';
create trigger job_posts_set_updated_at before update on public.job_posts
  for each row execute function private.set_updated_at();

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  stage public.application_stage not null default 'applied',
  reject_reason text check (reject_reason is null or reject_reason in ('skills_gap', 'position_filled', 'other')),
  -- The student's verified CV at the time they applied, when one had been issued.
  cv_code text,
  applied_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  unique (job_id, student_id),
  check ((stage = 'rejected') = (reject_reason is not null))
);
create index job_applications_student_idx on public.job_applications (student_id, applied_at desc);
create index job_applications_job_idx on public.job_applications (job_id, stage);

create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.job_applications (id) on delete cascade,
  stage public.application_stage not null,
  reject_reason text,
  actor_id uuid references auth.users (id) on delete set null,
  at timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, at);

create table public.job_invites (
  job_id uuid not null references public.job_posts (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  primary key (job_id, student_id)
);

create table public.hires (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Nulled when the student deletes their account: the record stays, anonymised.
  student_id uuid references auth.users (id) on delete set null,
  job_id uuid references public.job_posts (id) on delete set null,
  application_id uuid references public.job_applications (id) on delete set null,
  hired_by uuid references auth.users (id) on delete set null,
  job_type text not null check (job_type in ('internship', 'full_time', 'part_time')),
  kind text not null check (kind in ('intern', 'full_time')),
  hired_at timestamptz not null default now(),
  -- Phase 10 invoices the hiring fee from these rows (org, kind, date) and then sets fee_status.
  fee_status text not null default 'unbilled' check (fee_status in ('unbilled', 'invoiced', 'waived')),
  unique (application_id)
);
comment on table public.hires is 'Hires (PRD 5.20). org + kind + hired_at are what phase 10 needs to invoice the hiring fee.';
create index hires_org_idx on public.hires (org_id, hired_at desc);

create table public.hire_outcomes (
  hire_id uuid primary key references public.hires (id) on delete cascade,
  asked_at timestamptz not null default now(),
  answer text check (answer is null or answer in ('yes', 'partly', 'no', 'left')),
  answered_at timestamptz,
  answered_by uuid references auth.users (id) on delete set null,
  check ((answer is null) = (answered_at is null))
);
comment on table public.hire_outcomes is 'The 90-day question "Is this hire meeting expectations?" (PRD 5.20): the start of the Outcome trust layer.';

alter table public.job_posts enable row level security;
alter table public.job_applications enable row level security;
alter table public.application_events enable row level security;
alter table public.job_invites enable row level security;
alter table public.hires enable row level security;
alter table public.hire_outcomes enable row level security;
revoke all on table public.job_posts, public.job_applications, public.application_events, public.job_invites,
  public.hires, public.hire_outcomes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
insert into public.notification_types (type, category, emailed) values
  ('job_application_received', 'recruiting', true),
  ('application_stage', 'job_updates', true),
  ('job_invite', 'job_updates', true),
  ('hire_outcome_due', 'recruiting', true),
  ('competition_decided', 'recruiting', true),
  ('team_invite', 'job_updates', false),
  ('competition_result', 'job_updates', true);

-- ---------------------------------------------------------------------------
-- Access to a candidate now also includes people who applied to this organisation
-- ---------------------------------------------------------------------------
create or replace function private.candidate_access(p_org uuid, p_student uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_org is null or p_student is null then null
    when not exists (select 1 from public.organizations o where o.id = p_org and o.status = 'verified') then null
    when exists (select 1 from public.company_blocks b where b.student_id = p_student and b.org_id = p_org) then null
    when private.org_entitled(p_org, 'talent.full_profile') and exists (select 1 from public.talent_index t where t.student_id = p_student)
      then 'search'
    when exists (select 1 from public.contact_requests c where c.org_id = p_org and c.student_id = p_student
                    and c.status = 'accepted' and c.closed_at is null) then 'contact'
    when exists (select 1 from public.job_applications a join public.job_posts j on j.id = a.job_id
                  where j.org_id = p_org and a.student_id = p_student and a.stage <> 'withdrawn') then 'application'
    else null end;
$$;

-- ---------------------------------------------------------------------------
-- Validation shared by jobs and competitions
-- ---------------------------------------------------------------------------
create function private.valid_skill_requirements(p jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 10
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'skill', '') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
           or coalesce(e ->> 'min_level', '') !~ '^[1-4]$');
$$;
revoke all on function private.valid_skill_requirements(jsonb) from public;

-- What a student is missing for a set of requirements (empty when they qualify).
create function private.unmet_requirements(p_student uuid, p_tier public.ranking_tier, p_skills jsonb)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
           case when p_tier is not null and coalesce((select rs.tier from public.ranking_scores rs where rs.user_id = p_student), 'raw') < p_tier
                then initcap(p_tier::text) || ' tier' end]
         || array(select 'L' || (e ->> 'min_level') || ' ' || coalesce(s.name, e ->> 'skill')
                    from jsonb_array_elements(coalesce(p_skills, '[]'::jsonb)) e
                    left join public.skills s on s.id = e ->> 'skill'
                   where coalesce((select us.level from public.user_skills us where us.user_id = p_student and us.skill_id = e ->> 'skill'), 0)
                         < (e ->> 'min_level')::integer), null);
$$;
revoke all on function private.unmet_requirements(uuid, public.ranking_tier, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Recruiter side: jobs
-- ---------------------------------------------------------------------------
create function private.save_job(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_type text := p ->> 'type';
  v_loc text := nullif(btrim(coalesce(p ->> 'location', '')), '');
  v_remote boolean := coalesce((p ->> 'remote')::boolean, false);
  v_min integer;
  v_max integer;
  v_cur text := coalesce(p ->> 'currency', 'PKR');
  v_period text := coalesce(p ->> 'pay_period', 'month');
  v_tier public.ranking_tier := nullif(p ->> 'min_tier', '')::public.ranking_tier;
  v_skills jsonb := coalesce(p -> 'min_skill_levels', '[]'::jsonb);
  v_openings integer := coalesce(nullif(p ->> 'openings', '')::integer, 1);
  v_deadline date;
  v_desc text := btrim(coalesce(p ->> 'description', ''));
  v_id uuid;
  j public.job_posts;
begin
  begin
    v_min := (p ->> 'salary_min')::integer;
    v_max := (p ->> 'salary_max')::integer;
    v_deadline := (p ->> 'deadline')::date;
  exception when others then
    raise exception 'check the pay range and the deadline' using errcode = '22023';
  end;
  if v_min is null or v_max is null or v_min <= 0 or v_max < v_min then
    raise exception 'add the stipend or salary range (jobs without pay are not allowed)' using errcode = '22023';
  end if;
  if char_length(v_title) not between 3 and 100 then
    raise exception 'give the role a title of 3 to 100 characters' using errcode = '22023';
  end if;
  if v_type is null or v_type not in ('internship', 'full_time', 'part_time') then
    raise exception 'pick internship, full-time or part-time' using errcode = '22023';
  end if;
  if v_cur not in ('PKR', 'USD') or v_period not in ('month', 'year') then
    raise exception 'pick PKR or USD, per month or per year' using errcode = '22023';
  end if;
  if not v_remote and v_loc is null then
    raise exception 'add a location or mark the role as remote' using errcode = '22023';
  end if;
  if v_openings not between 1 and 100 then
    raise exception 'openings are 1 to 100' using errcode = '22023';
  end if;
  if char_length(v_desc) not between 50 and 5000 then
    raise exception 'describe the role in 50 to 5,000 characters' using errcode = '22023';
  end if;
  if not private.valid_skill_requirements(v_skills) then
    raise exception 'each required skill needs a name and a level from 1 to 4' using errcode = '22023';
  end if;
  if v_deadline is null or v_deadline < current_date then
    raise exception 'the deadline must be today or later' using errcode = '22023';
  end if;
  if p_id is null then
    if not private.rate_limit('job_create:' || v_me::text, 30, interval '1 day') then
      raise exception 'rate limited' using errcode = '54000';
    end if;
    insert into public.job_posts (org_id, created_by, title, type, location, remote, salary_min, salary_max, currency, pay_period,
                                  min_tier, min_skill_levels, openings, deadline, description)
    values (v_org, v_me, v_title, v_type, v_loc, v_remote, v_min, v_max, v_cur, v_period, v_tier, v_skills, v_openings, v_deadline, v_desc)
    returning id into v_id;
    return v_id;
  end if;
  select * into j from public.job_posts where id = p_id and org_id = v_org for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if j.status = 'closed' then
    raise exception 'a closed job can''t be edited' using errcode = '55000';
  end if;
  update public.job_posts
     set title = v_title, type = v_type, location = v_loc, remote = v_remote, salary_min = v_min, salary_max = v_max,
         currency = v_cur, pay_period = v_period, min_tier = v_tier, min_skill_levels = v_skills, openings = v_openings,
         deadline = v_deadline, description = v_desc
   where id = p_id;
  return p_id;
end;
$$;

-- Publishing needs a free job-post slot (plan limit; phase 10 replaces the stub limit).
create function private.publish_job(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  j public.job_posts;
  v_limit integer := private.org_limit('jobs.active_posts');
begin
  perform pg_advisory_xact_lock(hashtextextended('job-slots:' || v_org::text, 0));
  select * into j from public.job_posts where id = p_id and org_id = v_org for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if j.status <> 'draft' then
    raise exception 'only a draft can be published' using errcode = '55000';
  end if;
  if j.deadline < current_date then
    raise exception 'the deadline has passed; change it first' using errcode = '55000';
  end if;
  if v_limit is null or (select count(*) from public.job_posts where org_id = v_org and status = 'live') >= v_limit then
    raise exception 'you have no free job-post slot; close a live job first' using errcode = '55000';
  end if;
  update public.job_posts set status = 'live', published_at = now() where id = p_id;
end;
$$;

create function private.close_job(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  update public.job_posts set status = 'closed', closed_at = now()
   where id = p_id and org_id = v_org and status in ('draft', 'live');
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.jobs_for_org()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  return jsonb_build_object(
    'slots_limit', private.org_limit('jobs.active_posts'),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', j.id, 'title', j.title, 'type', j.type, 'status', j.status, 'deadline', j.deadline,
               'location', j.location, 'remote', j.remote, 'created_at', j.created_at,
               'applicants', (select count(*) from public.job_applications a where a.job_id = j.id and a.stage <> 'withdrawn'),
               'hired', (select count(*) from public.job_applications a where a.job_id = j.id and a.stage = 'hired'),
               'openings', j.openings) order by j.created_at desc)
        from public.job_posts j where j.org_id = v_org), '[]'::jsonb));
end;
$$;

create function private.job_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_row jsonb;
begin
  select to_jsonb(j) - 'created_by' into v_row from public.job_posts j where j.id = p_id and j.org_id = v_org;
  if v_row is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- The pipeline board: every applicant of one job.
create function private.job_applicants(p_job uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  j public.job_posts;
begin
  select * into j from public.job_posts where id = p_job and org_id = v_org;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'status', j.status, 'type', j.type, 'openings', j.openings,
                              'min_tier', j.min_tier, 'min_skill_levels', j.min_skill_levels),
    'applicants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'student_id', a.student_id, 'name', p.full_name, 'university', u.name, 'department', p.department,
               'batch', p.graduation_year, 'tier', rs.tier, 'note', a.note, 'stage', a.stage, 'reject_reason', a.reject_reason,
               'applied_at', a.applied_at, 'stage_changed_at', a.stage_changed_at, 'cv_code', a.cv_code,
               'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'level', us.level) order by us.level desc, s.name), '[]'::jsonb)
                            from (select * from public.user_skills x where x.user_id = a.student_id and x.level >= 1
                                   order by x.level desc limit 5) us join public.skills s on s.id = us.skill_id))
               order by a.applied_at)
        from public.job_applications a
        join public.profiles p on p.user_id = a.student_id
        left join public.universities u on u.id = p.university_id
        left join public.ranking_scores rs on rs.user_id = a.student_id
       where a.job_id = p_job and a.stage <> 'withdrawn'), '[]'::jsonb));
end;
$$;

create function private.application_label(p_reason text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason when 'skills_gap' then 'The skills didn''t match this role closely enough.'
                       when 'position_filled' then 'The position has been filled.'
                       else 'The company has decided not to go ahead.' end;
$$;
revoke all on function private.application_label(text) from public;

-- Moves one application. Forward to any later stage, or to rejected (with a reason). Hired
-- records the hire; every change tells the student the stage and a generic reason, never notes.
create function private.move_application_one(p_org uuid, p_actor uuid, p_id uuid, p_stage public.application_stage, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.job_applications;
  j public.job_posts;
  v_org_name text;
  order_of constant text[] := array['applied', 'screening', 'interview', 'offer', 'hired'];
begin
  select a2.* into a from public.job_applications a2 join public.job_posts jp on jp.id = a2.job_id
   where a2.id = p_id and jp.org_id = p_org for update of a2;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  select * into j from public.job_posts where id = a.job_id;
  if a.stage in ('hired', 'rejected', 'withdrawn') then
    raise exception 'this application is already %', a.stage using errcode = '55000';
  end if;
  if p_stage = 'rejected' then
    if p_reason is null or p_reason not in ('skills_gap', 'position_filled', 'other') then
      raise exception 'pick a reason: skills gap, position filled or other' using errcode = '22023';
    end if;
  elsif p_stage::text = any (order_of) then
    if array_position(order_of, p_stage::text) <= array_position(order_of, a.stage::text) then
      raise exception 'applications only move forward' using errcode = '55000';
    end if;
  else
    raise exception 'unknown stage' using errcode = '22023';
  end if;
  update public.job_applications
     set stage = p_stage, reject_reason = case when p_stage = 'rejected' then p_reason end, stage_changed_at = now()
   where id = a.id;
  insert into public.application_events (application_id, stage, reject_reason, actor_id)
  values (a.id, p_stage, case when p_stage = 'rejected' then p_reason end, p_actor);
  select o.name into v_org_name from public.organizations o where o.id = p_org;
  perform private.notify(a.student_id, null, 'application_stage', 'job_application', a.id,
                         jsonb_build_object('job_title', j.title, 'org_name', v_org_name, 'stage', p_stage,
                                            'reason', case when p_stage = 'rejected' then private.application_label(p_reason) end));
  if p_stage = 'hired' then
    insert into public.hires (org_id, student_id, job_id, application_id, hired_by, job_type, kind)
    values (p_org, a.student_id, j.id, a.id, p_actor, j.type, case when j.type = 'internship' then 'intern' else 'full_time' end)
    on conflict (application_id) do nothing;
    perform private.org_log(p_org, a.student_id, 'hired');
  end if;
end;
$$;
revoke all on function private.move_application_one(uuid, uuid, uuid, public.application_stage, text) from public;

-- Overridden in the API slice; here so the pipeline compiles on its own.
create function private.emit_org_event(p_org uuid, p_event text, p_data jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  null;
end;
$$;
revoke all on function private.emit_org_event(uuid, text, jsonb) from public;

create function private.move_application(p_id uuid, p_stage public.application_stage, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  perform private.move_application_one(v_org, (select auth.uid()), p_id, p_stage, p_reason);
end;
$$;

create function private.bulk_move_applications(p_ids uuid[], p_stage public.application_stage, p_reason text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_id uuid;
  v_n integer := 0;
begin
  if cardinality(p_ids) > 100 then
    raise exception 'move up to 100 at a time' using errcode = '22023';
  end if;
  foreach v_id in array p_ids loop
    perform private.move_application_one(v_org, (select auth.uid()), v_id, p_stage, p_reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Invite people you found (or shortlisted) to apply to a live job.
create function private.invite_to_apply(p_job uuid, p_students uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  j public.job_posts;
  v_s uuid;
  v_n integer := 0;
  v_org_name text;
begin
  select * into j from public.job_posts where id = p_job and org_id = v_org;
  if not found or j.status <> 'live' then
    raise exception 'pick one of your live jobs' using errcode = 'P0002';
  end if;
  if cardinality(p_students) > 50 then
    raise exception 'invite up to 50 people at a time' using errcode = '22023';
  end if;
  if not private.rate_limit('invite_apply:' || v_me::text, 100, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select o.name into v_org_name from public.organizations o where o.id = v_org;
  foreach v_s in array p_students loop
    if private.candidate_access(v_org, v_s) is not null
       and not exists (select 1 from public.job_applications a where a.job_id = p_job and a.student_id = v_s) then
      insert into public.job_invites (job_id, student_id, invited_by) values (p_job, v_s, v_me) on conflict do nothing;
      if found then
        perform private.notify(v_s, null, 'job_invite', 'job_post', p_job, jsonb_build_object('job_title', j.title, 'org_name', v_org_name));
        perform private.org_log(v_org, v_s, 'invited_to_apply');
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hires and the 90-day outcome
-- ---------------------------------------------------------------------------
create function private.hires_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', h.id, 'hired_at', h.hired_at, 'kind', h.kind, 'job_title', j.title,
             'student_name', (select p.full_name from public.profiles p where p.user_id = h.student_id),
             'asked', o.asked_at is not null, 'answer', o.answer, 'answered_at', o.answered_at,
             'due', o.asked_at is not null and o.answer is null) order by h.hired_at desc)
      from public.hires h
      left join public.job_posts j on j.id = h.job_id
      left join public.hire_outcomes o on o.hire_id = h.id
     where h.org_id = v_org), '[]'::jsonb);
end;
$$;

create function private.answer_hire_outcome(p_hire uuid, p_answer text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  if p_answer is null or p_answer not in ('yes', 'partly', 'no', 'left') then
    raise exception 'answer yes, partly, no or left' using errcode = '22023';
  end if;
  update public.hire_outcomes o set answer = p_answer, answered_at = now(), answered_by = (select auth.uid())
   from public.hires h
   where o.hire_id = p_hire and h.id = o.hire_id and h.org_id = v_org and o.answer is null;
  if not found then
    raise exception 'there is no open question for this hire' using errcode = 'P0002';
  end if;
end;
$$;

-- Daily: 90 days after a hire the recruiter gets one question.
create function private.ask_hire_outcomes()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h record;
  v_to uuid;
  v_n integer := 0;
begin
  for h in
    select hi.* from public.hires hi
     where hi.hired_at <= now() - interval '90 days'
       and not exists (select 1 from public.hire_outcomes o where o.hire_id = hi.id)
     limit 500
  loop
    insert into public.hire_outcomes (hire_id) values (h.id) on conflict do nothing;
    select m.user_id into v_to
      from public.org_members m
     where m.org_id = h.org_id and m.status = 'active' and (m.user_id = h.hired_by or m.role = 'admin')
     order by (m.user_id = h.hired_by) desc, m.created_at limit 1;
    perform private.notify(v_to, null, 'hire_outcome_due', 'hire', h.id, '{}'::jsonb);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.ask_hire_outcomes() from public;
select cron.schedule('hire-outcome', '11 5 * * *', $$select private.ask_hire_outcomes()$$);

create function private.close_expired_jobs()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with c as (update public.job_posts set status = 'closed', closed_at = now() where status = 'live' and deadline < current_date returning 1)
  select count(*)::integer from c;
$$;
revoke all on function private.close_expired_jobs() from public;
select cron.schedule('close-expired-jobs', '17 19 * * *', $$select private.close_expired_jobs()$$);

-- ---------------------------------------------------------------------------
-- Company page (signed-in people only: there are no public pages)
-- ---------------------------------------------------------------------------
create function private.company_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  o public.organizations;
  v_member boolean;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into o from public.organizations where slug = p_slug;
  v_member := o.id is not null and exists (select 1 from public.org_members m where m.org_id = o.id and m.user_id = v_me and m.status = 'active');
  if o.id is null or not (o.status = 'verified' or v_member) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  -- Hiring and response statistics are never shown here.
  return jsonb_build_object(
    'id', o.id, 'slug', o.slug, 'name', o.name, 'about', o.about, 'website', o.website, 'industry', o.industry,
    'size', o.size, 'city', o.city, 'locations', to_jsonb(o.locations), 'status', o.status, 'is_member', v_member,
    'blocked', exists (select 1 from public.company_blocks b where b.student_id = v_me and b.org_id = o.id),
    'roles', case when o.status = 'verified' then coalesce((
        select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'type', j.type, 'location', j.location, 'remote', j.remote,
                                            'deadline', j.deadline) order by j.published_at desc)
          from public.job_posts j where j.org_id = o.id and j.status = 'live' and j.deadline >= current_date), '[]'::jsonb)
      else '[]'::jsonb end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Student side: a job, applying, the tracker
-- ---------------------------------------------------------------------------
create function private.job_public(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  j public.job_posts;
  o public.organizations;
  a public.job_applications;
  v_unmet text[];
begin
  select * into j from public.job_posts where id = p_id;
  select * into a from public.job_applications where job_id = p_id and student_id = v_me;
  select * into o from public.organizations where id = j.org_id;
  if j.id is null or o.status <> 'verified' or (j.status <> 'live' and a.id is null)
     or exists (select 1 from public.company_blocks b where b.student_id = v_me and b.org_id = o.id) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  v_unmet := private.unmet_requirements(v_me, j.min_tier, j.min_skill_levels);
  return jsonb_build_object(
    'id', j.id, 'title', j.title, 'type', j.type, 'location', j.location, 'remote', j.remote,
    'salary_min', j.salary_min, 'salary_max', j.salary_max, 'currency', j.currency, 'pay_period', j.pay_period,
    'openings', j.openings, 'deadline', j.deadline, 'description', j.description, 'status', j.status,
    'min_tier', j.min_tier,
    'requirements', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(s.name, e ->> 'skill'), 'min_level', (e ->> 'min_level')::integer)), '[]'::jsonb)
                       from jsonb_array_elements(j.min_skill_levels) e left join public.skills s on s.id = e ->> 'skill'),
    'unmet', to_jsonb(v_unmet),
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'city', o.city),
    'application', case when a.id is not null then jsonb_build_object('id', a.id, 'stage', a.stage) end,
    'invited', exists (select 1 from public.job_invites i where i.job_id = j.id and i.student_id = v_me));
end;
$$;

create function private.apply_to_job(p_job uuid, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  j public.job_posts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_unmet text[];
  v_id uuid;
  v_code text;
  v_org_name text;
begin
  if not private.cv_eligible(v_me) then
    raise exception 'only students with a finished profile can apply' using errcode = '42501';
  end if;
  select * into j from public.job_posts where id = p_job;
  if j.id is null or j.status <> 'live' or j.deadline < current_date
     or not exists (select 1 from public.organizations o where o.id = j.org_id and o.status = 'verified')
     or exists (select 1 from public.company_blocks b where b.student_id = v_me and b.org_id = j.org_id) then
    raise exception 'this job isn''t open for applications' using errcode = 'P0002';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'keep the note under 300 characters' using errcode = '22023';
  end if;
  v_unmet := private.unmet_requirements(v_me, j.min_tier, j.min_skill_levels);
  if cardinality(v_unmet) > 0 then
    raise exception 'you don''t meet the requirements yet: %', array_to_string(v_unmet, ', ') using errcode = '55000';
  end if;
  if not private.rate_limit('apply:' || v_me::text, 30, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  if exists (select 1 from public.job_applications a where a.job_id = p_job and a.student_id = v_me) then
    raise exception 'you already applied to this job' using errcode = '23505';
  end if;
  select r.code into v_code from public.cv_records r
   where r.user_id = v_me and r.revoked_at is null and r.superseded_by is null and r.expires_at > now()
   order by r.version desc limit 1;
  insert into public.job_applications (job_id, student_id, note, cv_code) values (p_job, v_me, v_note, v_code) returning id into v_id;
  insert into public.application_events (application_id, stage, actor_id) values (v_id, 'applied', v_me);
  select o.name into v_org_name from public.organizations o where o.id = j.org_id;
  perform private.notify(j.created_by, null, 'job_application_received', 'job_application', v_id,
                         jsonb_build_object('job_title', j.title, 'org_name', v_org_name));
  perform private.emit_org_event(j.org_id, 'application.created', jsonb_build_object('application_id', v_id, 'job_id', j.id, 'candidate_id', v_me));
  return v_id;
end;
$$;

create function private.withdraw_job_application(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  update public.job_applications set stage = 'withdrawn', stage_changed_at = now()
   where id = p_id and student_id = v_me and stage not in ('hired', 'rejected', 'withdrawn');
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  insert into public.application_events (application_id, stage, actor_id) values (p_id, 'withdrawn', v_me);
end;
$$;

create function private.application_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row jsonb;
begin
  select jsonb_build_object(
           'id', a.id, 'stage', a.stage, 'note', a.note, 'applied_at', a.applied_at,
           'reason', case when a.stage = 'rejected' then private.application_label(a.reject_reason) end,
           'job', jsonb_build_object('id', j.id, 'title', j.title, 'type', j.type),
           'org', jsonb_build_object('name', o.name, 'slug', o.slug),
           -- The student sees the stages and dates, never private notes.
           'history', (select coalesce(jsonb_agg(jsonb_build_object('stage', e.stage, 'at', e.at) order by e.at, e.id), '[]'::jsonb)
                         from public.application_events e where e.application_id = a.id))
    into v_row
    from public.job_applications a
    join public.job_posts j on j.id = a.job_id
    join public.organizations o on o.id = j.org_id
   where a.id = p_id and a.student_id = v_me;
  if v_row is null then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- The Opportunities tabs (PRD 5.25): jobs by match, requests, the student's own applications,
-- competitions. "For you" is ordered by skill match alone.
create or replace function private.opportunities(p_tab text, p_after integer default 0)
returns table (id uuid, kind text, title text, org_name text, detail text, href text, starts_at timestamptz, sponsored boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_tab is null or p_tab <> all (array['for_you', 'jobs', 'contact_requests', 'applications', 'competitions', 'job_fairs', 'ideas']) then
    raise exception 'unknown tab' using errcode = '22023';
  end if;
  if p_tab in ('for_you', 'jobs') then
    return query
    select j.id, 'job'::text, j.title, o.name,
           initcap(replace(j.type, '_', '-')) || ' · ' || coalesce(j.location, 'Remote') || ' · ' || j.currency || ' '
             || to_char(j.salary_min, 'FM999,999,999') || '–' || to_char(j.salary_max, 'FM999,999,999') || ' per ' || j.pay_period,
           '/opportunities/jobs/' || j.id::text, j.deadline::timestamptz, false
      from public.job_posts j
      join public.organizations o on o.id = j.org_id and o.status = 'verified'
     where j.status = 'live' and j.deadline >= current_date
       and not exists (select 1 from public.company_blocks b where b.student_id = v_me and b.org_id = j.org_id)
       and (p_tab = 'jobs' or (
             cardinality(private.unmet_requirements(v_me, j.min_tier, j.min_skill_levels)) = 0
             and (jsonb_array_length(j.min_skill_levels) > 0 or j.min_tier is not null)))
     order by (select count(*) from jsonb_array_elements(j.min_skill_levels) e
                where coalesce((select us.level from public.user_skills us where us.user_id = v_me and us.skill_id = e ->> 'skill'), 0) >= 2) desc,
              j.published_at desc
     limit 50 offset greatest(coalesce(p_after, 0), 0);
  elsif p_tab = 'contact_requests' then
    -- Every company that contacted the student (PRD 5.20), the ones waiting for an answer first.
    return query
    select c.id, 'contact_request'::text, c.role_title, o.name,
           case when c.status = 'pending' and c.expires_at > now() then 'Answer by ' || to_char(c.expires_at, 'DD Mon')
                when c.status = 'pending' then 'Expired'
                else initcap(c.status::text) end,
           '/opportunities/contact-requests/' || c.id::text, c.created_at, false
      from public.contact_requests c join public.organizations o on o.id = c.org_id
     where c.student_id = v_me
     order by (c.status = 'pending' and c.expires_at > now()) desc, c.created_at desc
     limit 50 offset greatest(coalesce(p_after, 0), 0);
  elsif p_tab = 'applications' then
    return query
    select a.id, 'application'::text, j.title, o.name, initcap(a.stage::text),
           '/opportunities/applications/' || a.id::text, a.applied_at, false
      from public.job_applications a
      join public.job_posts j on j.id = a.job_id
      join public.organizations o on o.id = j.org_id
     where a.student_id = v_me
     order by a.stage_changed_at desc limit 50 offset greatest(coalesce(p_after, 0), 0);
  elsif p_tab = 'competitions' then
    return query
    select c.id, 'competition'::text, c.title, o.name, initcap(c.status::text) || ' · prize: ' || c.prize,
           '/competitions/' || c.id::text, c.starts_at, false
      from public.competitions c join public.organizations o on o.id = c.org_id
     where c.status in ('approved', 'live', 'frozen', 'judged')
       and (cardinality(c.eligible_universities) = 0
            or (select p.university_id from public.profiles p where p.user_id = v_me) = any (c.eligible_universities))
     order by c.starts_at desc limit 50 offset greatest(coalesce(p_after, 0), 0);
  end if;
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Competitions (Growth: one a quarter; an admin reviews every brief)
-- ---------------------------------------------------------------------------
create type public.competition_status as enum ('draft', 'in_review', 'rejected', 'approved', 'live', 'frozen', 'judged');

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  role text not null check (char_length(btrim(role)) between 2 and 80),
  skills jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  brief text not null check (char_length(brief) between 100 and 6000),
  brief_template text check (brief_template is null or char_length(brief_template) <= 40),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  team_size smallint not null default 1 check (team_size between 1 and 3),
  eligible_universities uuid[] not null default '{}',
  min_tier public.ranking_tier,
  prize text not null check (char_length(btrim(prize)) between 3 and 300),
  rubric jsonb not null check (jsonb_typeof(rubric) = 'array'),
  status public.competition_status not null default 'draft',
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  winner_team_id uuid,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at + interval '7 days' and ends_at <= starts_at + interval '22 days')
);
comment on table public.competitions is 'Recruiter skill competitions (PRD 5.20). Repo provisioning by the GitHub App is deferred: teams submit a repository URL.';
create index competitions_org_idx on public.competitions (org_id, created_at desc);
create index competitions_status_idx on public.competitions (status, starts_at);

create table public.competition_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  lead_id uuid not null references auth.users (id) on delete cascade,
  repo_url text check (repo_url is null or repo_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  submitted_at timestamptz,
  -- Recorded at freeze time where the repository could be read.
  frozen_sha text check (frozen_sha is null or frozen_sha ~ '^[0-9a-f]{40}$'),
  frozen_checked_at timestamptz,
  frozen_note text check (frozen_note is null or char_length(frozen_note) <= 200),
  scores jsonb,
  total numeric(6, 2),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  placement integer,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);
create index competition_teams_comp_idx on public.competition_teams (competition_id);

create table public.competition_team_members (
  team_id uuid not null references public.competition_teams (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  created_at timestamptz not null default now(),
  primary key (team_id, student_id),
  -- One team per person per competition.
  unique (competition_id, student_id)
);

create table public.competition_awards (
  student_id uuid not null references auth.users (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  skill_id text not null references public.skills (id),
  kind text not null check (kind in ('participant', 'winner')),
  created_at timestamptz not null default now(),
  primary key (student_id, competition_id, skill_id)
);
comment on table public.competition_awards is 'L3 evidence for every submitting participant and a winner badge that counts as one L4 signal (PRD 5.20).';

alter table public.competitions enable row level security;
alter table public.competition_teams enable row level security;
alter table public.competition_team_members enable row level security;
alter table public.competition_awards enable row level security;
revoke all on table public.competitions, public.competition_teams, public.competition_team_members,
  public.competition_awards from anon, authenticated;

-- L3: submitting a competition entry in the skill. L4: a winner badge is one signal toward the
-- same endorsement threshold (so a win plus one teammate endorsement, not a win on its own);
-- the rest of the rule is the teacher migration's (one teacher endorsement, or a passed code check).
create or replace function private.l3_skills(p_user uuid)
returns table (skill_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.skill_id
    from public.github_pr_skills s
    join public.github_pull_requests p
      on p.user_id = s.user_id and p.repo_github_id = s.repo_github_id and p.number = s.number
   where s.user_id = p_user and p.counted
  union
  select unnest(e.skill_ids)
    from public.contributions o
    cross join lateral (
      select c.id, c.skill_ids from public.contributions c
       where c.id = o.id or c.corrects_id = o.id
       order by c.created_at desc, (c.id = o.id)
       limit 1
    ) e
   where o.user_id = p_user and o.corrects_id is null and o.source = 'manual'
     and exists (select 1 from public.contribution_confirmations k
                  where k.contribution_id = e.id and k.confirmer_id <> o.user_id)
  union
  select se.skill_id
    from public.contributions o
    join public.skill_evidence se on se.user_id = o.user_id and se.sha = o.commit_sha
   where o.user_id = p_user and o.source = 'github' and o.before_venture
     and exists (select 1 from public.contribution_confirmations k
                  where k.contribution_id = o.id and k.confirmer_id <> o.user_id)
  union
  select a.skill_id from public.competition_awards a where a.student_id = p_user;
$$;

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
  select c.skill_id from public.code_checks c where c.user_id = p_user and c.status = 'passed'
  union
  select a.skill_id
    from public.competition_awards a
   where a.student_id = p_user and a.kind = 'winner'
     and 1 + (select count(distinct e.endorser_id) from public.endorsements e
               where e.endorsee_id = p_user and e.skill_id = a.skill_id and not e.hidden and e.evidence_id is not null
                 and private.entry_shows_skill(e.evidence_id, e.skill_id))
         >= private.endorsement_limit('peer_verified_min');
$$;

create function private.rubric_ok(p jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 2 and 6
     and not exists (select 1 from jsonb_array_elements(p) e
                      where jsonb_typeof(e) <> 'object' or char_length(btrim(coalesce(e ->> 'criterion', ''))) not between 2 and 80
                         or coalesce(e ->> 'weight', '') !~ '^[0-9]{1,3}$')
     and (select coalesce(sum((e ->> 'weight')::integer), 0) from jsonb_array_elements(p) e) = 100;
$$;
revoke all on function private.rubric_ok(jsonb) from public;

create function private.save_competition(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  c public.competitions;
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_role text := btrim(coalesce(p ->> 'role', ''));
  v_skills jsonb := coalesce(p -> 'skills', '[]'::jsonb);
  v_brief text := btrim(coalesce(p ->> 'brief', ''));
  v_start date;
  v_end date;
  v_size integer := coalesce(nullif(p ->> 'team_size', '')::integer, 1);
  v_unis uuid[] := coalesce(array(select u::uuid from jsonb_array_elements_text(coalesce(p -> 'eligible_universities', '[]'::jsonb)) u), '{}');
  v_tier public.ranking_tier := nullif(p ->> 'min_tier', '')::public.ranking_tier;
  v_prize text := btrim(coalesce(p ->> 'prize', ''));
  v_rubric jsonb := coalesce(p -> 'rubric', '[]'::jsonb);
  v_id uuid;
begin
  if not private.org_entitled(v_org, 'competitions.create') then
    raise exception 'competitions aren''t part of your plan yet' using errcode = '55000';
  end if;
  begin
    v_start := (p ->> 'starts_on')::date;
    v_end := (p ->> 'ends_on')::date;
  exception when others then
    raise exception 'check the dates' using errcode = '22023';
  end;
  if v_start is null or v_end is null or v_end - v_start not between 7 and 21 then
    raise exception 'a competition runs 7 to 21 days' using errcode = '22023';
  end if;
  if char_length(v_title) not between 3 and 100 or char_length(v_role) not between 2 and 80 then
    raise exception 'give the competition a title and name the role' using errcode = '22023';
  end if;
  if char_length(v_brief) not between 100 and 6000 then
    raise exception 'the brief is 100 to 6,000 characters' using errcode = '22023';
  end if;
  if v_size not between 1 and 3 then
    raise exception 'teams are 1 to 3 people' using errcode = '22023';
  end if;
  if char_length(v_prize) not between 3 and 300 then
    raise exception 'a prize is required' using errcode = '22023';
  end if;
  if not private.valid_skill_requirements(v_skills) or jsonb_array_length(v_skills) = 0 then
    raise exception 'add the skills the brief tests' using errcode = '22023';
  end if;
  if not private.rubric_ok(v_rubric) then
    raise exception 'the rubric needs 2 to 6 criteria whose weights add up to 100' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.competitions (org_id, created_by, title, role, skills, brief, brief_template, starts_at, ends_at, team_size,
                                     eligible_universities, min_tier, prize, rubric)
    values (v_org, v_me, v_title, v_role, v_skills, v_brief, nullif(p ->> 'brief_template', ''),
            (v_start::text || ' 00:00 Asia/Karachi')::timestamptz, (v_end::text || ' 23:59:59 Asia/Karachi')::timestamptz,
            v_size, v_unis, v_tier, v_prize, v_rubric)
    returning id into v_id;
    return v_id;
  end if;
  select * into c from public.competitions where id = p_id and org_id = v_org for update;
  if not found then
    raise exception 'competition not found' using errcode = 'P0002';
  end if;
  if c.status not in ('draft', 'rejected') then
    raise exception 'only a draft or rejected brief can be edited' using errcode = '55000';
  end if;
  update public.competitions
     set title = v_title, role = v_role, skills = v_skills, brief = v_brief, brief_template = nullif(p ->> 'brief_template', ''),
         starts_at = (v_start::text || ' 00:00 Asia/Karachi')::timestamptz,
         ends_at = (v_end::text || ' 23:59:59 Asia/Karachi')::timestamptz,
         team_size = v_size, eligible_universities = v_unis, min_tier = v_tier, prize = v_prize, rubric = v_rubric,
         status = 'draft'
   where id = p_id;
  return p_id;
end;
$$;

-- Growth: one competition per quarter.
create function private.submit_competition(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  c public.competitions;
begin
  select * into c from public.competitions where id = p_id and org_id = v_org for update;
  if not found then
    raise exception 'competition not found' using errcode = 'P0002';
  end if;
  if c.status not in ('draft', 'rejected') then
    raise exception 'this brief was already sent for review' using errcode = '55000';
  end if;
  if c.starts_at <= now() + interval '1 day' then
    raise exception 'start at least two days from now so a reviewer has time' using errcode = '55000';
  end if;
  if exists (select 1 from public.competitions x
              where x.org_id = v_org and x.id <> p_id and x.status in ('in_review', 'approved', 'live', 'frozen', 'judged')
                and date_trunc('quarter', x.created_at) = date_trunc('quarter', now())) then
    raise exception 'your plan includes one competition per quarter' using errcode = '55000';
  end if;
  update public.competitions set status = 'in_review' where id = p_id;
end;
$$;

create function private.competitions_for_org()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  return jsonb_build_object(
    'entitled', private.org_entitled(v_org, 'competitions.create'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', c.id, 'title', c.title, 'status', c.status, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
                         'teams', (select count(*) from public.competition_teams t where t.competition_id = c.id),
                         'review_note', c.review_note) order by c.created_at desc)
                        from public.competitions c where c.org_id = v_org), '[]'::jsonb));
end;
$$;

create function private.competition_manage(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  c public.competitions;
begin
  select * into c from public.competitions where id = p_id and org_id = v_org;
  if not found then
    raise exception 'competition not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'competition', to_jsonb(c) - 'created_by' - 'reviewed_by',
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'repo_url', t.repo_url, 'submitted_at', t.submitted_at, 'frozen_sha', t.frozen_sha,
               'frozen_note', t.frozen_note, 'scores', t.scores, 'total', t.total, 'feedback', t.feedback, 'placement', t.placement,
               'members', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                             from public.competition_team_members m join public.profiles p on p.user_id = m.student_id
                            where m.team_id = t.id and m.status = 'joined'))
               order by t.total desc nulls last, t.created_at)
        from public.competition_teams t where t.competition_id = c.id), '[]'::jsonb));
end;
$$;

-- Scoring: only after the deadline, only entries that submitted a repository.
create function private.score_team(p_team uuid, p_scores jsonb, p_feedback text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  c public.competitions;
  t public.competition_teams;
  e jsonb;
  v_total numeric := 0;
  v_value numeric;
begin
  select ct.* into t from public.competition_teams ct where ct.id = p_team;
  select * into c from public.competitions where id = t.competition_id and org_id = v_org;
  if t.id is null or c.id is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  if c.status <> 'frozen' then
    raise exception 'entries can be scored after the deadline, until you finish the competition' using errcode = '55000';
  end if;
  if t.repo_url is null then
    raise exception 'this team didn''t submit a repository' using errcode = '55000';
  end if;
  for e in select * from jsonb_array_elements(c.rubric) loop
    begin
      v_value := (p_scores ->> (e ->> 'criterion'))::numeric;
    exception when others then
      v_value := null;
    end;
    if v_value is null or v_value < 0 or v_value > 10 then
      raise exception 'score every criterion from 0 to 10' using errcode = '22023';
    end if;
    v_total := v_total + v_value * (e ->> 'weight')::numeric / 10;
  end loop;
  update public.competition_teams set scores = p_scores, total = round(v_total, 2), feedback = nullif(left(btrim(coalesce(p_feedback, '')), 2000), '')
   where id = p_team;
end;
$$;

-- Finishing ranks the scored entries, names the winner, and awards the evidence.
create function private.finish_competition(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  c public.competitions;
  v_winner uuid;
  m record;
  s record;
begin
  select * into c from public.competitions where id = p_id and org_id = v_org for update;
  if not found then
    raise exception 'competition not found' using errcode = 'P0002';
  end if;
  if c.status <> 'frozen' then
    raise exception 'finish a competition after its deadline' using errcode = '55000';
  end if;
  if exists (select 1 from public.competition_teams t where t.competition_id = p_id and t.repo_url is not null and t.total is null) then
    raise exception 'score every submitted entry first' using errcode = '55000';
  end if;
  update public.competition_teams t set placement = r.rank
    from (select id, rank() over (order by total desc) as rank from public.competition_teams
           where competition_id = p_id and total is not null) r
   where t.id = r.id;
  select id into v_winner from public.competition_teams where competition_id = p_id and placement = 1 order by created_at limit 1;
  for m in
    select tm.student_id, t.id as team_id from public.competition_team_members tm
      join public.competition_teams t on t.id = tm.team_id
     where tm.competition_id = p_id and tm.status = 'joined' and t.total is not null
  loop
    for s in select e ->> 'skill' as skill_id from jsonb_array_elements(c.skills) e loop
      insert into public.competition_awards (student_id, competition_id, skill_id, kind)
      values (m.student_id, p_id, s.skill_id, case when m.team_id = v_winner then 'winner' else 'participant' end)
      on conflict (student_id, competition_id, skill_id) do update set kind = excluded.kind;
    end loop;
    perform private.recompute_user_skills(m.student_id);
    perform private.notify(m.student_id, null, 'competition_result', 'competition', p_id,
                           jsonb_build_object('title', c.title, 'winner', m.team_id = v_winner));
  end loop;
  update public.competitions set status = 'judged', winner_team_id = v_winner where id = p_id;
end;
$$;

-- Staff: review briefs (accounts staff, two-factor), audited.
create function private.ops_competitions(p_status text default 'in_review')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'org', o.name, 'role', c.role, 'prize', c.prize,
                                        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'status', c.status, 'brief', c.brief,
                                        'rubric', c.rubric, 'skills', c.skills) order by c.created_at)
      from public.competitions c join public.organizations o on o.id = c.org_id
     where c.status = p_status::public.competition_status), '[]'::jsonb);
end;
$$;

create function private.ops_review_competition(p_id uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  c public.competitions;
  v_reason text := btrim(coalesce(p_reason, ''));
  r record;
begin
  select * into c from public.competitions where id = p_id for update;
  if not found or c.status <> 'in_review' then
    raise exception 'brief not found or not waiting for review' using errcode = 'P0002';
  end if;
  if not p_approve and char_length(v_reason) < 3 then
    raise exception 'tell the organisation why (for example, briefs that ask for free product work are refused)' using errcode = '22023';
  end if;
  update public.competitions
     set status = (case when p_approve then 'approved' else 'rejected' end)::public.competition_status, review_note = nullif(v_reason, ''),
         reviewed_by = v_me, reviewed_at = now()
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_approve then 'competition.approve' else 'competition.reject' end, 'competition', p_id::text,
          coalesce(nullif(v_reason, ''), 'approved brief'), jsonb_build_object('status', 'in_review'),
          jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end));
  for r in select m.user_id from public.org_members m where m.org_id = c.org_id and m.status = 'active' and m.role in ('admin', 'recruiter') loop
    perform private.notify(r.user_id, null, 'competition_decided', 'competition', p_id,
                           jsonb_build_object('title', c.title, 'approved', p_approve, 'reason', nullif(v_reason, '')));
  end loop;
end;
$$;

-- Every 10 minutes: approved briefs go live at their start, live ones freeze at their deadline.
create function private.competitions_tick()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.competitions set status = 'live' where status = 'approved' and starts_at <= now();
  update public.competitions set status = 'frozen' where status = 'live' and ends_at <= now();
$$;
revoke all on function private.competitions_tick() from public;
select cron.schedule('competitions-tick', '*/10 * * * *', $$select private.competitions_tick()$$);

-- Student side ----------------------------------------------------------------------------
create function private.competition_public(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  c public.competitions;
  v_team uuid;
  v_uni uuid := (select p.university_id from public.profiles p where p.user_id = v_me);
  v_unmet text[];
begin
  select * into c from public.competitions where id = p_id;
  if c.id is null or c.status not in ('approved', 'live', 'frozen', 'judged')
     or (cardinality(c.eligible_universities) > 0 and v_uni <> all (c.eligible_universities)) then
    raise exception 'competition not found' using errcode = 'P0002';
  end if;
  select team_id into v_team from public.competition_team_members where competition_id = p_id and student_id = v_me;
  v_unmet := private.unmet_requirements(v_me, c.min_tier, '[]'::jsonb);
  return jsonb_build_object(
    'id', c.id, 'title', c.title, 'role', c.role, 'brief', c.brief, 'status', c.status, 'prize', c.prize,
    'starts_at', c.starts_at, 'ends_at', c.ends_at, 'team_size', c.team_size, 'min_tier', c.min_tier,
    'rubric', c.rubric, 'eligible', cardinality(v_unmet) = 0, 'unmet', to_jsonb(v_unmet),
    'skills', (select coalesce(jsonb_agg(coalesce(s.name, e ->> 'skill')), '[]'::jsonb)
                 from jsonb_array_elements(c.skills) e left join public.skills s on s.id = e ->> 'skill'),
    'org', (select jsonb_build_object('name', o.name, 'slug', o.slug) from public.organizations o where o.id = c.org_id),
    'team', case when v_team is not null then (
        select jsonb_build_object(
                 'id', t.id, 'name', t.name, 'is_lead', t.lead_id = v_me, 'repo_url', t.repo_url, 'submitted_at', t.submitted_at,
                 'frozen_sha', t.frozen_sha, 'total', case when c.status = 'judged' then t.total end,
                 'placement', case when c.status = 'judged' then t.placement end,
                 'feedback', case when c.status = 'judged' then t.feedback end,
                 'my_status', (select m.status from public.competition_team_members m where m.team_id = t.id and m.student_id = v_me),
                 'members', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'status', m.status) order by m.created_at), '[]'::jsonb)
                               from public.competition_team_members m join public.profiles p on p.user_id = m.student_id where m.team_id = t.id))
          from public.competition_teams t where t.id = v_team) end);
end;
$$;

create function private.create_team(p_competition uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  c public.competitions;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  select * into c from public.competitions where id = p_competition for update;
  if c.id is null or c.status not in ('approved', 'live') or c.ends_at <= now() then
    raise exception 'registration isn''t open' using errcode = '55000';
  end if;
  if not private.cv_eligible(v_me) then
    raise exception 'only students with a finished profile can enter' using errcode = '42501';
  end if;
  if cardinality(c.eligible_universities) > 0
     and (select p.university_id from public.profiles p where p.user_id = v_me) <> all (c.eligible_universities) then
    raise exception 'this competition isn''t open to your university' using errcode = '42501';
  end if;
  if cardinality(private.unmet_requirements(v_me, c.min_tier, '[]'::jsonb)) > 0 then
    raise exception 'you need % tier to enter', initcap(c.min_tier::text) using errcode = '55000';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'name your team (2 to 60 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from public.competition_team_members m where m.competition_id = p_competition and m.student_id = v_me) then
    raise exception 'you''re already in a team for this competition' using errcode = '23505';
  end if;
  insert into public.competition_teams (competition_id, name, lead_id) values (p_competition, v_name, v_me) returning id into v_id;
  insert into public.competition_team_members (team_id, competition_id, student_id, status) values (v_id, p_competition, v_me, 'joined');
  return v_id;
exception when unique_violation then
  raise exception 'that team name is taken in this competition' using errcode = '23505';
end;
$$;

create function private.invite_team_member(p_team uuid, p_username text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  t public.competition_teams;
  c public.competitions;
  v_other uuid := private.user_id_for(p_username);
begin
  select * into t from public.competition_teams where id = p_team and lead_id = v_me;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  select * into c from public.competitions where id = t.competition_id;
  if c.status not in ('approved', 'live') or c.ends_at <= now() then
    raise exception 'registration is closed' using errcode = '55000';
  end if;
  if v_other is null or v_other = v_me or private.is_blocked(v_me, v_other)
     or not exists (select 1 from public.profiles p where p.user_id = v_other and p.role = 'student' and p.onboarding_complete) then
    raise exception 'no student has that username' using errcode = 'P0002';
  end if;
  if (select count(*) from public.competition_team_members m where m.team_id = p_team) >= c.team_size then
    raise exception 'this team is full (up to % people)', c.team_size using errcode = '23514';
  end if;
  if exists (select 1 from public.competition_team_members m where m.competition_id = c.id and m.student_id = v_other) then
    raise exception 'that student is already in a team' using errcode = '23505';
  end if;
  insert into public.competition_team_members (team_id, competition_id, student_id) values (p_team, c.id, v_other);
  perform private.notify(v_other, v_me, 'team_invite', 'competition', c.id, jsonb_build_object('title', c.title, 'team', t.name));
end;
$$;

create function private.respond_team_invite(p_team uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_accept then
    update public.competition_team_members set status = 'joined' where team_id = p_team and student_id = v_me and status = 'invited';
  else
    delete from public.competition_team_members where team_id = p_team and student_id = v_me and status = 'invited';
  end if;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.submit_repo(p_team uuid, p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_url text := regexp_replace(btrim(coalesce(p_url, '')), '(\.git|/)$', '');
  c public.competitions;
begin
  select c2.* into c from public.competitions c2 join public.competition_teams t on t.competition_id = c2.id
   where t.id = p_team and t.lead_id = v_me;
  if c.id is null then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if c.status <> 'live' or c.ends_at <= now() then
    raise exception 'submissions are frozen' using errcode = '55000';
  end if;
  if v_url !~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    raise exception 'paste the repository address, like https://github.com/team/project' using errcode = '22023';
  end if;
  update public.competition_teams set repo_url = v_url, submitted_at = now() where id = p_team;
end;
$$;

-- Service side: the freeze worker records each submitted repository's latest commit where it can be read.
create function private.competition_freeze_candidates()
returns table (team_id uuid, repo_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.repo_url from public.competition_teams t join public.competitions c on c.id = t.competition_id
   where c.status in ('frozen', 'judged') and t.repo_url is not null and t.frozen_checked_at is null
   order by c.ends_at limit 50;
$$;
create function private.competition_freeze_record(p_team uuid, p_sha text, p_note text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.competition_teams
     set frozen_sha = case when p_sha ~ '^[0-9a-f]{40}$' then p_sha end, frozen_checked_at = now(), frozen_note = left(p_note, 200)
   where id = p_team and frozen_checked_at is null;
$$;
revoke all on function private.competition_freeze_candidates(), private.competition_freeze_record(uuid, text, text) from public;
grant execute on function private.competition_freeze_candidates(), private.competition_freeze_record(uuid, text, text) to service_role;

create function private.wake_competition_freeze()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from private.competition_freeze_candidates()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'competition_freeze_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/competition-freeze',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
end;
$$;
revoke all on function private.wake_competition_freeze() from public;
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'competition_freeze_secret',
                           'Bearer secret for the competition-freeze Edge Function')
where not exists (select 1 from vault.secrets where name = 'competition_freeze_secret');
select cron.schedule('competition-freeze', '*/5 * * * *', $$select private.wake_competition_freeze()$$);

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
  'save_job', 'publish_job', 'close_job', 'jobs_for_org', 'job_get', 'job_applicants', 'move_application',
  'bulk_move_applications', 'invite_to_apply', 'hires_list', 'answer_hire_outcome', 'company_page',
  'job_public', 'apply_to_job', 'withdraw_job_application', 'application_get',
  'save_competition', 'submit_competition', 'competitions_for_org', 'competition_manage', 'score_team', 'finish_competition',
  'ops_competitions', 'ops_review_competition',
  'competition_public', 'create_team', 'invite_team_member', 'respond_team_invite', 'submit_repo'
]);

drop function pg_temp.expose(text[]);
