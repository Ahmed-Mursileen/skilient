-- Phase 9, part 5: individual student records and dashboards (PRD 5.23; decisions.md 2026-10-04).
--
-- Records: Growth and Campus only, checked here in SQL so a Basic or free university gets nothing
-- even by calling the function directly. Owners and admins see all their students, coordinators
-- their own department. Every call writes one row to student_record_access_log (no dedupe), opens
-- are limited to 100 an hour per admin, and there is no function that returns more than one
-- student's record (no bulk export). Never included: chat, L0 skills, recruiter notes, which
-- recruiters contacted the student, individual CV views. Pro students (privacy.record_viewers)
-- see who viewed their record; logs are kept 2 years.
-- Dashboards: the nightly `uni-stats` job writes one row per university and area (tables, not
-- materialised views: every read checks the plan in one function). Groups under 5 are hidden,
-- and a second group is hidden when only one would be, so nothing is derivable from a total.

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------
create table public.student_record_access_log (
  id bigint generated always as identity primary key,
  university_id uuid not null references public.universities (id) on delete cascade,
  viewer_id uuid references auth.users (id) on delete set null,
  viewer_name text not null,
  viewer_role public.uni_admin_role not null,
  student_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
comment on table public.student_record_access_log is 'Every opening of an individual student record (PRD 5.23). Append-only; purged after 2 years.';
create index student_record_access_log_student_idx on public.student_record_access_log (student_id, at desc);
create index student_record_access_log_viewer_idx on public.student_record_access_log (viewer_id, at desc);
create index student_record_access_log_uni_idx on public.student_record_access_log (university_id, at desc);
alter table public.student_record_access_log enable row level security;
revoke all on table public.student_record_access_log from anon, authenticated;

-- One student's record, for an admin or the coordinator of their department at a Growth or
-- Campus university. Logged on every call.
create function private.university_student_record(p_student uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  s public.profiles;
begin
  if not private.uni_entitled(a.university_id, 'uni.student_records') then
    raise exception 'individual student records are part of the Growth and Campus licences' using errcode = '42501';
  end if;
  select * into s from public.profiles p
   where p.user_id = p_student and p.university_id = a.university_id and p.role = 'student' and p.status in ('active', 'graduate');
  if s.user_id is null or (a.role = 'coordinator' and s.department_id is distinct from a.department_id) then
    raise exception 'student not found' using errcode = 'P0002';
  end if;
  if not private.rate_limit('uni_record:' || a.user_id::text, 100, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.student_record_access_log (university_id, viewer_id, viewer_name, viewer_role, student_id)
  values (a.university_id, a.user_id, (select p.full_name from public.profiles p where p.user_id = a.user_id), a.role, s.user_id);

  return jsonb_build_object(
    'profile', jsonb_build_object('id', s.user_id, 'name', s.full_name, 'username', s.username, 'avatar_path', s.avatar_path,
                                  'department', s.department, 'programme', s.programme, 'batch', s.graduation_year,
                                  'status', s.status, 'graduated_at', s.graduated_at, 'joined_at', s.created_at),
    -- Verified levels only: L0 is private to the student.
    'skills', coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'level', us.level) order by us.level desc, k.name)
                          from public.user_skills us join public.skills k on k.id = us.skill_id
                         where us.user_id = s.user_id and us.level >= 1), '[]'::jsonb),
    'ventures', coalesce((select jsonb_agg(jsonb_build_object(
                             'title', v.title, 'type', v.type, 'status', v.status, 'role', m.team_role, 'joined_at', m.joined_at,
                             'entries', (select count(*) from public.contributions c where c.venture_id = v.id and c.user_id = s.user_id and c.corrects_id is null),
                             'faculty_reviewed', exists (select 1 from public.venture_reviews r where r.venture_id = v.id))
                           order by m.joined_at desc)
                            from public.venture_members m join public.ventures v on v.id = m.venture_id
                           where m.user_id = s.user_id), '[]'::jsonb),
    'endorsements', coalesce((select jsonb_agg(jsonb_build_object('skill', k.name, 'by', p.full_name, 'kind', e.endorser_kind, 'at', e.created_at)
                                               order by e.created_at desc)
                                from public.endorsements e join public.skills k on k.id = e.skill_id join public.profiles p on p.user_id = e.endorser_id
                               where e.endorsee_id = s.user_id and not e.hidden), '[]'::jsonb),
    'credentials', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'issuer', c.issuer, 'issued_on', c.issued_on) order by c.issued_on desc)
                               from public.credentials c where c.user_id = s.user_id and c.status = 'approved'), '[]'::jsonb),
    'ranking', (select jsonb_build_object('tier', r.tier, 'ranked', r.ranked,
                                          'top_percent', case when r.percentile is not null then ceil((1 - r.percentile) * 100) end)
                  from public.ranking_scores r where r.user_id = s.user_id),
    'ranking_history', coalesce((select jsonb_agg(jsonb_build_object('week', h.week, 'tier', h.tier) order by h.week)
                                   from (select * from public.ranking_snapshots x where x.user_id = s.user_id order by x.week desc limit 26) h), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'checked_in', r.checked_in_at is not null)
                                         order by e.starts_at desc)
                          from public.event_registrations r join public.events e on e.id = r.event_id
                         where r.user_id = s.user_id and r.cancelled_at is null and e.university_id = a.university_id), '[]'::jsonb),
    'cv', (select jsonb_build_object('code', c.code, 'version', c.version, 'issued_at', c.issued_at)
             from public.cv_records c where c.user_id = s.user_id and c.revoked_at is null and c.superseded_by is null
            order by c.version desc limit 1),
    -- Outcomes only with this university's own job fairs.
    'fair_outcomes', coalesce((select jsonb_agg(jsonb_build_object('fair', f.title, 'company', o.name,
                                  'talked', exists (select 1 from public.job_fair_queue q where q.booth_id = b.id and q.student_id = s.user_id and q.status in ('talking', 'done')),
                                  'interview', exists (select 1 from public.job_fair_slots sl where sl.booth_id = b.id and sl.student_id = s.user_id and sl.held_at is not null),
                                  'hired', exists (select 1 from public.hires h where h.student_id = s.user_id and h.org_id = b.org_id
                                                     and h.hired_at between f.starts_at and f.ends_at + interval '90 days')))
                                 from public.job_fair_booths b join public.job_fairs f on f.id = b.fair_id join public.organizations o on o.id = b.org_id
                                where f.university_id = a.university_id
                                  and (exists (select 1 from public.job_fair_queue q where q.booth_id = b.id and q.student_id = s.user_id and q.status <> 'left')
                                       or exists (select 1 from public.job_fair_slots sl where sl.booth_id = b.id and sl.student_id = s.user_id))), '[]'::jsonb),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'awarded_at', w.awarded_at))
                          from public.badge_awards w join public.university_badges b on b.id = w.badge_id
                         where w.student_id = s.user_id and w.revoked_at is null and b.university_id = a.university_id), '[]'::jsonb));
end;
$$;

-- The list to pick a student from (not logged; one page at a time, no export).
create function private.uni_students(p_q text default null, p_department uuid default null, p_batch integer default null,
                                     p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'coordinator']::public.uni_admin_role[]);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not private.uni_entitled(a.university_id, 'uni.student_records') then
    raise exception 'individual student records are part of the Growth and Campus licences' using errcode = '42501';
  end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', x.full_name, 'username', x.username, 'department', x.department,
                                        'batch', x.graduation_year, 'status', x.status, 'tier', x.tier) order by x.full_name)
      from (select p.user_id, p.full_name, p.username, p.department, p.graduation_year, p.status, r.tier
              from public.profiles p left join public.ranking_scores r on r.user_id = p.user_id
             where p.university_id = a.university_id and p.role = 'student' and p.status in ('active', 'graduate')
               and (a.role <> 'coordinator' or p.department_id = a.department_id)
               and (p_department is null or p.department_id = p_department)
               and (p_batch is null or p.graduation_year = p_batch)
               and (v_q is null or p.full_name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
                    or p.username ilike replace(replace(v_q, '%', ''), '_', '') || '%')
             order by p.full_name limit 50 offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end;
$$;

-- The student's own view: who at their university opened their record (Pro only).
create function private.my_record_viewers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not private.has_entitlement(v_me, 'privacy.record_viewers') then
    return jsonb_build_object('locked', true);
  end if;
  return jsonb_build_object('locked', false, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('name', l.viewer_name, 'role', l.viewer_role, 'at', l.at) order by l.at desc)
      from (select * from public.student_record_access_log where student_id = v_me and at > now() - interval '12 months'
             order by at desc limit 200) l), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------------
create table public.uni_stats (
  university_id uuid not null references public.universities (id) on delete cascade,
  area text not null check (area in ('home', 'adoption', 'activity', 'skills', 'skills_gap', 'tiers', 'outcomes', 'faculty', 'benchmark')),
  data jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (university_id, area)
);
comment on table public.uni_stats is 'Nightly aggregates per university and area; every group already suppressed below 5 (PRD 5.23).';
alter table public.uni_stats enable row level security;
revoke all on table public.uni_stats from anon, authenticated;

create function private.hide_small(p_n bigint)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_n >= 5 then to_jsonb(p_n) else 'null'::jsonb end;
$$;
revoke all on function private.hide_small(bigint) from public;

create function private.uni_stats_compute(p_university uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_students uuid[];
  v_total integer;
  v_active integer;
  v jsonb;
begin
  select coalesce(array_agg(p.user_id), '{}') into v_students from public.profiles p
   where p.university_id = p_university and p.role = 'student' and p.status = 'active';
  v_total := cardinality(v_students);
  select count(*) into v_active from private.user_activity x where x.user_id = any (v_students) and x.last_active_at > now() - interval '30 days';

  insert into public.uni_stats (university_id, area, data) values (p_university, 'home',
    jsonb_build_object('students', private.hide_small(v_total), 'active_30d', private.hide_small(v_active)))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  insert into public.uni_stats (university_id, area, data) values (p_university, 'adoption', jsonb_build_object(
    'students', private.hide_small(v_total), 'active_30d', private.hide_small(v_active),
    'active_share', case when v_total >= 5 and v_active >= 5 then round(100.0 * v_active / v_total) end,
    'by_department', private.suppress_groups(coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(p.department, 'Not set'), 'count', count(*)))
                       from public.profiles p where p.user_id = any (v_students) group by p.department), '[]'::jsonb)),
    'by_batch', private.suppress_groups(coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(p.graduation_year::text, 'Not set'), 'count', count(*)))
                  from public.profiles p where p.user_id = any (v_students) group by p.graduation_year), '[]'::jsonb))))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  insert into public.uni_stats (university_id, area, data) values (p_university, 'activity', jsonb_build_object(
    'ventures', private.hide_small((select count(distinct m.venture_id) from public.venture_members m where m.user_id = any (v_students))),
    'contributions_30d', private.hide_small((select count(*) from public.contributions c where c.user_id = any (v_students)
                                               and c.created_at > now() - interval '30 days')),
    'cross_university', private.hide_small((select count(*) from (select m.venture_id from public.venture_members m
                                               join public.profiles p on p.user_id = m.user_id
                                              where m.venture_id in (select m2.venture_id from public.venture_members m2 where m2.user_id = any (v_students))
                                              group by m.venture_id having count(distinct p.university_id) > 1) x)),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('label', to_char(w, 'DD Mon'), 'count',
                          private.hide_small((select count(*) from public.contributions c where c.user_id = any (v_students)
                                                and c.created_at >= w and c.created_at < w + interval '7 days'))) order by w)
                          from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w), '[]'::jsonb)))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  insert into public.uni_stats (university_id, area, data) values (p_university, 'skills', jsonb_build_object(
    'by_level', private.suppress_groups(coalesce((select jsonb_agg(jsonb_build_object('label', 'L' || l, 'count', n) order by l)
                  from (select max_level as l, count(*) as n from (select us.user_id, max(us.level) as max_level from public.user_skills us
                         where us.user_id = any (v_students) and us.level >= 1 group by us.user_id) m group by max_level) x), '[]'::jsonb)),
    'top', coalesce((select jsonb_agg(jsonb_build_object('label', name, 'count', n) order by n desc, name)
              from (select k.name, count(*) as n from public.user_skills us join public.skills k on k.id = us.skill_id
                     where us.user_id = any (v_students) and us.level >= 2 group by k.name having count(*) >= 5
                     order by count(*) desc, k.name limit 10) t), '[]'::jsonb),
    'growth_30d', private.hide_small((select count(*) from public.user_skills us where us.user_id = any (v_students) and us.level >= 2
                                        and us.updated_at > now() - interval '30 days'))))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  -- Recruiter demand (searches naming a skill, platform-wide, 90 days) beside L2+ supply here.
  insert into public.uni_stats (university_id, area, data) values (p_university, 'skills_gap', jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('label', k.name, 'demand', d.n,
                          'supply', private.hide_small((select count(*) from public.user_skills us where us.skill_id = d.skill
                                                          and us.user_id = any (v_students) and us.level >= 2))) order by d.n desc)
                         from (select e ->> 'skill' as skill, count(*) as n from public.search_audit sa, jsonb_array_elements(coalesce(sa.filters -> 'skills', '[]'::jsonb)) e
                                where sa.at > now() - interval '90 days' group by 1 order by 2 desc limit 15) d
                         join public.skills k on k.id = d.skill), '[]'::jsonb)))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  insert into public.uni_stats (university_id, area, data) values (p_university, 'tiers', jsonb_build_object(
    'by_tier', private.suppress_groups(coalesce((select jsonb_agg(jsonb_build_object('label', r.tier, 'count', count(*)))
                 from public.ranking_scores r where r.user_id = any (v_students) and r.tier is not null group by r.tier), '[]'::jsonb)),
    'by_department', private.suppress_groups(coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(p.department, 'Not set'), 'count', count(*),
                       'median_top_percent', ceil((1 - percentile_cont(0.5) within group (order by r.percentile)) * 100)))
                       from public.ranking_scores r join public.profiles p on p.user_id = r.user_id
                      where r.user_id = any (v_students) and r.ranked and r.percentile is not null group by p.department), '[]'::jsonb))))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  insert into public.uni_stats (university_id, area, data) values (p_university, 'outcomes', jsonb_build_object(
    'contacts', private.hide_small((select count(*) from public.contact_requests c where c.student_id = any (v_students))),
    'contacts_accepted', private.hide_small((select count(*) from public.contact_requests c where c.student_id = any (v_students) and c.status = 'accepted')),
    'applications', private.hide_small((select count(*) from public.job_applications j where j.student_id = any (v_students))),
    'hires', private.hide_small((select count(*) from public.hires h join public.profiles p on p.user_id = h.student_id
                                  where p.university_id = p_university)),
    'hires_90d', private.hide_small((select count(*) from public.hires h join public.profiles p on p.user_id = h.student_id
                                      where p.university_id = p_university and h.hired_at > now() - interval '90 days'))))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();

  -- Teachers are university staff: counts per teacher, never student content.
  insert into public.uni_stats (university_id, area, data) values (p_university, 'faculty', jsonb_build_object(
    'teachers', coalesce((select jsonb_agg(jsonb_build_object(
                    'name', p.full_name, 'department', t.department,
                    'reviews', (select count(*) from public.venture_reviews r where r.teacher_id = t.user_id),
                    'supervisions', (select count(*) from public.venture_supervisors v where v.teacher_id = t.user_id and v.status in ('active', 'ended')),
                    'code_checks', (select count(*) from public.code_checks c where c.grader_id = t.user_id),
                    'endorsements', (select count(*) from public.endorsements e where e.endorser_id = t.user_id and e.endorser_kind = 'teacher'),
                    'ideas', (select count(*) from public.project_ideas i where i.teacher_id = t.user_id)) order by t.department, p.full_name)
                   from public.teacher_profiles t join public.profiles p on p.user_id = t.user_id
                  where t.university_id = p_university and t.status = 'approved'), '[]'::jsonb)))
  on conflict (university_id, area) do update set data = excluded.data, computed_at = now();
end;
$$;
revoke all on function private.uni_stats_compute(uuid) from public;

-- Anonymised platform averages for the Campus benchmark (only universities with 5+ students).
create function private.uni_benchmark_compute()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select p.university_id, count(*) as students,
           count(*) filter (where exists (select 1 from private.user_activity x where x.user_id = p.user_id and x.last_active_at > now() - interval '30 days')) as active,
           count(*) filter (where exists (select 1 from public.user_skills us where us.user_id = p.user_id and us.level >= 2)) as l2
      from public.profiles p where p.role = 'student' and p.status = 'active' and p.university_id is not null
     group by p.university_id having count(*) >= 5)
  select jsonb_build_object('universities', count(*),
                            'active_share', round(avg(100.0 * active / students)),
                            'l2_share', round(avg(100.0 * l2 / students)))
    from s;
$$;
revoke all on function private.uni_benchmark_compute() from public;

create function private.uni_stats_run()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  u record;
  v_n integer := 0;
  v_bench jsonb;
begin
  v_run := public.job_run_start('uni-stats');
  begin
    v_bench := private.uni_benchmark_compute();
    for u in select distinct p.university_id as id from public.profiles p where p.role = 'student' and p.university_id is not null loop
      perform private.uni_stats_compute(u.id);
      insert into public.uni_stats (university_id, area, data) values (u.id, 'benchmark', v_bench)
      on conflict (university_id, area) do update set data = excluded.data, computed_at = now();
      v_n := v_n + 1;
    end loop;
    -- Record logs are kept 2 years.
    delete from public.student_record_access_log where at < now() - interval '2 years';
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
end;
$$;
revoke all on function private.uni_stats_run() from public;
grant execute on function private.uni_stats_run() to service_role;
select cron.schedule('uni-stats', '37 22 * * *', $$select private.uni_stats_run()$$); -- 03:37 PKT, after ranking

-- One area for the portal, trimmed to the plan. Coordinators see the same university-wide aggregates.
create function private.uni_dashboard(p_area text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career', 'coordinator', 'comms']::public.uni_admin_role[]);
  v jsonb;
  v_full boolean := private.uni_entitled(a.university_id, 'uni.dashboard_full');
  v_key text := case p_area when 'skills_gap' then 'uni.skills_gap' when 'outcomes' then 'uni.outcomes' when 'faculty' then 'uni.faculty_panel'
                            when 'benchmark' then 'uni.benchmark' else 'uni.dashboard' end;
begin
  if p_area not in ('adoption', 'activity', 'skills', 'skills_gap', 'tiers', 'outcomes', 'faculty', 'benchmark') then
    raise exception 'unknown area' using errcode = '22023';
  end if;
  if not private.uni_entitled(a.university_id, v_key) then
    return jsonb_build_object('locked', true, 'plan', private.uni_plan(a.university_id));
  end if;
  -- Career office reads placement analytics (outcomes) only; communications nothing but home.
  if (a.role = 'career' and p_area not in ('outcomes', 'adoption')) or a.role = 'comms' then
    raise exception 'your role doesn''t include this dashboard' using errcode = '42501';
  end if;
  select s.data || jsonb_build_object('computed_at', s.computed_at) into v
    from public.uni_stats s where s.university_id = a.university_id and s.area = p_area;
  v := coalesce(v, '{}'::jsonb);
  -- Basic: totals, top-line and summary only.
  if not v_full then
    v := v - 'weekly' - 'by_batch' - 'by_department' - 'growth_30d';
    if p_area = 'skills' then
      v := v - 'top';
    end if;
  end if;
  return v || jsonb_build_object('locked', false, 'full', v_full, 'exports', private.uni_entitled(a.university_id, 'uni.exports'),
                                 'plan', private.uni_plan(a.university_id));
end;
$$;

-- Home: key numbers and to-dos for the caller's role.
create function private.uni_home()
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
    'numbers', coalesce((select s.data from public.uni_stats s where s.university_id = a.university_id and s.area = 'home'), '{}'::jsonb),
    'todos', jsonb_build_object(
      'teacher_requests', case when a.role in ('owner', 'admin', 'coordinator') then (
        select count(*) from public.teacher_profiles t where t.university_id = a.university_id and t.status = 'pending'
           and (a.role <> 'coordinator' or exists (select 1 from public.departments d where d.id = a.department_id and lower(d.name) = lower(t.department)))) end,
      'open_cases', case when a.role in ('owner', 'admin') then (
        select count(*) from public.university_hides h where h.university_id = a.university_id and h.status = 'hidden') end,
      'pending_invites', case when a.role in ('owner', 'admin') then (
        select count(*) from public.university_admin_invites i where i.university_id = a.university_id and i.used_at is null
           and i.revoked_at is null and i.expires_at > now()) end,
      'upcoming_events', (select count(*) from public.events e where e.university_id = a.university_id and e.cancelled_at is null and e.starts_at > now()),
      'live_fairs', (select count(*) from public.job_fairs f where f.university_id = a.university_id and private.fair_live(f)),
      'no_departments', not exists (select 1 from public.departments d where d.university_id = a.university_id)));
end;
$$;

-- Sponsored Pro (phase 10 grants it): eligible count under the platform rule or the exception.
create function private.uni_sponsorship()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin']::public.uni_admin_role[]);
  u public.universities;
  v_year integer;
begin
  select * into u from public.universities where id = a.university_id;
  -- The platform rule graduates a batch on 1 September, so the final year is the next such year.
  v_year := coalesce(u.final_year_batch,
                     extract(year from (now() at time zone 'Asia/Karachi'))::integer
                       + case when extract(month from (now() at time zone 'Asia/Karachi')) >= 9 then 1 else 0 end);
  return jsonb_build_object(
    'plan', private.uni_plan(a.university_id), 'final_year', v_year, 'exception', u.final_year_batch,
    'eligible_final_year', private.hide_small((select count(*) from public.profiles p where p.university_id = u.id and p.role = 'student'
                                                 and p.status = 'active' and p.graduation_year = v_year)),
    'eligible_all', private.hide_small((select count(*) from public.profiles p where p.university_id = u.id and p.role = 'student' and p.status = 'active')),
    'active_grants', 0,
    'requests', coalesce((select jsonb_agg(jsonb_build_object('batch_year', r.batch_year, 'status', r.status, 'review_reason', r.review_reason,
                                                              'created_at', r.created_at) order by r.created_at desc)
                            from public.final_year_batch_requests r where r.university_id = u.id), '[]'::jsonb));
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
  'university_student_record', 'uni_students', 'my_record_viewers', 'uni_dashboard', 'uni_home', 'uni_sponsorship'
]);

drop function pg_temp.expose(text[]);

-- /uni/moderation: recent University Feed posts and comments to hide from (owner and admins).
create function private.uni_recent_feed()
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
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'type', p.type, 'excerpt', left(p.body, 200), 'author', pr.full_name,
                                                          'created_at', p.created_at, 'hidden', p.hidden_by_university_at is not null) order by p.created_at desc)
                         from (select * from public.posts x where x.university_id = a.university_id and x.audience = 'university'
                                 and x.type <> 'announcement' and x.removed_at is null order by x.created_at desc limit 50) p
                         join public.profiles pr on pr.user_id = p.author_id), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'excerpt', left(c.body, 200), 'author', pr.full_name,
                                                             'created_at', c.created_at, 'hidden', c.hidden_by_university_at is not null) order by c.created_at desc)
                            from (select c2.* from public.post_comments c2 join public.posts p on p.id = c2.post_id
                                   where p.university_id = a.university_id and p.audience = 'university' and p.removed_at is null
                                     and c2.deleted_at is null order by c2.created_at desc limit 50) c
                            join public.profiles pr on pr.user_id = c.author_id), '[]'::jsonb));
end;
$$;
revoke all on function private.uni_recent_feed() from public;
grant execute on function private.uni_recent_feed() to authenticated;
create function public.uni_recent_feed() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.uni_recent_feed() $$;
revoke all on function public.uni_recent_feed() from public, anon;
grant execute on function public.uni_recent_feed() to authenticated;
