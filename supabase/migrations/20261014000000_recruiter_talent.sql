-- Phase 8, slice 2: the talent index and search, the candidate view, shortlists and notes,
-- contact requests (with the recruiter–student chat), saved searches and the student's side of
-- all of it (PRD 5.20).
--
-- The talent index is a table kept by functions, not a materialised view (decisions.md
-- 2026-10-03): a visibility change removes one row at once instead of refreshing a whole view, and
-- the table has no name, photo or username column at all, so Explore can't return them even through a
-- direct query. There are no parameters for protected attributes and unknown filter keys are refused.

-- ---------------------------------------------------------------------------
-- What students tell recruiters: availability, city, remote
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column availability text[] not null default '{}'
    check (availability <@ array['internship', 'full_time', 'part_time']::text[]),
  add column city text check (city is null or char_length(city) between 2 and 60),
  add column remote_ok boolean not null default false;
comment on column public.profiles.availability is 'What the student is open to (PRD 5.20); shown to recruiters only with recruiter visibility on.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.talent_index (
  student_id uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete cascade,
  department text,
  graduation_year smallint,
  tier public.ranking_tier,
  -- {skill id: level 1-4}
  skills jsonb not null default '{}'::jsonb,
  -- skills with a passed code check
  checked_skills text[] not null default '{}',
  last_active_at timestamptz,
  looking_for text[] not null default '{}',
  availability text[] not null default '{}',
  city text,
  remote_ok boolean not null default false,
  first_indexed_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);
comment on table public.talent_index is
  'Recruiter-visible students only (PRD 5.20). Deliberately has no name, photo, username, gender, age, religion or ethnicity.';
create index talent_index_skills_idx on public.talent_index using gin (skills);
create index talent_index_university_idx on public.talent_index (university_id);
create index talent_index_tier_idx on public.talent_index (tier);
create index talent_index_active_idx on public.talent_index (last_active_at desc);

create table public.search_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  mode text not null check (mode in ('explore', 'full')),
  filters jsonb not null,
  result_count integer not null,
  at timestamptz not null default now()
);
comment on table public.search_audit is 'Every talent search, for audit (PRD 5.20). Staff read only.';
create index search_audit_org_idx on public.search_audit (org_id, at desc);

create table public.profile_views (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  viewer_id uuid references auth.users (id) on delete set null,
  day date not null default (now() at time zone 'utc')::date,
  at timestamptz not null default now(),
  unique (viewer_id, student_id, day)
);
create index profile_views_student_idx on public.profile_views (student_id, at desc);
create index profile_views_org_idx on public.profile_views (org_id, at desc);

create table public.org_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  student_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('viewed', 'contact_sent', 'shortlisted', 'noted', 'invited_to_apply', 'hired')),
  at timestamptz not null default now()
);
create index org_events_org_idx on public.org_events (org_id, at desc);
create index org_events_student_idx on public.org_events (org_id, student_id, at desc);

create table public.recruiter_shortlists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index recruiter_shortlists_org_idx on public.recruiter_shortlists (org_id, created_at);

create table public.shortlist_items (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.recruiter_shortlists (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  position integer not null default 0,
  added_by uuid references auth.users (id) on delete set null,
  -- Set when the student turns recruiter visibility off: shown as "no longer visible".
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shortlist_id, student_id)
);
create index shortlist_items_student_idx on public.shortlist_items (student_id);

create table public.recruiter_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Nulled (and the text blanked) when the student deletes their account.
  student_id uuid references auth.users (id) on delete set null,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index recruiter_notes_student_idx on public.recruiter_notes (org_id, student_id, created_at desc);

create type public.contact_status as enum ('pending', 'accepted', 'declined', 'expired');

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  recruiter_id uuid references auth.users (id) on delete set null,
  student_id uuid not null references auth.users (id) on delete cascade,
  role_title text not null check (char_length(btrim(role_title)) between 2 and 80),
  message text not null check (char_length(message) between 50 and 1000),
  status public.contact_status not null default 'pending',
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  thread_id uuid references public.chat_threads (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  closed_at timestamptz
);
comment on table public.contact_requests is 'A recruiter asks a student to talk (PRD 5.20). One credit per request, never refunded.';
create unique index contact_requests_pending_idx on public.contact_requests (org_id, student_id) where status = 'pending';
create index contact_requests_student_idx on public.contact_requests (student_id, created_at desc);
create index contact_requests_org_idx on public.contact_requests (org_id, created_at desc);
create index contact_requests_recruiter_idx on public.contact_requests (recruiter_id, created_at desc);
create index contact_requests_pending_expiry_idx on public.contact_requests (expires_at) where status = 'pending';

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  filters jsonb not null,
  frequency text not null check (frequency in ('daily', 'weekly')),
  last_run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index saved_searches_due_idx on public.saved_searches (last_run_at);
create index saved_searches_user_idx on public.saved_searches (user_id);

alter table public.talent_index enable row level security;
alter table public.search_audit enable row level security;
alter table public.profile_views enable row level security;
alter table public.org_events enable row level security;
alter table public.recruiter_shortlists enable row level security;
alter table public.shortlist_items enable row level security;
alter table public.recruiter_notes enable row level security;
alter table public.contact_requests enable row level security;
alter table public.saved_searches enable row level security;
revoke all on table public.talent_index, public.search_audit, public.profile_views, public.org_events,
  public.recruiter_shortlists, public.shortlist_items, public.recruiter_notes, public.contact_requests,
  public.saved_searches from anon, authenticated;
-- Default deny: every read and write goes through the functions below.

-- ---------------------------------------------------------------------------
-- Chat: a recruiter conversation is a DM labelled with the company, which the student can close
-- ---------------------------------------------------------------------------
alter table public.chat_threads
  add column org_id uuid references public.organizations (id) on delete set null,
  add column closed_at timestamptz;
comment on column public.chat_threads.org_id is 'Set on a recruiter–student conversation (PRD 5.20): shown with the company name.';
comment on column public.chat_threads.closed_at is 'The student closed a recruiter conversation; nobody can write or read it in the list.';

create or replace function private.dm_blocked(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads t join public.chat_thread_members m on m.thread_id = t.id
     where t.id = p_thread and t.type = 'dm' and m.user_id <> (select auth.uid())
       and (private.is_blocked_with(m.user_id) or t.closed_at is not null)
  );
$$;

create or replace function private.my_threads()
returns table (id uuid, type public.chat_thread_type, title text, username text, avatar_path text, venture_id uuid,
               last_message text, last_message_at timestamptz, last_sender_is_me boolean, unread integer, muted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.type,
         case when t.type = 'group' then v.title
              when org.name is not null then o.full_name || ' · ' || org.name
              else o.full_name end,
         case when t.type = 'dm' and private.can_view_profile(o.user_id) then o.username end,
         case when t.type = 'dm' and private.can_view_profile(o.user_id) then o.avatar_path end,
         t.venture_id,
         case when lm.deleted_at is not null then 'Message deleted'
              when lm.id is not null and lm.body = '' then 'Image'
              else left(lm.body, 140) end,
         coalesce(lm.created_at, t.created_at),
         lm.sender_id = (select auth.uid()),
         (select count(*)::integer from public.chat_messages cm
           where cm.thread_id = t.id and cm.created_at > me.last_read_at and cm.sender_id <> (select auth.uid())
             and cm.deleted_at is null and not private.is_blocked_with(cm.sender_id)),
         coalesce(me.muted_until > now(), false)
    from public.chat_thread_members me
    join public.chat_threads t on t.id = me.thread_id
    left join public.ventures v on v.id = t.venture_id
    left join public.organizations org on org.id = t.org_id
    left join lateral (
      select p.* from public.chat_thread_members om join public.profiles p on p.user_id = om.user_id
       where om.thread_id = t.id and om.user_id <> me.user_id limit 1
    ) o on t.type = 'dm'
    left join lateral (
      select cm.* from public.chat_messages cm
       where cm.thread_id = t.id and (cm.sender_id = me.user_id or not private.is_blocked_with(cm.sender_id))
       order by cm.created_at desc limit 1
    ) lm on true
   where me.user_id = (select auth.uid())
     and not private.dm_blocked(t.id)
     and (t.type = 'group' or lm.id is not null)
   order by coalesce(lm.created_at, t.created_at) desc;
$$;

create or replace function private.thread_people(p_thread uuid)
returns table (user_id uuid, name text, username text, avatar_path text, blocked boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         case when private.is_blocked_with(m.user_id) then 'Blocked member'
              when org.name is not null and exists (select 1 from public.org_members om where om.org_id = org.id and om.user_id = m.user_id)
                then p.full_name || ' · ' || org.name
              else p.full_name end,
         case when not private.is_blocked_with(m.user_id) and private.can_view_profile(m.user_id) then p.username end,
         case when not private.is_blocked_with(m.user_id) and private.can_view_profile(m.user_id) then p.avatar_path end,
         private.is_blocked_with(m.user_id),
         m.user_id = (select auth.uid())
    from public.chat_thread_members m
    join public.profiles p on p.user_id = m.user_id
    join public.chat_threads t on t.id = m.thread_id
    left join public.organizations org on org.id = t.org_id
   where m.thread_id = p_thread and private.is_thread_member(p_thread) and not private.dm_blocked(p_thread)
   order by p.full_name;
$$;

-- ---------------------------------------------------------------------------
-- The index: one row per recruiter-visible student
-- ---------------------------------------------------------------------------
create function private.talent_rows(p_student uuid default null)
returns table (student_id uuid, university_id uuid, department text, graduation_year smallint, tier public.ranking_tier,
               skills jsonb, checked_skills text[], last_active_at timestamptz, looking_for text[], availability text[],
               city text, remote_ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.university_id, p.department, p.graduation_year, rs.tier,
         coalesce((select jsonb_object_agg(us.skill_id, us.level) from public.user_skills us
                    where us.user_id = p.user_id and us.level >= 1), '{}'::jsonb),
         coalesce((select array_agg(distinct cc.skill_id) from public.code_checks cc
                    where cc.user_id = p.user_id and cc.status = 'passed'), '{}'::text[]),
         ua.last_active_at,
         p.looking_for::text[], p.availability, p.city, p.remote_ok
    from public.profiles p
    left join public.ranking_scores rs on rs.user_id = p.user_id
    left join private.user_activity ua on ua.user_id = p.user_id
   where p.role = 'student' and p.recruiter_visible and p.onboarding_complete
     and p.status in ('active', 'graduate') and p.university_id is not null
     and private.cv_eligible(p.user_id)
     and (p_student is null or p.user_id = p_student);
$$;
revoke all on function private.talent_rows(uuid) from public;

create function private.refresh_talent_index(p_student uuid default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  with r as materialized (select * from private.talent_rows(p_student)),
  up as (
    insert into public.talent_index as t (student_id, university_id, department, graduation_year, tier, skills,
                                          checked_skills, last_active_at, looking_for, availability, city, remote_ok)
    select r.student_id, r.university_id, r.department, r.graduation_year, r.tier, r.skills, r.checked_skills,
           r.last_active_at, r.looking_for, r.availability, r.city, r.remote_ok
      from r
    on conflict (student_id) do update
      set university_id = excluded.university_id, department = excluded.department,
          graduation_year = excluded.graduation_year, tier = excluded.tier, skills = excluded.skills,
          checked_skills = excluded.checked_skills, last_active_at = excluded.last_active_at,
          looking_for = excluded.looking_for, availability = excluded.availability, city = excluded.city,
          remote_ok = excluded.remote_ok, refreshed_at = now()
    returning 1
  )
  delete from public.talent_index t
   where (p_student is null or t.student_id = p_student)
     and not exists (select 1 from r where r.student_id = t.student_id);
$$;
revoke all on function private.refresh_talent_index(uuid) from public;

-- Every 15 minutes (PRD 5.20); a visibility change is handled at once by the trigger below.
select cron.schedule('talent-index-refresh', '*/15 * * * *', $$select private.refresh_talent_index()$$);

create function private.profile_talent_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_talent_index(new.user_id);
  if new.recruiter_visible is distinct from old.recruiter_visible then
    -- Shortlist entries and notes stay; the entry shows "no longer visible" until the student returns.
    update public.shortlist_items set hidden = not new.recruiter_visible where student_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function private.profile_talent_sync() from public;
create trigger profiles_talent_sync
after update of recruiter_visible, status, university_id, department, graduation_year, availability, city, remote_ok,
                looking_for, onboarding_complete on public.profiles
for each row execute function private.profile_talent_sync();

-- Account deletion: notes are anonymised, shortlist entries and requests go with the student.
create function private.recruit_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recruiter_notes set body = 'Note removed: the student deleted their account.', student_id = null
   where student_id = old.id;
  return old;
end;
$$;
revoke all on function private.recruit_on_user_delete() from public;
create trigger recruit_on_user_delete before delete on auth.users
  for each row execute function private.recruit_on_user_delete();

-- ---------------------------------------------------------------------------
-- Search filters (an allow-list: there is no way to ask for a protected attribute)
-- ---------------------------------------------------------------------------
create function private.talent_filters(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p, '{}'::jsonb);
  k text;
  e jsonb;
  v text;
begin
  if jsonb_typeof(f) <> 'object' then
    raise exception 'filters must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(f) loop
    if k <> all (array['skills', 'code_check', 'universities', 'departments', 'batch_from', 'batch_to', 'min_tier',
                       'active_days', 'availability', 'city', 'remote']) then
      raise exception 'you can''t filter by %', k using errcode = '22023';
    end if;
  end loop;
  if f ? 'skills' then
    if jsonb_typeof(f -> 'skills') <> 'array' or jsonb_array_length(f -> 'skills') > 10 then
      raise exception 'pick up to 10 skills' using errcode = '22023';
    end if;
    for e in select * from jsonb_array_elements(f -> 'skills') loop
      if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'skill', '') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
         or coalesce(e ->> 'min_level', '1') !~ '^[1-4]$' then
        raise exception 'each skill needs a name and a level from 1 to 4' using errcode = '22023';
      end if;
    end loop;
  end if;
  if f ? 'min_tier' then
    v := f ->> 'min_tier';
    if v is null or v not in ('raw', 'spark', 'flare', 'shine', 'radiant', 'luminary') then
      raise exception 'unknown tier' using errcode = '22023';
    end if;
  end if;
  if f ? 'active_days' and coalesce(f ->> 'active_days', '') not in ('30', '90', '180') then
    raise exception 'activity is 30, 90 or 180 days' using errcode = '22023';
  end if;
  if f ? 'availability' and (jsonb_typeof(f -> 'availability') <> 'array'
     or exists (select 1 from jsonb_array_elements_text(f -> 'availability') a where a <> all (array['internship', 'full_time', 'part_time']))) then
    raise exception 'availability is internship, full_time or part_time' using errcode = '22023';
  end if;
  if f ? 'universities' and (jsonb_typeof(f -> 'universities') <> 'array' or jsonb_array_length(f -> 'universities') > 50
     or exists (select 1 from jsonb_array_elements_text(f -> 'universities') u where u !~ '^[0-9a-f-]{36}$')) then
    raise exception 'pick universities from the list' using errcode = '22023';
  end if;
  if f ? 'departments' and (jsonb_typeof(f -> 'departments') <> 'array' or jsonb_array_length(f -> 'departments') > 30) then
    raise exception 'pick departments from the list' using errcode = '22023';
  end if;
  if (f ? 'batch_from' and coalesce(f ->> 'batch_from', '') !~ '^[0-9]{4}$')
     or (f ? 'batch_to' and coalesce(f ->> 'batch_to', '') !~ '^[0-9]{4}$') then
    raise exception 'batch is a graduation year' using errcode = '22023';
  end if;
  if (f ? 'city' and char_length(coalesce(f ->> 'city', '')) not between 2 and 60)
     or (f ? 'code_check' and jsonb_typeof(f -> 'code_check') <> 'boolean')
     or (f ? 'remote' and jsonb_typeof(f -> 'remote') <> 'boolean') then
    raise exception 'check the city and the yes/no filters' using errcode = '22023';
  end if;
  return f;
end;
$$;
revoke all on function private.talent_filters(jsonb) from public;

-- The matching core. Ordering (PRD 5.20): required skills weighted by level, then recent
-- activity, then tier, then the id so pages are stable. Nothing here looks at payment.
create function private.talent_matches(p_org uuid, p_filters jsonb, p_limit integer, p_offset integer,
                                       p_since timestamptz default null)
returns table (student_id uuid, total bigint, score integer, university_id uuid, department text,
               graduation_year smallint, tier public.ranking_tier, skills jsonb, checked_skills text[],
               last_active_at timestamptz, why text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := private.talent_filters(p_filters);
  v_ids text[] := coalesce(array(select e ->> 'skill' from jsonb_array_elements(coalesce(f -> 'skills', '[]'::jsonb)) e), '{}');
  v_code boolean := coalesce((f ->> 'code_check')::boolean, false);
  v_unis uuid[] := case when f ? 'universities' then array(select u::uuid from jsonb_array_elements_text(f -> 'universities') u) end;
  v_depts text[] := case when f ? 'departments' then array(select lower(d) from jsonb_array_elements_text(f -> 'departments') d) end;
  v_from integer := (f ->> 'batch_from')::integer;
  v_to integer := (f ->> 'batch_to')::integer;
  v_tier public.ranking_tier := (f ->> 'min_tier')::public.ranking_tier;
  v_days integer := (f ->> 'active_days')::integer;
  v_avail text[] := case when f ? 'availability' then array(select a from jsonb_array_elements_text(f -> 'availability') a) end;
  v_city text := lower(nullif(btrim(coalesce(f ->> 'city', '')), ''));
  v_remote boolean := coalesce((f ->> 'remote')::boolean, false);
begin
  return query
  with req as (
    select e ->> 'skill' as skill_id, coalesce((e ->> 'min_level')::integer, 1) as min_level
      from jsonb_array_elements(coalesce(f -> 'skills', '[]'::jsonb)) e
  ),
  base as (
    select t.*, (select sum(coalesce((t.skills ->> r.skill_id)::integer, 0)) from req r)::integer as match_score
      from public.talent_index t
     where not exists (select 1 from public.company_blocks b where b.student_id = t.student_id and b.org_id = p_org)
       and t.skills ?& v_ids
       and not exists (select 1 from req r where coalesce((t.skills ->> r.skill_id)::integer, 0) < r.min_level)
       and (not v_code or (case when cardinality(v_ids) > 0 then t.checked_skills @> v_ids else cardinality(t.checked_skills) > 0 end))
       and (v_unis is null or t.university_id = any (v_unis))
       and (v_depts is null or lower(t.department) = any (v_depts))
       and (v_from is null or t.graduation_year >= v_from)
       and (v_to is null or t.graduation_year <= v_to)
       and (v_tier is null or t.tier >= v_tier)
       and (v_days is null or t.last_active_at >= now() - make_interval(days => v_days))
       and (v_avail is null or t.availability && v_avail)
       and (v_city is null or lower(t.city) = v_city)
       and (not v_remote or t.remote_ok)
       and (p_since is null or t.first_indexed_at > p_since)
  )
  select b.student_id, count(*) over ()::bigint, b.match_score, b.university_id, b.department, b.graduation_year,
         b.tier, b.skills, b.checked_skills, b.last_active_at,
         private.why_match(b.skills, b.checked_skills, f -> 'skills', b.last_active_at, b.tier)
    from base b
   order by b.match_score desc nulls last, b.last_active_at desc nulls last, b.tier desc nulls last, b.student_id
   limit least(greatest(p_limit, 0), 100) offset least(greatest(p_offset, 0), 200);
end;
$$;
revoke all on function private.talent_matches(uuid, jsonb, integer, integer, timestamptz) from public;

create function private.activity_band(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_at is null then 'Not recently active'
              when p_at >= now() - interval '30 days' then 'Active in the last 30 days'
              when p_at >= now() - interval '90 days' then 'Active in the last 90 days'
              when p_at >= now() - interval '180 days' then 'Active in the last 180 days'
              else 'Not recently active' end;
$$;
revoke all on function private.activity_band(timestamptz) from public;

-- "Why this match": the required skills at the student's level, code checks, activity and tier.
create function private.why_match(p_skills jsonb, p_checked text[], p_required jsonb, p_active timestamptz,
                                  p_tier public.ranking_tier)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select array_to_string(array_remove(array[
           (select string_agg('L' || (p_skills ->> r.skill_id) || ' ' || s.name, ', ' order by s.name)
              from (select e ->> 'skill' as skill_id from jsonb_array_elements(coalesce(p_required, '[]'::jsonb)) e) r
              join public.skills s on s.id = r.skill_id),
           case when exists (select 1 from jsonb_array_elements(coalesce(p_required, '[]'::jsonb)) e where (e ->> 'skill') = any (p_checked))
                then 'code check passed' end,
           case when p_active >= now() - interval '7 days' then 'active this week'
                when p_active >= now() - interval '30 days' then 'active this month' end,
           case when p_tier is not null then initcap(p_tier::text) || ' tier' end
         ], null), ' · ');
$$;
revoke all on function private.why_match(jsonb, text[], jsonb, timestamptz, public.ranking_tier) from public;

-- Explore (free): tier, skills and levels, university, department, batch and activity band. No id,
-- name, photo, username or link: the result can't be turned into a person.
create function private.talent_explore(p_filters jsonb, p_offset integer default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  v_total bigint := 0;
  v_rows jsonb;
begin
  if not private.rate_limit('talent:' || v_me::text, 60, interval '1 minute') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select coalesce(max(m.total), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'tier', m.tier,
           'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'level', (m.skills ->> s.id)::integer,
                                                                   'code_check', s.id = any (m.checked_skills))
                                                order by (m.skills ->> s.id)::integer desc, s.name), '[]'::jsonb)
                        from (select s2.* from public.skills s2 where m.skills ? s2.id
                               order by (m.skills ->> s2.id)::integer desc, s2.name limit 6) s),
           'university', u.name, 'department', m.department, 'batch', m.graduation_year,
           'activity', private.activity_band(m.last_active_at), 'why', m.why) order by m.rn), '[]'::jsonb)
    into v_total, v_rows
    from (select x.*, row_number() over () as rn
            from private.talent_matches(v_org, p_filters, 20, coalesce(p_offset, 0)) x) m
    join public.universities u on u.id = m.university_id;
  insert into public.search_audit (org_id, user_id, mode, filters, result_count)
  values (v_org, v_me, 'explore', coalesce(p_filters, '{}'::jsonb), v_total::integer);
  return jsonb_build_object('total', v_total, 'results', v_rows,
                            'full_access', private.org_entitled(v_org, 'talent.full_profile'));
end;
$$;

-- Full results: names and links. Needs the talent.full_profile entitlement.
create function private.search_talent(p_filters jsonb, p_offset integer default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  v_total bigint := 0;
  v_rows jsonb;
begin
  if not private.org_entitled(v_org, 'talent.full_profile') then
    raise exception 'full talent search isn''t part of your plan yet; Explore shows anonymised results' using errcode = '55000';
  end if;
  if not private.rate_limit('talent:' || v_me::text, 60, interval '1 minute') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select coalesce(max(m.total), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', m.student_id, 'name', p.full_name, 'username', p.username, 'avatar_path', p.avatar_path,
           'tier', m.tier,
           'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'level', (m.skills ->> s.id)::integer,
                                                                   'code_check', s.id = any (m.checked_skills))
                                                order by (m.skills ->> s.id)::integer desc, s.name), '[]'::jsonb)
                        from (select s2.* from public.skills s2 where m.skills ? s2.id
                               order by (m.skills ->> s2.id)::integer desc, s2.name limit 6) s),
           'university', u.name, 'department', m.department, 'batch', m.graduation_year,
           'activity', private.activity_band(m.last_active_at), 'why', m.why,
           'contacted', exists (select 1 from public.contact_requests c where c.org_id = v_org and c.student_id = m.student_id
                                   and c.created_at > now() - interval '90 days')) order by m.rn), '[]'::jsonb)
    into v_total, v_rows
    from (select x.*, row_number() over () as rn
            from private.talent_matches(v_org, p_filters, 20, coalesce(p_offset, 0)) x) m
    join public.universities u on u.id = m.university_id
    join public.profiles p on p.user_id = m.student_id;
  insert into public.search_audit (org_id, user_id, mode, filters, result_count)
  values (v_org, v_me, 'full', coalesce(p_filters, '{}'::jsonb), v_total::integer);
  return jsonb_build_object('total', v_total, 'results', v_rows, 'full_access', true);
end;
$$;

-- The pickers: universities and departments that have visible students (counts only).
create function private.talent_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org();
  return jsonb_build_object(
    'universities', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.name)
                                from (select distinct u.id, u.name from public.talent_index t
                                        join public.universities u on u.id = t.university_id) x), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(d order by d)
                               from (select distinct department as d from public.talent_index where department is not null) x), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
                          from public.skills s where s.retired_at is null), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- The candidate: who may be opened, and what they show
-- ---------------------------------------------------------------------------
-- 'search' (visible student, full results), 'contact' (they accepted), or null.
create function private.candidate_access(p_org uuid, p_student uuid)
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
    else null end;
$$;
revoke all on function private.candidate_access(uuid, uuid) from public;

create function private.org_log(p_org uuid, p_student uuid, p_kind text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.org_events (org_id, actor_id, student_id, kind) values (p_org, (select auth.uid()), p_student, p_kind);
$$;
revoke all on function private.org_log(uuid, uuid, text) from public;

create function private.recruit_candidate(p_student uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  v_access text := private.candidate_access(v_org, p_student);
  v_person jsonb;
  v_cv jsonb;
  v_code text;
  v_cv_shared boolean;
  v_limits jsonb;
  v_last public.contact_requests;
begin
  if v_access is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  insert into public.profile_views (org_id, student_id, viewer_id) values (v_org, p_student, v_me)
  on conflict (viewer_id, student_id, day) do nothing;
  select jsonb_build_object('id', p.user_id, 'name', p.full_name, 'username', p.username, 'avatar_path', p.avatar_path,
                            'university', u.name, 'department', p.department, 'batch', p.graduation_year,
                            'looking_for', to_jsonb(p.looking_for), 'availability', to_jsonb(p.availability),
                            'city', p.city, 'remote_ok', p.remote_ok, 'status', p.status)
    into v_person
    from public.profiles p join public.universities u on u.id = p.university_id
   where p.user_id = p_student;
  v_cv := private.cv_snapshot(p_student);
  select coalesce(s.visibility = 'recruiters', false) into v_cv_shared
    from (select 1) x left join public.cv_settings s on s.user_id = p_student;
  select r.code into v_code from public.cv_records r
   where r.user_id = p_student and r.revoked_at is null and r.superseded_by is null and r.expires_at > now()
   order by r.version desc limit 1;
  select * into v_last from public.contact_requests c
   where c.org_id = v_org and c.student_id = p_student order by c.created_at desc limit 1;
  return jsonb_build_object(
    'access', v_access,
    'person', v_person,
    'cv', v_cv,
    'verify_code', case when v_cv_shared then v_code end,
    'tier', (select rs.tier from public.ranking_scores rs where rs.user_id = p_student),
    'last_contact', case when v_last.id is not null then jsonb_build_object(
        'status', v_last.status, 'role_title', v_last.role_title, 'at', v_last.created_at,
        'by_name', (select p2.full_name from public.profiles p2 where p2.user_id = v_last.recruiter_id),
        'retry_after', case when v_last.status = 'declined'
                            then v_last.decided_at + make_interval(days => private.recruit_limit('decline_cooloff_days')::integer) end,
        'thread_id', case when v_last.status = 'accepted' and v_last.closed_at is null then v_last.thread_id end) end,
    'shortlists', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name))
                              from public.shortlist_items i join public.recruiter_shortlists l on l.id = i.shortlist_id
                             where l.org_id = v_org and i.student_id = p_student), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Contact requests
-- ---------------------------------------------------------------------------
create function private.send_contact_request(p_student uuid, p_role text, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
  v_role text := btrim(coalesce(p_role, ''));
  v_msg text := btrim(coalesce(p_message, ''));
  v_id uuid;
  v_last public.contact_requests;
  v_org_name text;
begin
  if char_length(v_role) not between 2 and 80 then
    raise exception 'name the role or opportunity' using errcode = '22023';
  end if;
  if char_length(v_msg) < private.recruit_limit('min_message')::integer then
    raise exception 'write at least % characters about the role', private.recruit_limit('min_message')::integer using errcode = '22023';
  end if;
  if char_length(v_msg) > private.recruit_limit('max_message')::integer then
    raise exception 'keep the message under % characters', private.recruit_limit('max_message')::integer using errcode = '22023';
  end if;
  if private.candidate_access(v_org, p_student) is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  if not private.rate_limit('contact:' || v_me::text, 100, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  -- Serialise requests to one student so two seats can't both get through.
  perform pg_advisory_xact_lock(hashtextextended('contact:' || v_org::text || ':' || p_student::text, 0));
  select * into v_last from public.contact_requests c
   where c.org_id = v_org and c.student_id = p_student order by c.created_at desc limit 1;
  if found and v_last.status = 'pending' then
    raise exception 'your team already has a request waiting for this student' using errcode = '55000';
  end if;
  if found and v_last.status = 'accepted' and v_last.closed_at is null then
    raise exception 'this student already accepted; continue in chat' using errcode = '55000';
  end if;
  if exists (select 1 from public.contact_requests c
              where c.org_id = v_org and c.student_id = p_student and c.status = 'declined'
                and c.decided_at > now() - make_interval(days => private.recruit_limit('decline_cooloff_days')::integer)) then
    raise exception 'this student declined; you can contact them again after % days', private.recruit_limit('decline_cooloff_days')::integer
      using errcode = '55000';
  end if;
  if (select count(*) from public.contact_requests c
       where c.recruiter_id = v_me and c.created_at > now() - interval '24 hours') >= private.recruit_limit('daily_contacts')::integer then
    raise exception 'you''ve reached today''s limit of % contact requests', private.recruit_limit('daily_contacts')::integer
      using errcode = '54000';
  end if;
  perform private.consume_quota(v_org, 'contact.credits', 1);
  insert into public.contact_requests (org_id, recruiter_id, student_id, role_title, message, expires_at)
  values (v_org, v_me, p_student, v_role, v_msg,
          now() + make_interval(days => private.recruit_limit('contact_expiry_days')::integer))
  returning id into v_id;
  select o.name into v_org_name from public.organizations o where o.id = v_org;
  perform private.notify(p_student, null, 'contact_request', 'contact_request', v_id,
                         jsonb_build_object('org_name', v_org_name, 'role_title', v_role));
  perform private.org_log(v_org, p_student, 'contact_sent');
  return v_id;
end;
$$;

create function private.respond_contact_request(p_id uuid, p_accept boolean, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  c public.contact_requests;
  v_thread uuid;
  v_key text;
  v_org public.organizations;
  v_name text;
begin
  select * into c from public.contact_requests where id = p_id and student_id = v_me for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'this request was already answered or has expired' using errcode = '55000';
  end if;
  if c.expires_at <= now() then
    update public.contact_requests set status = 'expired' where id = c.id;
    raise exception 'this request has expired' using errcode = '55000';
  end if;
  select * into v_org from public.organizations where id = c.org_id;
  select p.full_name into v_name from public.profiles p where p.user_id = v_me;
  if not p_accept then
    update public.contact_requests
       set status = 'declined', decided_at = now(), decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
     where id = c.id;
    -- A decline doesn't name the student.
    perform private.notify(c.recruiter_id, null, 'contact_declined', 'contact_request', c.id,
                           jsonb_build_object('role_title', c.role_title));
    return null;
  end if;
  if c.recruiter_id is null or not exists (select 1 from public.org_members m where m.user_id = c.recruiter_id and m.org_id = c.org_id and m.status = 'active')
     or v_org.status <> 'verified' then
    raise exception 'this company can''t be reached right now' using errcode = '55000';
  end if;
  v_key := least(v_me, c.recruiter_id)::text || ':' || greatest(v_me, c.recruiter_id)::text;
  perform pg_advisory_xact_lock(hashtextextended('dm:' || v_key, 0));
  select id into v_thread from public.chat_threads where type = 'dm' and dm_key = v_key;
  if v_thread is null then
    insert into public.chat_threads (type, dm_key, org_id) values ('dm', v_key, c.org_id) returning id into v_thread;
    insert into public.chat_thread_members (thread_id, user_id) values (v_thread, v_me), (v_thread, c.recruiter_id);
  else
    update public.chat_threads set org_id = c.org_id, closed_at = null where id = v_thread;
  end if;
  -- The recruiter's message opens the conversation.
  insert into public.chat_messages (thread_id, sender_id, body, created_at) values (v_thread, c.recruiter_id, c.message, c.created_at);
  update public.chat_threads set last_message_at = now() where id = v_thread;
  update public.contact_requests set status = 'accepted', decided_at = now(), thread_id = v_thread where id = c.id;
  perform private.notify(c.recruiter_id, v_me, 'contact_accepted', 'contact_request', c.id,
                         jsonb_build_object('role_title', c.role_title, 'thread_id', v_thread));
  return v_thread;
end;
$$;

-- The student closes the conversation at any time; the recruiter can't reopen it without a new request.
create function private.close_contact_chat(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  c public.contact_requests;
begin
  select * into c from public.contact_requests where id = p_id and student_id = v_me and status = 'accepted' for update;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  update public.contact_requests set closed_at = now() where id = c.id and closed_at is null;
  update public.chat_threads set closed_at = now() where id = c.thread_id and org_id = c.org_id;
end;
$$;

create function private.my_contact_requests()
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
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'status', case when c.status = 'pending' and c.expires_at <= now() then 'expired' else c.status end,
             'role_title', c.role_title, 'message', c.message, 'created_at', c.created_at, 'expires_at', c.expires_at,
             'decided_at', c.decided_at, 'closed', c.closed_at is not null,
             'thread_id', case when c.status = 'accepted' and c.closed_at is null then c.thread_id end,
             'org', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'industry', o.industry, 'size', o.size,
                                       'city', o.city, 'verified', o.status = 'verified',
                                       'blocked', exists (select 1 from public.company_blocks b where b.student_id = v_me and b.org_id = o.id)))
             order by c.created_at desc)
      from (select * from public.contact_requests where student_id = v_me order by created_at desc limit 100) c
      join public.organizations o on o.id = c.org_id), '[]'::jsonb);
end;
$$;

create function private.org_contact_requests()
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
             'id', c.id, 'status', case when c.status = 'pending' and c.expires_at <= now() then 'expired' else c.status end,
             'role_title', c.role_title, 'created_at', c.created_at, 'decided_at', c.decided_at,
             'by_name', (select p.full_name from public.profiles p where p.user_id = c.recruiter_id),
             'student_id', case when private.candidate_access(v_org, c.student_id) is not null then c.student_id end,
             'student_name', case when private.candidate_access(v_org, c.student_id) is not null
                                  then (select p.full_name from public.profiles p where p.user_id = c.student_id) end,
             'thread_id', case when c.status = 'accepted' and c.closed_at is null then c.thread_id end)
             order by c.created_at desc)
      from (select * from public.contact_requests where org_id = v_org order by created_at desc limit 100) c), '[]'::jsonb);
end;
$$;

create function private.expire_contact_requests()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with e as (
    update public.contact_requests set status = 'expired', decided_at = now()
     where status = 'pending' and expires_at <= now()
    returning 1)
  select count(*)::integer from e;
$$;
revoke all on function private.expire_contact_requests() from public;
select cron.schedule('contact-expiry', '7 * * * *', $$select private.expire_contact_requests()$$);

-- ---------------------------------------------------------------------------
-- Shortlists, notes, the team feed
-- ---------------------------------------------------------------------------
create function private.create_shortlist(p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 60 then
    raise exception 'name the list (up to 60 characters)' using errcode = '22023';
  end if;
  if (select count(*) from public.recruiter_shortlists where org_id = v_org) >= 50 then
    raise exception 'up to 50 lists per organisation' using errcode = '23514';
  end if;
  insert into public.recruiter_shortlists (org_id, name, created_by) values (v_org, v_name, (select auth.uid())) returning id into v_id;
  return v_id;
end;
$$;

create function private.rename_shortlist(p_id uuid, p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 60 then
    raise exception 'name the list (up to 60 characters)' using errcode = '22023';
  end if;
  update public.recruiter_shortlists set name = v_name where id = p_id and org_id = v_org;
  if not found then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.delete_shortlist(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  delete from public.recruiter_shortlists where id = p_id and org_id = v_org;
  if not found then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.add_to_shortlist(p_list uuid, p_student uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_id uuid;
begin
  if not exists (select 1 from public.recruiter_shortlists where id = p_list and org_id = v_org) then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  if private.candidate_access(v_org, p_student) is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.shortlist_items where shortlist_id = p_list) >= 500 then
    raise exception 'up to 500 people per list' using errcode = '23514';
  end if;
  insert into public.shortlist_items (shortlist_id, student_id, position, added_by)
  values (p_list, p_student, coalesce((select max(position) + 1 from public.shortlist_items where shortlist_id = p_list), 0), (select auth.uid()))
  on conflict (shortlist_id, student_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.org_log(v_org, p_student, 'shortlisted');
  end if;
  return v_id;
end;
$$;

create function private.remove_from_shortlist(p_item uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  delete from public.shortlist_items i using public.recruiter_shortlists l
   where i.id = p_item and l.id = i.shortlist_id and l.org_id = v_org;
  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Drag-to-reorder: the ids in their new order.
create function private.reorder_shortlist(p_list uuid, p_items uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  if not exists (select 1 from public.recruiter_shortlists where id = p_list and org_id = v_org) then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  if cardinality(p_items) > 500 then
    raise exception 'too many entries' using errcode = '22023';
  end if;
  update public.shortlist_items i set position = o.ord - 1
    from unnest(p_items) with ordinality as o(id, ord)
   where i.id = o.id and i.shortlist_id = p_list;
end;
$$;

create function private.shortlists_list()
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
    select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'count', (select count(*) from public.shortlist_items i where i.shortlist_id = l.id),
                                        'created_at', l.created_at) order by l.created_at)
      from public.recruiter_shortlists l where l.org_id = v_org), '[]'::jsonb);
end;
$$;

create function private.shortlist_get(p_list uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_name text;
begin
  select l.name into v_name from public.recruiter_shortlists l where l.id = p_list and l.org_id = v_org;
  if v_name is null then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_list, 'name', v_name, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             -- Hidden (the student turned visibility off) or no longer reachable on the plan: no name, no link.
             'visible', x.ok,
             'student_id', case when x.ok then x.student_id end,
             'name', case when x.ok then p.full_name end,
             'university', case when x.ok then u.name end,
             'department', case when x.ok then p.department end,
             'tier', case when x.ok then rs.tier end,
             'notes', case when x.ok then (select count(*) from public.recruiter_notes n where n.org_id = v_org and n.student_id = x.student_id) end,
             'added_by', (select p2.full_name from public.profiles p2 where p2.user_id = x.added_by),
             'added_at', x.created_at) order by x.position, x.created_at)
      from (select i.*, (not i.hidden and private.candidate_access(v_org, i.student_id) is not null) as ok
              from public.shortlist_items i where i.shortlist_id = p_list) x
      left join public.profiles p on p.user_id = x.student_id and x.ok
      left join public.universities u on u.id = p.university_id
      left join public.ranking_scores rs on rs.user_id = x.student_id), '[]'::jsonb));
end;
$$;

create function private.add_note(p_student uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if private.candidate_access(v_org, p_student) is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'notes are up to 2,000 characters' using errcode = '22023';
  end if;
  insert into public.recruiter_notes (org_id, student_id, author_id, body) values (v_org, p_student, (select auth.uid()), v_body)
  returning id into v_id;
  perform private.org_log(v_org, p_student, 'noted');
  return v_id;
end;
$$;

-- Notes are for the organisation only, and unreachable while the student isn't visible to it.
create function private.notes_for(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  if private.candidate_access(v_org, p_student) is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at,
                                        'author', (select p.full_name from public.profiles p where p.user_id = n.author_id),
                                        'mine', n.author_id = (select auth.uid())) order by n.created_at desc)
      from public.recruiter_notes n where n.org_id = v_org and n.student_id = p_student), '[]'::jsonb);
end;
$$;

create function private.delete_note(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_me uuid := (select auth.uid());
begin
  delete from public.recruiter_notes n
   where n.id = p_id and n.org_id = v_org
     and (n.author_id = v_me or exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = v_me and m.role = 'admin'));
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Who did what, so two recruiters don't contact the same student twice.
create function private.org_activity(p_limit integer default 50)
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
             'kind', e.kind, 'at', e.at,
             'actor', (select p.full_name from public.profiles p where p.user_id = e.actor_id),
             'student_id', case when private.candidate_access(v_org, e.student_id) is not null then e.student_id end,
             'student_name', case when private.candidate_access(v_org, e.student_id) is not null
                                  then (select p.full_name from public.profiles p where p.user_id = e.student_id) end)
             order by e.at desc)
      from (select * from public.org_events where org_id = v_org and kind <> 'viewed'
             order by at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) e), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved searches (entitlement saved_searches; the match notice joins the daily digest)
-- ---------------------------------------------------------------------------
insert into public.notification_types (type, category, emailed) values
  ('contact_request', 'contact_requests', true),
  ('contact_accepted', 'recruiting', false),
  ('contact_declined', 'recruiting', false),
  ('saved_search_matches', 'recruiting', true);

create function private.save_search(p_name text, p_filters jsonb, p_frequency text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not private.org_entitled(v_org, 'saved_searches') then
    raise exception 'saved searches aren''t part of your plan yet' using errcode = '55000';
  end if;
  perform private.talent_filters(p_filters);
  if char_length(v_name) not between 1 and 60 or p_frequency not in ('daily', 'weekly') then
    raise exception 'name the search and pick daily or weekly' using errcode = '22023';
  end if;
  if (select count(*) from public.saved_searches where user_id = (select auth.uid())) >= 10 then
    raise exception 'up to 10 saved searches' using errcode = '23514';
  end if;
  insert into public.saved_searches (org_id, user_id, name, filters, frequency)
  values (v_org, (select auth.uid()), v_name, p_filters, p_frequency) returning id into v_id;
  return v_id;
end;
$$;

create function private.delete_saved_search(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  delete from public.saved_searches where id = p_id and org_id = v_org and user_id = (select auth.uid());
  if not found then
    raise exception 'saved search not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.saved_searches_list()
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
    'entitled', private.org_entitled(v_org, 'saved_searches'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'filters', s.filters,
                                                           'frequency', s.frequency, 'last_run_at', s.last_run_at) order by s.created_at)
                         from public.saved_searches s where s.org_id = v_org and s.user_id = (select auth.uid())), '[]'::jsonb));
end;
$$;

-- Hourly: a due search with new matches leaves one notice, which the recipient's daily digest emails.
create function private.run_saved_searches()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s record;
  v_count integer;
  v_sent integer := 0;
begin
  for s in
    select * from public.saved_searches
     where last_run_at <= now() - case frequency when 'daily' then interval '1 day' else interval '7 days' end
     order by last_run_at limit 200
  loop
    if private.org_entitled(s.org_id, 'saved_searches')
       and exists (select 1 from public.org_members m where m.user_id = s.user_id and m.org_id = s.org_id and m.status = 'active') then
      select coalesce(max(x.total), 0)::integer into v_count from private.talent_matches(s.org_id, s.filters, 1, 0, s.last_run_at) x;
      if v_count > 0 then
        perform private.notify(s.user_id, null, 'saved_search_matches', 'saved_search', s.id,
                               jsonb_build_object('name', s.name, 'count', v_count));
        v_sent := v_sent + 1;
      end if;
    end if;
    update public.saved_searches set last_run_at = now() where id = s.id;
  end loop;
  return v_sent;
end;
$$;
revoke all on function private.run_saved_searches() from public;
select cron.schedule('saved-searches', '23 * * * *', $$select private.run_saved_searches()$$);

-- ---------------------------------------------------------------------------
-- The student's side
-- ---------------------------------------------------------------------------
create function private.my_recruiter_prefs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  return (select jsonb_build_object('availability', to_jsonb(p.availability), 'city', p.city, 'remote_ok', p.remote_ok,
                                    'recruiter_visible', p.recruiter_visible, 'looking_for', to_jsonb(p.looking_for))
            from public.profiles p where p.user_id = v_me);
end;
$$;

create function private.save_recruiter_prefs(p_availability text[], p_city text, p_remote boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
begin
  if exists (select 1 from unnest(coalesce(p_availability, '{}'::text[])) a where a <> all (array['internship', 'full_time', 'part_time'])) then
    raise exception 'availability is internship, full-time or part-time' using errcode = '22023';
  end if;
  if v_city is not null and char_length(v_city) not between 2 and 60 then
    raise exception 'city is 2 to 60 characters' using errcode = '22023';
  end if;
  update public.profiles
     set availability = (select coalesce(array_agg(distinct a order by a), '{}') from unnest(coalesce(p_availability, '{}'::text[])) a),
         city = v_city, remote_ok = coalesce(p_remote, false)
   where user_id = v_me;
end;
$$;

-- Who looked: counts for everyone, names with Pro (phase 10; test grants until then).
create function private.my_profile_viewers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_names boolean := private.has_entitlement(v_me, 'privacy.viewer_names');
begin
  return jsonb_build_object(
    'companies_30d', (select count(distinct v.org_id) from public.profile_views v where v.student_id = v_me and v.at > now() - interval '30 days'),
    'views_30d', (select count(*) from public.profile_views v where v.student_id = v_me and v.at > now() - interval '30 days'),
    'names_visible', v_names,
    'companies', case when v_names then coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'slug', x.slug, 'last_at', x.last_at) order by x.last_at desc)
          from (select o.id, o.name, o.slug, max(v.at) as last_at
                  from public.profile_views v join public.organizations o on o.id = v.org_id
                 where v.student_id = v_me and v.at > now() - interval '30 days' group by o.id) x), '[]'::jsonb) end);
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
  'talent_explore', 'search_talent', 'talent_facets', 'recruit_candidate',
  'send_contact_request', 'respond_contact_request', 'close_contact_chat', 'my_contact_requests', 'org_contact_requests',
  'create_shortlist', 'rename_shortlist', 'delete_shortlist', 'add_to_shortlist', 'remove_from_shortlist',
  'reorder_shortlist', 'shortlists_list', 'shortlist_get', 'add_note', 'notes_for', 'delete_note', 'org_activity',
  'save_search', 'delete_saved_search', 'saved_searches_list',
  'my_recruiter_prefs', 'save_recruiter_prefs', 'my_profile_viewers'
]);

drop function pg_temp.expose(text[]);
