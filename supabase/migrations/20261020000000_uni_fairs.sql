-- Phase 9, part 4: job fairs and university hackathons (PRD 5.23; decisions.md 2026-10-04).
--
-- Job fairs (Growth 1, Campus 2 in any 365 days): the career office invites companies by email;
-- a company's booth opens once Skilient has verified it (no plan needed). Students join booth
-- queues: positions come from a per-booth row lock, so 200 students joining at once get
-- 1..200 with no gaps or duplicates (tests/worker/fair-queue.test.ts). A company sees the people
-- in its queue or with a booked slot during the fair and 14 days after; a student who leaves a
-- company disappears from its view at once, except for interviews already held.
-- Hackathons reuse the competition engine with host_type university (Growth 2, Campus 4 a year):
-- no Skilient review, 1 to 22 days, judged by the university's approved teachers (average score).

-- ---------------------------------------------------------------------------
-- Hackathons on the competition engine
-- ---------------------------------------------------------------------------
alter table public.competitions
  add column host_type text not null default 'org' check (host_type in ('org', 'university')),
  add column university_id uuid references public.universities (id) on delete cascade,
  alter column org_id drop not null;
create index competitions_university_idx on public.competitions (university_id, created_at desc) where university_id is not null;

do $$
declare
  c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.competitions'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%7 days%' loop
    execute format('alter table public.competitions drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.competitions
  add constraint competitions_host_check check (
    (host_type = 'org' and org_id is not null and university_id is null)
    or (host_type = 'university' and university_id is not null and org_id is null)),
  add constraint competitions_length_check check (
    case when host_type = 'org' then ends_at >= starts_at + interval '7 days' and ends_at <= starts_at + interval '22 days'
         else ends_at >= starts_at + interval '1 day' and ends_at <= starts_at + interval '22 days' end);

create table public.competition_judges (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (competition_id, teacher_id)
);
create index competition_judges_teacher_idx on public.competition_judges (teacher_id);

create table public.competition_judge_scores (
  team_id uuid not null references public.competition_teams (id) on delete cascade,
  judge_id uuid not null references auth.users (id) on delete cascade,
  scores jsonb not null,
  total numeric(6, 2) not null,
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  created_at timestamptz not null default now(),
  primary key (team_id, judge_id)
);
create index competition_judge_scores_judge_idx on public.competition_judge_scores (judge_id);
alter table public.competition_judges enable row level security;
alter table public.competition_judge_scores enable row level security;
revoke all on table public.competition_judges, public.competition_judge_scores from anon, authenticated;

insert into public.notification_types (type, category, emailed) values
  ('hackathon_judge', 'faculty', false),
  ('fair_invite', 'recruiting', true),
  ('fair_called', 'university', false);

-- p: {title, brief, starts_at, ends_at, team_size, skills: [{skill}], prize, rubric, open_to_all, judges: [uuid]}
create function private.save_hackathon(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
  v_starts timestamptz;
  v_ends timestamptz;
  v_judges uuid[];
  v_id uuid;
  v_used integer;
begin
  begin
    v_starts := (p ->> 'starts_at')::timestamptz;
    v_ends := (p ->> 'ends_at')::timestamptz;
    select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_judges from jsonb_array_elements(coalesce(p -> 'judges', '[]'::jsonb)) x;
  exception when others then
    raise exception 'check the dates and judges' using errcode = '22023';
  end;
  if v_starts is null or v_ends is null or v_ends < v_starts + interval '1 day' or v_ends > v_starts + interval '22 days' then
    raise exception 'a hackathon runs 1 to 22 days' using errcode = '22023';
  end if;
  if v_starts < now() then
    raise exception 'start in the future' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 3 and 100 or char_length(coalesce(p ->> 'brief', '')) not between 100 and 6000
     or char_length(btrim(coalesce(p ->> 'prize', ''))) not between 3 and 300 then
    raise exception 'give a title, a brief of at least 100 characters and a prize (or "Winner badge")' using errcode = '22023';
  end if;
  if not private.rubric_ok(p -> 'rubric') then
    raise exception 'the rubric has 2 to 6 criteria whose weights add up to 100' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'skills') is distinct from 'array' or jsonb_array_length(p -> 'skills') not between 1 and 5
     or exists (select 1 from jsonb_array_elements(p -> 'skills') e where not exists (select 1 from public.skills s where s.id = e ->> 'skill')) then
    raise exception 'pick 1 to 5 skills' using errcode = '22023';
  end if;
  if coalesce((p ->> 'team_size')::integer, 0) not between 1 and 3 then
    raise exception 'teams have 1 to 3 people' using errcode = '22023';
  end if;
  if cardinality(v_judges) not between 1 and 5 or exists (select 1 from unnest(v_judges) j where not exists (
       select 1 from public.teacher_profiles t where t.user_id = j and t.university_id = a.university_id and t.status = 'approved')) then
    raise exception 'pick 1 to 5 of your approved teachers to judge' using errcode = '22023';
  end if;
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('uni-hackathons:' || a.university_id::text, 0));
    select count(*) into v_used from public.competitions c
     where c.university_id = a.university_id and c.status <> 'rejected' and c.created_at > now() - interval '365 days';
    if v_used >= coalesce(private.uni_limit(a.university_id, 'uni.hackathons'), 0) then
      raise exception 'your university''s plan has no hackathons left this year' using errcode = '55000';
    end if;
    -- No Skilient review: the university is accountable, so it goes straight to approved (live at its start).
    insert into public.competitions (host_type, university_id, created_by, title, role, skills, brief, starts_at, ends_at, team_size,
                                     eligible_universities, prize, rubric, status)
    values ('university', a.university_id, a.user_id, btrim(p ->> 'title'), 'Hackathon', p -> 'skills', p ->> 'brief', v_starts, v_ends,
            (p ->> 'team_size')::smallint,
            case when coalesce((p ->> 'open_to_all')::boolean, false) then '{}'::uuid[] else array[a.university_id] end,
            btrim(p ->> 'prize'), p -> 'rubric', 'approved')
    returning id into v_id;
  else
    update public.competitions
       set title = btrim(p ->> 'title'), skills = p -> 'skills', brief = p ->> 'brief', starts_at = v_starts, ends_at = v_ends,
           team_size = (p ->> 'team_size')::smallint, prize = btrim(p ->> 'prize'), rubric = p -> 'rubric',
           eligible_universities = case when coalesce((p ->> 'open_to_all')::boolean, false) then '{}'::uuid[] else array[a.university_id] end
     where id = p_id and university_id = a.university_id and status = 'approved'
    returning id into v_id;
    if v_id is null then
      raise exception 'a hackathon can change only before it starts' using errcode = '55000';
    end if;
    delete from public.competition_judges where competition_id = v_id and not (teacher_id = any (v_judges));
  end if;
  insert into public.competition_judges (competition_id, teacher_id) select v_id, j from unnest(v_judges) j on conflict do nothing;
  perform private.notify(j, a.user_id, 'hackathon_judge', 'competition', v_id, jsonb_build_object('title', btrim(p ->> 'title')))
     from unnest(v_judges) j;
  perform private.uni_audit(a.university_id, 'hackathon.save', 'competition', v_id::text, jsonb_build_object('title', btrim(p ->> 'title')));
  return v_id;
end;
$$;

create function private.uni_hackathons()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'limit', private.uni_limit(a.university_id, 'uni.hackathons'),
    'used', (select count(*) from public.competitions c where c.university_id = a.university_id and c.status <> 'rejected'
               and c.created_at > now() - interval '365 days'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', t.user_id, 'name', p.full_name, 'department', t.department) order by p.full_name)
                            from public.teacher_profiles t join public.profiles p on p.user_id = t.user_id
                           where t.university_id = a.university_id and t.status = 'approved'), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', c.id, 'title', c.title, 'status', c.status, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
                          'teams', (select count(*) from public.competition_teams t where t.competition_id = c.id),
                          'judges', (select jsonb_agg(p.full_name) from public.competition_judges j join public.profiles p on p.user_id = j.teacher_id
                                      where j.competition_id = c.id)) order by c.created_at desc)
                         from public.competitions c where c.university_id = a.university_id), '[]'::jsonb));
end;
$$;

-- A judge's view: entries of hackathons they judge, after the deadline.
create function private.judge_hackathon(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  c public.competitions;
begin
  select x.* into c from public.competitions x join public.competition_judges j on j.competition_id = x.id and j.teacher_id = v_me
   where x.id = p_id;
  if c.id is null then
    raise exception 'hackathon not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'competition', jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'ends_at', c.ends_at, 'rubric', c.rubric),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', t.id, 'name', t.name, 'repo_url', t.repo_url, 'frozen_sha', t.frozen_sha,
                          'my_scores', s.scores, 'my_total', s.total, 'my_feedback', s.feedback) order by t.created_at)
                         from public.competition_teams t
                         left join public.competition_judge_scores s on s.team_id = t.id and s.judge_id = v_me
                        where t.competition_id = c.id and t.repo_url is not null and c.status in ('frozen', 'judged')), '[]'::jsonb));
end;
$$;

create function private.my_judging()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'ends_at', c.ends_at) order by c.ends_at desc)
                     from public.competitions c join public.competition_judges j on j.competition_id = c.id and j.teacher_id = v_me), '[]'::jsonb);
end;
$$;

-- A judge scores; the entry's total is the average of the judges who scored it.
create function private.judge_score_team(p_team uuid, p_scores jsonb, p_feedback text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_teacher();
  c public.competitions;
  t public.competition_teams;
  e jsonb;
  v_total numeric := 0;
  v_value numeric;
begin
  select ct.* into t from public.competition_teams ct where ct.id = p_team;
  select x.* into c from public.competitions x join public.competition_judges j on j.competition_id = x.id and j.teacher_id = v_me
   where x.id = t.competition_id;
  if t.id is null or c.id is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  if c.status <> 'frozen' then
    raise exception 'entries can be scored after the deadline, until the hackathon is finished' using errcode = '55000';
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
  insert into public.competition_judge_scores (team_id, judge_id, scores, total, feedback)
  values (p_team, v_me, p_scores, round(v_total, 2), nullif(left(btrim(coalesce(p_feedback, '')), 2000), ''))
  on conflict (team_id, judge_id) do update set scores = excluded.scores, total = excluded.total, feedback = excluded.feedback;
  update public.competition_teams
     set total = (select round(avg(s.total), 2) from public.competition_judge_scores s where s.team_id = p_team),
         scores = (select jsonb_object_agg(s.judge_id, s.scores) from public.competition_judge_scores s where s.team_id = p_team),
         feedback = (select string_agg(s.feedback, E'\n\n') from public.competition_judge_scores s where s.team_id = p_team and s.feedback is not null)
   where id = p_team;
end;
$$;

-- The university finishes the hackathon (every submitted entry scored by at least one judge).
create function private.finish_hackathon(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
  c public.competitions;
  v_winner uuid;
  m record;
  s record;
begin
  select * into c from public.competitions where id = p_id and university_id = a.university_id for update;
  if not found then
    raise exception 'hackathon not found' using errcode = 'P0002';
  end if;
  if c.status <> 'frozen' then
    raise exception 'finish a hackathon after its deadline' using errcode = '55000';
  end if;
  if exists (select 1 from public.competition_teams t where t.competition_id = p_id and t.repo_url is not null and t.total is null) then
    raise exception 'every submitted entry needs a judge''s score first' using errcode = '55000';
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
  perform private.uni_audit(a.university_id, 'hackathon.finish', 'competition', p_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Job fairs
-- ---------------------------------------------------------------------------
create type public.fair_status as enum ('draft', 'published', 'cancelled');
create type public.fair_queue_status as enum ('waiting', 'called', 'talking', 'done', 'skipped', 'left');

create table public.job_fairs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.fair_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);
comment on table public.job_fairs is 'University job fairs (PRD 5.23). Live = published and between its dates.';
create index job_fairs_uni_idx on public.job_fairs (university_id, starts_at desc);
create index job_fairs_created_by_idx on public.job_fairs (created_by);

create table public.job_fair_invites (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.job_fairs (id) on delete cascade,
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$' and char_length(email) <= 254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_org_id uuid references public.organizations (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index job_fair_invites_fair_idx on public.job_fair_invites (fair_id);
create index job_fair_invites_email_idx on public.job_fair_invites (email);
create index job_fair_invites_invited_by_idx on public.job_fair_invites (invited_by);
create index job_fair_invites_org_idx on public.job_fair_invites (accepted_org_id);

create table public.job_fair_booths (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.job_fairs (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  roles text[] not null default '{}' check (cardinality(roles) <= 10),
  about text check (about is null or char_length(about) <= 1000),
  next_position integer not null default 1,
  created_at timestamptz not null default now(),
  unique (fair_id, org_id)
);
create index job_fair_booths_org_idx on public.job_fair_booths (org_id);

create table public.job_fair_queue (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references public.job_fair_booths (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  status public.fair_queue_status not null default 'waiting',
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  ended_at timestamptz,
  thread_id uuid references public.chat_threads (id) on delete set null,
  unique (booth_id, position)
);
comment on table public.job_fair_queue is 'Booth queues; positions are handed out under a lock on the booth row, so they never repeat or skip.';
create unique index job_fair_queue_active_idx on public.job_fair_queue (booth_id, student_id) where status in ('waiting', 'called', 'talking');
create index job_fair_queue_student_idx on public.job_fair_queue (student_id);
create index job_fair_queue_thread_idx on public.job_fair_queue (thread_id);

create table public.job_fair_slots (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references public.job_fair_booths (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  student_id uuid references auth.users (id) on delete set null,
  booked_at timestamptz,
  held_at timestamptz,
  cancelled_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '60 minutes' and ends_at >= starts_at + interval '15 minutes')
);
create index job_fair_slots_booth_idx on public.job_fair_slots (booth_id, starts_at);
create index job_fair_slots_student_idx on public.job_fair_slots (student_id);

alter table public.chat_threads add column fair_id uuid references public.job_fairs (id) on delete set null;
create index chat_threads_fair_idx on public.chat_threads (fair_id);

alter table public.job_fairs enable row level security;
alter table public.job_fair_invites enable row level security;
alter table public.job_fair_booths enable row level security;
alter table public.job_fair_queue enable row level security;
alter table public.job_fair_slots enable row level security;
revoke all on table public.job_fairs, public.job_fair_invites, public.job_fair_booths, public.job_fair_queue, public.job_fair_slots
  from anon, authenticated;

-- An active member of the booth's organisation (two-factor, like the rest of the recruiter portal).
create function private.is_booth_member(p_booth uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.job_fair_booths b join public.org_members m on m.org_id = b.org_id
                  where b.id = p_booth and m.user_id = (select auth.uid()) and m.status = 'active');
$$;
revoke all on function private.is_booth_member(uuid) from public;
grant execute on function private.is_booth_member(uuid) to authenticated;

-- Realtime: students see their own queue rows; the company sees rows in its queue, never a student
-- who left.
grant select on table public.job_fair_queue to authenticated;
create policy job_fair_queue_read on public.job_fair_queue for select to authenticated
  using (student_id = (select auth.uid()) or (status <> 'left' and private.is_booth_member(booth_id)));
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.job_fair_queue;
  end if;
end;
$$;

create function private.fair_live(f public.job_fairs)
returns boolean
language sql
stable
set search_path = ''
as $$
  select f.status = 'published' and now() between f.starts_at and f.ends_at;
$$;
revoke all on function private.fair_live(public.job_fairs) from public;

-- Students of the university, and its graduates from the last 12 months.
create function private.fair_eligible(p_fair uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.job_fairs f join public.profiles p on p.user_id = p_user
                  where f.id = p_fair and p.university_id = f.university_id and p.role = 'student'
                    and (p.status = 'active' or (p.status = 'graduate' and p.graduated_at > now() - interval '12 months')));
$$;
revoke all on function private.fair_eligible(uuid, uuid) from public;

-- p: {title, description, starts_at, ends_at}
create function private.save_job_fair(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
  v_starts timestamptz;
  v_ends timestamptz;
  v_id uuid;
begin
  begin
    v_starts := (p ->> 'starts_at')::timestamptz;
    v_ends := (p ->> 'ends_at')::timestamptz;
  exception when others then
    raise exception 'check the dates' using errcode = '22023';
  end;
  if v_starts is null or v_ends is null or v_ends <= v_starts or v_ends > v_starts + interval '7 days' then
    raise exception 'a fair ends after it starts and lasts up to 7 days' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 3 and 120 then
    raise exception 'fair titles are 3 to 120 characters' using errcode = '22023';
  end if;
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('uni-fairs:' || a.university_id::text, 0));
    if (select count(*) from public.job_fairs f where f.university_id = a.university_id and f.status <> 'cancelled'
          and f.created_at > now() - interval '365 days') >= coalesce(private.uni_limit(a.university_id, 'uni.job_fairs'), 0) then
      raise exception 'your university''s plan has no job fairs left this year' using errcode = '55000';
    end if;
    insert into public.job_fairs (university_id, title, description, starts_at, ends_at, created_by)
    values (a.university_id, btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'description', '')), ''), v_starts, v_ends, a.user_id)
    returning id into v_id;
  else
    update public.job_fairs set title = btrim(p ->> 'title'), description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
                                starts_at = v_starts, ends_at = v_ends
     where id = p_id and university_id = a.university_id and status <> 'cancelled' and ends_at > now()
    returning id into v_id;
    if v_id is null then
      raise exception 'fair not found' using errcode = 'P0002';
    end if;
  end if;
  perform private.uni_audit(a.university_id, 'fair.save', 'job_fair', v_id::text, jsonb_build_object('title', btrim(p ->> 'title')));
  return v_id;
end;
$$;

-- publish | cancel
create function private.set_job_fair_status(p_id uuid, p_action text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
begin
  if p_action = 'publish' then
    update public.job_fairs set status = 'published' where id = p_id and university_id = a.university_id and status = 'draft';
  elsif p_action = 'cancel' then
    update public.job_fairs set status = 'cancelled' where id = p_id and university_id = a.university_id and status <> 'cancelled';
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  if not found then
    raise exception 'fair not found' using errcode = 'P0002';
  end if;
  perform private.uni_audit(a.university_id, 'fair.' || p_action, 'job_fair', p_id::text);
end;
$$;

-- Invite a company by email; the link carries a token whose SHA-256 only is stored.
create function private.invite_fair_company(p_fair uuid, p_email text, p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if not exists (select 1 from public.job_fairs f where f.id = p_fair and f.university_id = a.university_id
                   and f.status <> 'cancelled' and f.ends_at > now()) then
    raise exception 'fair not found' using errcode = 'P0002';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'enter a valid email address' using errcode = '22023';
  end if;
  if not private.is_recruiter_domain(private.email_domain(v_email)) then
    raise exception 'invite a company email (not a webmail or university address)' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invite' using errcode = '22023';
  end if;
  if (select count(*) from public.job_fair_invites i where i.fair_id = p_fair) >= 200 then
    raise exception 'up to 200 invites a fair' using errcode = '23514';
  end if;
  if not private.rate_limit('fair_invite:' || a.user_id::text, 100, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.job_fair_invites (fair_id, email, token_hash, invited_by) values (p_fair, v_email, p_token_hash, a.user_id)
  returning id into v_id;
  perform private.uni_audit(a.university_id, 'fair.invite', 'job_fair', p_fair::text, jsonb_build_object('email', v_email));
  return v_id;
end;
$$;

create function private.fair_invite_preview(p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('fair', f.title, 'university', u.name, 'starts_at', f.starts_at, 'ends_at', f.ends_at, 'email', i.email)
    from public.job_fair_invites i join public.job_fairs f on f.id = i.fair_id join public.universities u on u.id = f.university_id
   where i.token_hash = p_token_hash and i.revoked_at is null and i.accepted_at is null and f.status <> 'cancelled' and f.ends_at > now();
$$;
revoke all on function private.fair_invite_preview(text) from public;

-- An organisation admin accepts; the booth opens to students once the organisation is verified.
create function private.accept_fair_invite(p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
  i public.job_fair_invites;
  v_domain text := (select o.domain from public.organizations o where o.id = v_org);
  v_booth uuid;
begin
  select * into i from public.job_fair_invites where token_hash = p_token_hash for update;
  if not found or i.revoked_at is not null or i.accepted_at is not null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if private.email_domain(i.email) <> v_domain then
    raise exception 'this invite is for another company' using errcode = '42501';
  end if;
  insert into public.job_fair_booths (fair_id, org_id) values (i.fair_id, v_org)
  on conflict (fair_id, org_id) do update set org_id = excluded.org_id returning id into v_booth;
  update public.job_fair_invites set accepted_at = now(), accepted_org_id = v_org where id = i.id;
  return v_booth;
end;
$$;

-- Booth details (organisation admins and recruiters): roles and interview slots.
create function private.save_booth(p_booth uuid, p_roles text[], p_about text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_roles text[];
begin
  if not private.is_booth_member(p_booth) then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(btrim(r)), '{}') into v_roles from unnest(coalesce(p_roles, '{}')) r where char_length(btrim(r)) between 2 and 80;
  if cardinality(v_roles) > 10 or char_length(coalesce(p_about, '')) > 1000 then
    raise exception 'up to 10 roles and 1,000 characters about the company' using errcode = '22023';
  end if;
  update public.job_fair_booths set roles = v_roles, about = nullif(btrim(coalesce(p_about, '')), '') where id = p_booth;
end;
$$;

create function private.add_booth_slots(p_booth uuid, p_starts timestamptz, p_count integer, p_minutes integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f public.job_fairs;
  i integer;
begin
  if not private.is_booth_member(p_booth) then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  select x.* into f from public.job_fairs x join public.job_fair_booths b on b.fair_id = x.id where b.id = p_booth;
  if p_count not between 1 and 40 or p_minutes not between 15 and 60 then
    raise exception 'add 1 to 40 slots of 15 to 60 minutes' using errcode = '22023';
  end if;
  if p_starts < f.starts_at or p_starts + make_interval(mins => p_count * p_minutes) > f.ends_at then
    raise exception 'slots fall inside the fair''s dates' using errcode = '22023';
  end if;
  if (select count(*) from public.job_fair_slots s where s.booth_id = p_booth) + p_count > 200 then
    raise exception 'up to 200 slots a booth' using errcode = '23514';
  end if;
  for i in 0 .. p_count - 1 loop
    insert into public.job_fair_slots (booth_id, starts_at, ends_at)
    values (p_booth, p_starts + make_interval(mins => i * p_minutes), p_starts + make_interval(mins => (i + 1) * p_minutes));
  end loop;
  return p_count;
end;
$$;

-- Students and recruiters: the fair page.
create function private.fair_view(p_fair uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  f public.job_fairs;
  v_student boolean;
  v_booth uuid;
begin
  select * into f from public.job_fairs where id = p_fair and status <> 'draft';
  if f.id is null then
    raise exception 'fair not found' using errcode = 'P0002';
  end if;
  v_student := private.fair_eligible(p_fair, v_me);
  select b.id into v_booth from public.job_fair_booths b join public.org_members m on m.org_id = b.org_id
   where b.fair_id = p_fair and m.user_id = v_me and m.status = 'active';
  if not v_student and v_booth is null
     and not private.is_uni_role_of(f.university_id, array['owner', 'admin', 'career']::public.uni_admin_role[]) then
    raise exception 'fair not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', f.id, 'title', f.title, 'description', f.description, 'starts_at', f.starts_at, 'ends_at', f.ends_at,
    'status', case when f.status = 'cancelled' then 'cancelled' when now() < f.starts_at then 'upcoming'
                   when now() > f.ends_at then 'ended' else 'live' end,
    'university', (select u.name from public.universities u where u.id = f.university_id),
    'viewer', case when v_booth is not null then 'recruiter' when v_student then 'student' else 'admin' end,
    'my_booth', v_booth,
    'booths', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', b.id, 'company', o.name, 'company_slug', o.slug, 'roles', to_jsonb(b.roles), 'about', b.about,
                 'waiting', (select count(*) from public.job_fair_queue q where q.booth_id = b.id and q.status = 'waiting'),
                 'open_slots', (select count(*) from public.job_fair_slots s where s.booth_id = b.id and s.student_id is null
                                  and s.cancelled_at is null and s.starts_at > now()),
                 'my_queue', (select jsonb_build_object('id', q.id, 'status', q.status, 'position', q.position,
                                                        'ahead', (select count(*) from public.job_fair_queue q2 where q2.booth_id = b.id
                                                                    and q2.status = 'waiting' and q2.position < q.position),
                                                        'thread_id', q.thread_id)
                                from public.job_fair_queue q where q.booth_id = b.id and q.student_id = v_me
                                 and q.status in ('waiting', 'called', 'talking') limit 1),
                 'my_slot', (select jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at)
                               from public.job_fair_slots s where s.booth_id = b.id and s.student_id = v_me and s.cancelled_at is null limit 1),
                 'slots', case when v_student then (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at)
                                                                            order by s.starts_at), '[]'::jsonb)
                                                       from public.job_fair_slots s where s.booth_id = b.id and s.student_id is null
                                                        and s.cancelled_at is null and s.starts_at > now()) end)
               order by o.name)
               from public.job_fair_booths b join public.organizations o on o.id = b.org_id and o.status = 'verified'
              where b.fair_id = f.id), '[]'::jsonb));
end;
$$;

-- Joining a queue: the booth row lock hands out the next position; at most 3 queues at once.
create function private.join_fair_queue(p_booth uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  b public.job_fair_booths;
  f public.job_fairs;
  v_pos integer;
begin
  -- The student's own lock first (their 3-queue limit), then the booth's (the position).
  perform pg_advisory_xact_lock(hashtextextended('fair-student:' || v_me::text, 0));
  select * into b from public.job_fair_booths where id = p_booth for update;
  if not found then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  select * into f from public.job_fairs where id = b.fair_id;
  if not private.fair_eligible(f.id, v_me)
     or not exists (select 1 from public.organizations o where o.id = b.org_id and o.status = 'verified') then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  if not private.fair_live(f) then
    raise exception 'queues open while the fair is live' using errcode = '55000';
  end if;
  if exists (select 1 from public.job_fair_queue q where q.booth_id = p_booth and q.student_id = v_me and q.status in ('waiting', 'called', 'talking')) then
    raise exception 'you''re already in this queue' using errcode = '23505';
  end if;
  if (select count(*) from public.job_fair_queue q where q.student_id = v_me and q.status in ('waiting', 'called', 'talking')) >= 3 then
    raise exception 'you can wait in up to 3 queues at once' using errcode = '23514';
  end if;
  v_pos := b.next_position;
  update public.job_fair_booths set next_position = next_position + 1 where id = p_booth;
  insert into public.job_fair_queue (booth_id, student_id, position) values (p_booth, v_me, v_pos);
  return v_pos;
end;
$$;

-- Leaving a company: every row with it goes ("left") and unheld slots are freed, so the
-- company stops seeing the student at once; interviews already held stay.
create function private.leave_fair_booth(p_booth uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  update public.job_fair_queue set status = 'left', ended_at = coalesce(ended_at, now())
   where booth_id = p_booth and student_id = v_me and status <> 'left';
  update public.job_fair_slots set student_id = null, booked_at = null
   where booth_id = p_booth and student_id = v_me and held_at is null;
end;
$$;

-- The student answers a call within 5 minutes.
create function private.answer_fair_call(p_queue uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  q public.job_fair_queue;
begin
  update public.job_fair_queue set status = 'talking'
   where id = p_queue and student_id = v_me and status = 'called' and called_at > now() - interval '5 minutes'
  returning * into q;
  if q.id is null then
    raise exception 'this call has ended; join the queue again' using errcode = '55000';
  end if;
  return q.thread_id;
end;
$$;

create function private.book_fair_slot(p_slot uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  s public.job_fair_slots;
  f public.job_fairs;
begin
  select * into s from public.job_fair_slots where id = p_slot for update;
  select x.* into f from public.job_fairs x join public.job_fair_booths b on b.fair_id = x.id where b.id = s.booth_id;
  if s.id is null or not private.fair_eligible(f.id, v_me) or f.status <> 'published' then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  if s.student_id is not null or s.cancelled_at is not null or s.starts_at <= now() then
    raise exception 'that slot is taken; pick another' using errcode = '23505';
  end if;
  if exists (select 1 from public.job_fair_slots x where x.booth_id = s.booth_id and x.student_id = v_me and x.cancelled_at is null and x.held_at is null) then
    raise exception 'you already have an interview slot with this company' using errcode = '23505';
  end if;
  update public.job_fair_slots set student_id = v_me, booked_at = now() where id = p_slot;
end;
$$;

-- Company side: the queue (students who left never appear).
create function private.booth_queue(p_booth uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f public.job_fairs;
begin
  if not private.is_booth_member(p_booth) then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  select x.* into f from public.job_fairs x join public.job_fair_booths b on b.fair_id = x.id where b.id = p_booth;
  if now() > f.ends_at + interval '14 days' then
    raise exception 'fair access ended 14 days after the fair' using errcode = '55000';
  end if;
  -- Calls not answered within 5 minutes count as skipped.
  update public.job_fair_queue set status = 'skipped', ended_at = now()
   where booth_id = p_booth and status = 'called' and called_at <= now() - interval '5 minutes';
  return jsonb_build_object(
    'booth', (select jsonb_build_object('id', b.id, 'roles', to_jsonb(b.roles), 'about', b.about) from public.job_fair_booths b where b.id = p_booth),
    'queue', coalesce((select jsonb_agg(jsonb_build_object(
               'id', q.id, 'position', q.position, 'status', q.status, 'joined_at', q.joined_at, 'called_at', q.called_at,
               'thread_id', q.thread_id, 'student', private.fair_student_card(q.student_id)) order by q.position)
               from public.job_fair_queue q where q.booth_id = p_booth and q.status <> 'left'), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(jsonb_build_object(
               'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'held', s.held_at is not null,
               'student', case when s.student_id is not null then private.fair_student_card(s.student_id) end) order by s.starts_at)
               from public.job_fair_slots s where s.booth_id = p_booth and s.cancelled_at is null), '[]'::jsonb));
end;
$$;

create function private.fair_student_card(p_student uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', p.full_name, 'department', p.department, 'batch', p.graduation_year,
                            'tier', (select r.tier from public.ranking_scores r where r.user_id = p.user_id),
                            'skills', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'level', us.level) order by us.level desc, s.name)
                                                  from public.user_skills us join public.skills s on s.id = us.skill_id
                                                 where us.user_id = p.user_id and us.level >= 2), '[]'::jsonb))
    from public.profiles p where p.user_id = p_student;
$$;
revoke all on function private.fair_student_card(uuid) from public;

-- Call the next waiting student: a DM labelled with the company and the fair.
create function private.fair_call_next(p_booth uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  b public.job_fair_booths;
  f public.job_fairs;
  q public.job_fair_queue;
  v_key text;
  v_thread uuid;
begin
  if not private.is_booth_member(p_booth) then
    raise exception 'booth not found' using errcode = 'P0002';
  end if;
  select * into b from public.job_fair_booths where id = p_booth for update;
  select * into f from public.job_fairs where id = b.fair_id;
  if not private.fair_live(f) then
    raise exception 'call students while the fair is live' using errcode = '55000';
  end if;
  if not exists (select 1 from public.organizations o where o.id = b.org_id and o.status = 'verified') then
    raise exception 'your organisation isn''t verified yet' using errcode = '42501';
  end if;
  update public.job_fair_queue set status = 'skipped', ended_at = now()
   where booth_id = p_booth and status = 'called' and called_at <= now() - interval '5 minutes';
  select * into q from public.job_fair_queue where booth_id = p_booth and status = 'waiting' order by position limit 1 for update;
  if q.id is null then
    raise exception 'nobody is waiting' using errcode = 'P0002';
  end if;
  v_key := least(v_me, q.student_id)::text || ':' || greatest(v_me, q.student_id)::text;
  perform pg_advisory_xact_lock(hashtextextended('dm:' || v_key, 0));
  select id into v_thread from public.chat_threads where type = 'dm' and dm_key = v_key;
  if v_thread is null then
    insert into public.chat_threads (type, dm_key, org_id, fair_id) values ('dm', v_key, b.org_id, f.id) returning id into v_thread;
    insert into public.chat_thread_members (thread_id, user_id) values (v_thread, v_me), (v_thread, q.student_id);
  else
    update public.chat_threads set org_id = b.org_id, fair_id = f.id, closed_at = null where id = v_thread;
  end if;
  update public.job_fair_queue set status = 'called', called_at = now(), thread_id = v_thread where id = q.id;
  perform private.notify(q.student_id, null, 'fair_called', 'job_fair', f.id,
                         jsonb_build_object('company', (select o.name from public.organizations o where o.id = b.org_id),
                                            'fair', f.title, 'thread_id', v_thread, 'queue_id', q.id));
  return v_thread;
end;
$$;

-- done (talked) | held (interview slot happened)
create function private.fair_mark(p_kind text, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_kind = 'done' then
    update public.job_fair_queue q set status = 'done', ended_at = now()
     where q.id = p_id and q.status in ('called', 'talking') and private.is_booth_member(q.booth_id);
  elsif p_kind = 'held' then
    update public.job_fair_slots s set held_at = now()
     where s.id = p_id and s.student_id is not null and s.held_at is null and private.is_booth_member(s.booth_id);
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- A recruiter's fairs.
create function private.my_fair_booths()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin', 'recruiter']::public.org_role[], false);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('fair_id', f.id, 'booth_id', b.id, 'title', f.title, 'university', u.name,
                                                      'starts_at', f.starts_at, 'ends_at', f.ends_at, 'status', f.status) order by f.starts_at desc)
                     from public.job_fair_booths b join public.job_fairs f on f.id = b.fair_id join public.universities u on u.id = f.university_id
                    where b.org_id = v_org), '[]'::jsonb);
end;
$$;

-- University side: fairs, live dashboard and the post-fair report (groups of 5+ for student breakdowns).
create function private.uni_fairs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
begin
  return jsonb_build_object(
    'limit', private.uni_limit(a.university_id, 'uni.job_fairs'),
    'used', (select count(*) from public.job_fairs f where f.university_id = a.university_id and f.status <> 'cancelled'
               and f.created_at > now() - interval '365 days'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status, 'starts_at', f.starts_at,
                                                          'ends_at', f.ends_at,
                                                          'booths', (select count(*) from public.job_fair_booths b where b.fair_id = f.id))
                                       order by f.starts_at desc)
                         from public.job_fairs f where f.university_id = a.university_id), '[]'::jsonb));
end;
$$;

create function private.uni_fair(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner', 'admin', 'career']::public.uni_admin_role[]);
  f public.job_fairs;
  v_attendees uuid[];
begin
  select * into f from public.job_fairs where id = p_id and university_id = a.university_id;
  if f.id is null then
    raise exception 'fair not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(distinct x.student_id), '{}') into v_attendees from (
    select q.student_id from public.job_fair_queue q join public.job_fair_booths b on b.id = q.booth_id where b.fair_id = f.id
    union select s.student_id from public.job_fair_slots s join public.job_fair_booths b on b.id = s.booth_id
           where b.fair_id = f.id and s.student_id is not null) x;
  return jsonb_build_object(
    'fair', to_jsonb(f) - 'created_by',
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'accepted', i.accepted_at is not null,
                                                            'company', o.name, 'verified', o.status = 'verified') order by i.created_at desc)
                           from public.job_fair_invites i left join public.organizations o on o.id = i.accepted_org_id
                          where i.fair_id = f.id), '[]'::jsonb),
    'booths', coalesce((select jsonb_agg(jsonb_build_object(
                 'company', o.name, 'verified', o.status = 'verified',
                 'waiting', (select count(*) from public.job_fair_queue q where q.booth_id = b.id and q.status = 'waiting'),
                 'conversations', (select count(*) from public.job_fair_queue q where q.booth_id = b.id and q.status in ('talking', 'done')),
                 'interviews_booked', (select count(*) from public.job_fair_slots s where s.booth_id = b.id and s.student_id is not null),
                 'interviews_held', (select count(*) from public.job_fair_slots s where s.booth_id = b.id and s.held_at is not null))
               order by o.name)
               from public.job_fair_booths b join public.organizations o on o.id = b.org_id where b.fair_id = f.id), '[]'::jsonb),
    'report', jsonb_build_object(
      'attendees', cardinality(v_attendees),
      'conversations', (select count(*) from public.job_fair_queue q join public.job_fair_booths b on b.id = q.booth_id
                         where b.fair_id = f.id and q.status in ('talking', 'done')),
      'interviews_held', (select count(*) from public.job_fair_slots s join public.job_fair_booths b on b.id = s.booth_id
                           where b.fair_id = f.id and s.held_at is not null),
      'contacts', (select count(*) from public.contact_requests c
                    where c.student_id = any (v_attendees) and c.org_id in (select b.org_id from public.job_fair_booths b where b.fair_id = f.id)
                      and c.created_at between f.starts_at and f.ends_at + interval '90 days'),
      'hires', (select count(*) from public.hires h
                 where h.student_id = any (v_attendees) and h.org_id in (select b.org_id from public.job_fair_booths b where b.fair_id = f.id)
                   and h.hired_at between f.starts_at and f.ends_at + interval '90 days'),
      'by_department', private.suppress_groups(coalesce((
                         select jsonb_agg(jsonb_build_object('label', coalesce(p.department, 'Not set'), 'count', n))
                           from (select p.department, count(*)::integer as n from public.profiles p
                                  where p.user_id = any (v_attendees) group by p.department) p), '[]'::jsonb))));
end;
$$;

-- Groups under 5 show as null ("fewer than 5"); when exactly one group would be hidden, the
-- next-smallest is hidden too, so no hidden count can be worked out from a visible total.
create function private.suppress_groups(p_groups jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hidden integer;
  v_next text;
begin
  select count(*) into v_hidden from jsonb_array_elements(p_groups) g where (g ->> 'count')::integer < 5;
  if v_hidden = 1 then
    select g ->> 'label' into v_next from jsonb_array_elements(p_groups) g
     where (g ->> 'count')::integer >= 5 order by (g ->> 'count')::integer, g ->> 'label' limit 1;
  end if;
  return coalesce((select jsonb_agg(case when (g ->> 'count')::integer < 5 or g ->> 'label' = v_next
                                         then g || jsonb_build_object('count', null) else g end
                                    order by g ->> 'label')
                     from jsonb_array_elements(p_groups) g), '[]'::jsonb);
end;
$$;
revoke all on function private.suppress_groups(jsonb) from public;
grant execute on function private.suppress_groups(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Opportunities: hackathons beside competitions; the Job fairs tab
-- ---------------------------------------------------------------------------
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
    select c.id, case when c.host_type = 'university' then 'hackathon' else 'competition' end, c.title, coalesce(o.name, u.name),
           initcap(c.status::text) || ' · prize: ' || c.prize,
           '/competitions/' || c.id::text, c.starts_at, false
      from public.competitions c
      left join public.organizations o on o.id = c.org_id
      left join public.universities u on u.id = c.university_id
     where c.status in ('approved', 'live', 'frozen', 'judged')
       and (cardinality(c.eligible_universities) = 0
            or (select p.university_id from public.profiles p where p.user_id = v_me) = any (c.eligible_universities))
     order by c.starts_at desc limit 50 offset greatest(coalesce(p_after, 0), 0);
  elsif p_tab = 'job_fairs' then
    return query
    select f.id, 'job_fair'::text, f.title, u.name,
           case when now() < f.starts_at then 'Starts ' || to_char(f.starts_at at time zone 'Asia/Karachi', 'DD Mon')
                when now() > f.ends_at then 'Ended' else 'Live now' end
             || ' · ' || (select count(*) from public.job_fair_booths b join public.organizations o on o.id = b.org_id and o.status = 'verified'
                           where b.fair_id = f.id) || ' companies',
           '/fairs/' || f.id::text, f.starts_at, false
      from public.job_fairs f join public.universities u on u.id = f.university_id
     where f.status = 'published' and f.ends_at > now() - interval '14 days' and private.fair_eligible(f.id, v_me)
     order by f.starts_at limit 50 offset greatest(coalesce(p_after, 0), 0);
  end if;
  return;
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
  'save_hackathon', 'uni_hackathons', 'judge_hackathon', 'my_judging', 'judge_score_team', 'finish_hackathon',
  'save_job_fair', 'set_job_fair_status', 'invite_fair_company', 'accept_fair_invite', 'save_booth', 'add_booth_slots',
  'fair_view', 'join_fair_queue', 'leave_fair_booth', 'answer_fair_call', 'book_fair_slot',
  'booth_queue', 'fair_call_next', 'fair_mark', 'my_fair_booths', 'uni_fairs', 'uni_fair'
]);

grant execute on function private.fair_invite_preview(text) to anon, authenticated;
create function public.fair_invite_preview(p_token_hash text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.fair_invite_preview(p_token_hash) $$;
revoke all on function public.fair_invite_preview(text) from public;
grant execute on function public.fair_invite_preview(text) to anon, authenticated;

drop function pg_temp.expose(text[]);
