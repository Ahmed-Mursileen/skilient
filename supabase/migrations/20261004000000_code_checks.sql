-- Phase 4, slice 4: code checks, the other path to L4 (PRD 5.5 "Code check", 5.21 rubric;
-- decisions.md 2026-09-30). A student asks for a check on a skill they have at L2 from their
-- own commits. The GitHub worker picks a run of 20-40 lines the student added themselves in
-- one of those commits and records only where it is (repository, commit, path, lines); the
-- code is read from GitHub each time it is shown (the code-check Edge Function) and never
-- stored. The student gets 10 minutes, code visible, to answer three fixed questions (what it
-- does, why it is written this way, how they would change it for a requirement drawn from a
-- bank). Until teachers exist (phase 7) trust reviewers on two-factor grade it in /ops against
-- a 4-part rubric; 3 of 4 passes and makes the skill L4. One attempt per skill per 30 days,
-- counted from when the code is first shown. No AI writes questions or grades answers.

insert into public.platform_config (key, version, value, reason) values
  ('code_check.limits', 1,
   '{"minutes": 10, "grace_seconds": 30, "retry_days": 30, "due_hours": 72, "ready_days": 7, "answer_max": 2000, "min_lines": 20, "max_lines": 40, "pass_parts": 3}',
   'PRD 5.5 and 5.21 (decisions.md 2026-09-30)');

-- ---------------------------------------------------------------------------
-- The change-request bank: per skill (later, teachers and ops) or per category (seeded)
-- ---------------------------------------------------------------------------
create table public.code_check_prompts (
  id uuid primary key default gen_random_uuid(),
  skill_id text references public.skills (id),
  category public.skill_category,
  prompt text not null check (char_length(btrim(prompt)) between 10 and 300),
  author_id uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (skill_id is not null or category is not null)
);
comment on table public.code_check_prompts is
  'Change requests for code checks (PRD 5.5), per skill or per category. Never readable directly: a student sees only theirs, once the code is shown.';
create index code_check_prompts_skill_idx on public.code_check_prompts (skill_id) where active;
create index code_check_prompts_category_idx on public.code_check_prompts (category) where active;
create index code_check_prompts_author_idx on public.code_check_prompts (author_id) where author_id is not null;
alter table public.code_check_prompts enable row level security;
revoke all on table public.code_check_prompts from anon, authenticated;

insert into public.code_check_prompts (category, prompt) values
  ('language', 'The input can now be empty, missing or malformed. How would you change this code to handle that safely?'),
  ('language', 'It now has to handle 100 times more data. What would you change, and why?'),
  ('language', 'Another part of the project needs to reuse this logic. How would you restructure it?'),
  ('language', 'You need automated tests for this code. What would you test, and what would you change to make it easy to test?'),
  ('language', 'Failures must now be logged with enough detail to debug them later. What would you add?'),
  ('language', 'A teammate finds this hard to read. How would you rewrite it for clarity without changing what it does?'),
  ('language', 'It must now run for many users at the same time. What could go wrong, and what would you change?'),
  ('language', 'A new option must change how it behaves. How would you add it without breaking the code that already calls it?'),
  ('framework', 'This screen or endpoint must now load its data from an API that can be slow or fail. What would you change?'),
  ('framework', 'Only signed-in users with a certain role may use this. How would you enforce that the framework''s way?'),
  ('framework', 'Ten times more people now use this page or endpoint. What would you change to keep it fast?'),
  ('framework', 'You need to add form input with validation here. How would you do it the framework''s way?'),
  ('framework', 'This part needs automated tests. Which of the framework''s tools would you use, and what would you test?'),
  ('framework', 'A second screen or endpoint needs the same behaviour. How would you share it instead of copying it?'),
  ('framework', 'A new major version of the framework breaks something here. How would you find what broke and fix it?'),
  ('framework', 'Errors here must show the user a helpful message instead of crashing. What would you change?'),
  ('library', 'The library call can fail or time out. How would you handle that here?'),
  ('library', 'You must replace this library with a different one. How would you change the code so the swap touches as little as possible?'),
  ('library', 'The data passed to the library is now much larger. What would you check or change?'),
  ('library', 'You need a test for this code that doesn''t call the real library. How would you write it?'),
  ('library', 'A newer version of the library changes this function''s signature. How would you update the code and check it still works?'),
  ('library', 'The library''s result must now be cached. Where and how would you add that?'),
  ('library', 'The library needs different settings in development and production. How would you handle that?'),
  ('library', 'Input must be validated before it reaches the library. What would you check?'),
  ('tool', 'This must now also work for a second environment, such as staging. What would you change?'),
  ('tool', 'This now takes too long to build or run. What would you change to speed it up?'),
  ('tool', 'A secret such as an API key is needed here. How would you provide it safely?'),
  ('tool', 'It fails on a teammate''s machine but works on yours. How would you find out why and fix it?'),
  ('tool', 'This must now run automatically on every push. What would you add or change?'),
  ('tool', 'A dependency''s version must be pinned so builds can be repeated exactly. What would you change?'),
  ('tool', 'You need to roll back to the previous version quickly. How would this setup support that?'),
  ('tool', 'A new teammate must be able to use this within 10 minutes. What would you change or document?'),
  ('platform', 'Usage grows ten times. What would you change to stay within the platform''s limits and cost?'),
  ('platform', 'Only the owner of a record may read or change it. How would you enforce that on this platform?'),
  ('platform', 'The platform''s service is briefly unavailable. How should this code behave?'),
  ('platform', 'You need separate development and production setups. What would you change?'),
  ('platform', 'Sensitive data must be protected when stored and when sent. What would you check or change?'),
  ('platform', 'You need logs or metrics to see when this fails in production. What would you add?'),
  ('platform', 'A service limit forces a different configuration. What would you change?'),
  ('platform', 'The data here must be backed up and restorable. How would you set that up?'),
  ('practice', 'A bug slips through in this area. What test or check would have caught it, and where would you add it?'),
  ('practice', 'The team wants to know whether this practice is working. What would you measure?'),
  ('practice', 'A new teammate must follow this practice. What would you document or automate?'),
  ('practice', 'The deadline is tight. What part of this would you keep, and what would you postpone?'),
  ('practice', 'The project doubles in size. What would you change so this still works?'),
  ('practice', 'A reviewer disagrees with how this is done. How would you justify it, or what would you change?'),
  ('practice', 'You find a case this doesn''t cover. How would you extend it?'),
  ('practice', 'The same approach must now apply to another part of the codebase. How would you roll it out?');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
create type public.code_check_status as enum (
  'preparing',   -- the worker is picking the code
  'ready',       -- waiting for the student to start (7 days)
  'in_progress', -- 10 minutes from when the code is first shown
  'submitted',   -- waiting for a grader
  'passed', 'failed',
  'unavailable', -- no usable code, or GitHub wouldn't show it: never counts as an attempt
  'expired'      -- never started within 7 days: doesn't count either
);

create table public.code_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id text not null references public.skills (id),
  status public.code_check_status not null default 'preparing',
  prompt_id uuid references public.code_check_prompts (id) on delete set null,
  -- Where the snippet is. The code itself is never stored.
  repo_id bigint,
  sha text check (sha is null or sha ~ '^[0-9a-f]{40}$'),
  path text check (path is null or char_length(path) <= 500),
  start_line integer check (start_line is null or start_line >= 1),
  end_line integer,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  rubric jsonb check (rubric is null or jsonb_typeof(rubric) = 'object'),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  unavailable_reason text check (unavailable_reason is null or char_length(unavailable_reason) <= 200),
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  started_at timestamptz,
  deadline_at timestamptz,
  snippet_served_at timestamptz,
  submitted_at timestamptz,
  graded_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  grader_id uuid references auth.users (id) on delete set null,
  check (end_line is null or end_line >= start_line),
  -- The 10 minutes start when the code is first shown, not when "Start" is pressed.
  check (deadline_at is null or (started_at is not null and snippet_served_at is not null))
);
comment on table public.code_checks is
  'Code checks (PRD 5.5): where the snippet is, the answers and the grade. Never the code.';
create index code_checks_user_skill_idx on public.code_checks (user_id, skill_id, requested_at desc);
create unique index code_checks_one_open_idx on public.code_checks (user_id, skill_id)
  where status in ('preparing', 'ready', 'in_progress', 'submitted');
create index code_checks_submitted_idx on public.code_checks (submitted_at) where status = 'submitted';
create index code_checks_prompt_idx on public.code_checks (prompt_id);
create index code_checks_skill_idx on public.code_checks (skill_id);
create index code_checks_claimed_by_idx on public.code_checks (claimed_by) where claimed_by is not null;
create index code_checks_grader_idx on public.code_checks (grader_id) where grader_id is not null;

-- The student reads their own checks, never who graded them; everything else goes through
-- the functions below.
alter table public.code_checks enable row level security;
revoke all on table public.code_checks from anon, authenticated;
grant select (id, user_id, skill_id, status, requested_at, ready_at, started_at, deadline_at, submitted_at, graded_at,
              unavailable_reason) on table public.code_checks to authenticated;
create policy code_checks_read_own on public.code_checks for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.notification_types (type, category, emailed) values
  ('code_check_ready', 'trust', true),
  ('code_check_graded', 'trust', true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.code_check_limit(p_name text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (private.config('code_check.limits') ->> p_name)::integer;
$$;
revoke all on function private.code_check_limit(text) from public;

-- L2 from the student's own commits (the thresholds of recompute_user_skills), whatever the
-- shown level is: a code check needs code the student wrote.
create function private.has_authored_level(p_user uuid, p_skill text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_skills u
      join public.skills s on s.id = u.skill_id
     where u.user_id = p_user and u.skill_id = p_skill and u.active_days >= 3
       and ((s.category = 'language' and u.lines >= 150) or (s.category <> 'language' and u.hits >= 3))
  );
$$;
revoke all on function private.has_authored_level(uuid, text) from public;

-- Why a check can't be requested now (null when it can).
create function private.code_check_blocker(p_user uuid, p_skill text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.github_accounts a where a.user_id = p_user and a.revoked_at is null)
      then 'connect GitHub first'
    when not private.has_authored_level(p_user, p_skill)
      then 'a code check needs the skill at L2 from your own commits'
    when exists (select 1 from public.code_checks c where c.user_id = p_user and c.skill_id = p_skill and c.status = 'passed')
      then 'you already passed a code check for this skill'
    when exists (select 1 from public.code_checks c where c.user_id = p_user and c.skill_id = p_skill
                  and c.status in ('preparing', 'ready', 'in_progress', 'submitted'))
      then 'you already have a code check open for this skill'
    when exists (select 1 from public.code_checks c where c.user_id = p_user and c.skill_id = p_skill
                  and c.snippet_served_at > now() - make_interval(days => private.code_check_limit('retry_days')))
      then 'one attempt per skill every 30 days'
  end;
$$;
revoke all on function private.code_check_blocker(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Student side
-- ---------------------------------------------------------------------------
create function private.request_code_check(p_skill text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_block text;
  v_prompt uuid;
  v_id uuid;
begin
  if not exists (select 1 from public.skills where id = p_skill and retired_at is null) then
    raise exception 'skill not found' using errcode = 'P0002';
  end if;
  v_block := private.code_check_blocker(v_me, p_skill);
  if v_block is not null then
    raise exception '%', v_block using errcode = '55000';
  end if;
  if not private.rate_limit('code_check:' || v_me::text, 5, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  -- A skill's own change request if there is one, else its category's.
  select p.id into v_prompt
    from public.code_check_prompts p
    join public.skills s on s.id = p_skill
   where p.active and (p.skill_id = p_skill or (p.skill_id is null and p.category = s.category))
   order by (p.skill_id is not null) desc, random()
   limit 1;
  insert into public.code_checks (user_id, skill_id, prompt_id) values (v_me, p_skill, v_prompt) returning id into v_id;
  perform private.enqueue_github(jsonb_build_object('stage', 'code_check', 'check_id', v_id));
  return v_id;
end;
$$;

-- Starting asks for the code; the 10 minutes and the 30-day clock begin when it is first
-- shown (code_check_served), so a GitHub hiccup never eats the student's time.
create function private.start_code_check(p_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  c public.code_checks;
begin
  select * into c from public.code_checks where id = p_id and user_id = v_me for update;
  if not found then
    raise exception 'code check not found' using errcode = 'P0002';
  end if;
  if c.status = 'in_progress' then
    return c.deadline_at;
  end if;
  if c.status <> 'ready' then
    raise exception 'this code check isn''t ready to start' using errcode = '55000';
  end if;
  update public.code_checks set status = 'in_progress', started_at = now() where id = p_id;
  return null;
end;
$$;

-- p_answers: {"what": text, "why": text, "change": text}; saved as the student types, and
-- submitted when they finish. Nothing is accepted after the deadline (plus 30 s of grace).
create function private.save_code_check(p_id uuid, p_answers jsonb, p_submit boolean)
returns public.code_check_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  c public.code_checks;
  v_max integer := private.code_check_limit('answer_max');
  v_answers jsonb;
begin
  select * into c from public.code_checks where id = p_id and user_id = v_me for update;
  if not found then
    raise exception 'code check not found' using errcode = 'P0002';
  end if;
  if c.status <> 'in_progress' or c.snippet_served_at is null then
    raise exception 'this code check isn''t open for answers' using errcode = '55000';
  end if;
  if c.deadline_at is null or now() > c.deadline_at + make_interval(secs => private.code_check_limit('grace_seconds')) then
    raise exception 'time is up' using errcode = '55000';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_answers) k where k not in ('what', 'why', 'change'))
     or exists (select 1 from jsonb_each(p_answers) e where jsonb_typeof(e.value) <> 'string') then
    raise exception 'answer the three questions' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each_text(p_answers) e where char_length(e.value) > v_max) then
    raise exception 'keep each answer under % characters', v_max using errcode = '23514';
  end if;
  v_answers := (select coalesce(jsonb_object_agg(e.key, left(e.value, v_max)), '{}'::jsonb) from jsonb_each_text(p_answers) e);
  update public.code_checks
     set answers = v_answers,
         status = case when p_submit then 'submitted'::public.code_check_status else status end,
         submitted_at = case when p_submit then now() else submitted_at end
   where id = p_id;
  return case when p_submit then 'submitted'::public.code_check_status else c.status end;
end;
$$;

-- One check as its student sees it: the change request only once the code has been shown,
-- the rubric and feedback once graded, never the grader.
create function private.my_code_check(p_id uuid)
returns table (
  id uuid, skill_id text, skill_name text, category public.skill_category, status public.code_check_status, prompt text,
  path text, start_line integer, end_line integer, answers jsonb, rubric jsonb, feedback text,
  requested_at timestamptz, started_at timestamptz, deadline_at timestamptz, snippet_served boolean,
  submitted_at timestamptz, graded_at timestamptz, unavailable_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.skill_id, s.name, s.category, c.status,
         case when c.snippet_served_at is not null then p.prompt end,
         case when c.status <> 'preparing' then c.path end, c.start_line, c.end_line, c.answers,
         case when c.status in ('passed', 'failed') then c.rubric end,
         case when c.status in ('passed', 'failed') then c.feedback end,
         c.requested_at, c.started_at, c.deadline_at, c.snippet_served_at is not null,
         c.submitted_at, c.graded_at, c.unavailable_reason
    from public.code_checks c
    join public.skills s on s.id = c.skill_id
    left join public.code_check_prompts p on p.id = c.prompt_id
   where c.id = p_id and c.user_id = (select auth.uid());
$$;

-- For the skill drawer: the latest check on a skill and, when none is open, why one can't be
-- requested (null when it can).
create function private.code_check_state(p_skill text)
returns table (check_id uuid, status public.code_check_status, blocker text)
language sql
stable
security definer
set search_path = ''
as $$
  select (select c.id from public.code_checks c where c.user_id = (select auth.uid()) and c.skill_id = p_skill
           order by c.requested_at desc limit 1),
         (select c.status from public.code_checks c where c.user_id = (select auth.uid()) and c.skill_id = p_skill
           order by c.requested_at desc limit 1),
         private.code_check_blocker((select auth.uid()), p_skill);
$$;

-- ---------------------------------------------------------------------------
-- Worker and Edge Function side (called as the service, never over the API)
-- ---------------------------------------------------------------------------
-- Commits the snippet may come from: the student's counted commits, in repositories they
-- still share, whose evidence shows the skill with code lines or an import.
create function private.code_check_candidates(p_check uuid)
returns table (repo_id bigint, sha text, installation_id bigint, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select e.repo_id, e.sha, ur.installation_id, e.paths
    from public.code_checks c
    join public.skill_evidence e on e.user_id = c.user_id and e.skill_id = c.skill_id
    join public.github_commits g on g.user_id = e.user_id and g.repo_id = e.repo_id and g.sha = e.sha and g.status = 'counted'
    join public.github_user_repos ur on ur.user_id = e.user_id and ur.repo_id = e.repo_id and not ur.excluded
   where c.id = p_check and c.status = 'preparing'
     and (e.lines >= private.code_check_limit('min_lines') or e.detectors && array['import'])
   order by random()
   limit 10;
$$;
revoke all on function private.code_check_candidates(uuid) from public;

create function private.code_check_prepared(p_check uuid, p_repo bigint, p_sha text, p_path text, p_start integer, p_end integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.code_checks;
begin
  update public.code_checks
     set status = 'ready', ready_at = now(), repo_id = p_repo, sha = p_sha, path = p_path, start_line = p_start, end_line = p_end
   where id = p_check and status = 'preparing'
  returning * into c;
  if not found then
    return false;
  end if;
  perform private.notify(c.user_id, null, 'code_check_ready', 'code_check', c.id,
                         jsonb_build_object('skill', (select name from public.skills where id = c.skill_id)));
  return true;
end;
$$;
revoke all on function private.code_check_prepared(uuid, bigint, text, text, integer, integer) from public;

-- No usable code, or GitHub won't show it before the student has seen it: not an attempt.
create function private.code_check_unavailable(p_check uuid, p_reason text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  update public.code_checks
     set status = 'unavailable', unavailable_reason = left(p_reason, 200)
   where id = p_check and (status = 'preparing' or (status in ('ready', 'in_progress') and snippet_served_at is null))
  returning true;
$$;
revoke all on function private.code_check_unavailable(uuid, text) from public;

-- Who may see a check's code right now: its student during the attempt, or the trust reviewer
-- who claimed it (two-factor). Returns where the code is, or nothing.
create function private.code_check_snippet_access(p_check uuid, p_user uuid, p_aal text)
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
       or (c.status = 'submitted' and c.claimed_by = p_user and p_aal = 'aal2' and c.user_id <> p_user
           and exists (select 1 from public.staff_roles r where r.user_id = p_user and r.role in ('trust_reviewer', 'super_admin')))
     );
$$;
revoke all on function private.code_check_snippet_access(uuid, uuid, text) from public;

-- The first time the student sees the code, their 10 minutes start.
create function private.code_check_served(p_check uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.code_checks
     set snippet_served_at = now(),
         deadline_at = now() + make_interval(mins => private.code_check_limit('minutes'))
   where id = p_check and status = 'in_progress' and snippet_served_at is null;
$$;
revoke all on function private.code_check_served(uuid) from public;

-- Every 5 minutes: time-outs submit what was saved (or fail when nothing was); checks never
-- started within 7 days expire; checks stuck preparing for a day are unavailable.
create function private.code_checks_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_n integer := 0;
  v_grace interval := make_interval(secs => private.code_check_limit('grace_seconds'));
  c record;
begin
  v_run := public.job_run_start('code-checks-tick');
  begin
    for c in
      update public.code_checks
         set status = case when exists (select 1 from jsonb_each_text(answers) e where btrim(e.value) <> '')
                           then 'submitted' else 'failed' end::public.code_check_status,
             submitted_at = now(),
             graded_at = case when exists (select 1 from jsonb_each_text(answers) e where btrim(e.value) <> '') then null else now() end,
             feedback = case when exists (select 1 from jsonb_each_text(answers) e where btrim(e.value) <> '') then null
                             else 'No answers were given in time.' end
       where status = 'in_progress' and deadline_at is not null and now() > deadline_at + v_grace
      returning id, user_id, status, skill_id
    loop
      if c.status = 'failed' then
        perform private.notify(c.user_id, null, 'code_check_graded', 'code_check', c.id,
                               jsonb_build_object('skill', (select name from public.skills where id = c.skill_id), 'passed', false));
      end if;
      v_n := v_n + 1;
    end loop;
    update public.code_checks set status = 'expired'
     where status = 'ready' and ready_at < now() - make_interval(days => private.code_check_limit('ready_days'));
    update public.code_checks set status = 'unavailable', unavailable_reason = 'we couldn''t prepare it in time'
     where status = 'preparing' and requested_at < now() - interval '1 day';
    -- Started but the code could never be shown: not an attempt.
    update public.code_checks set status = 'unavailable', unavailable_reason = 'your code couldn''t be shown'
     where status = 'in_progress' and snippet_served_at is null and started_at < now() - interval '1 day';
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
end;
$$;
revoke all on function private.code_checks_tick() from public;
select cron.schedule('code-checks-tick', '*/5 * * * *', $$select private.code_checks_tick()$$);

-- ---------------------------------------------------------------------------
-- Grading in /ops (trust reviewers until teachers exist)
-- ---------------------------------------------------------------------------
-- A grader who knows the student (friend or venture teammate) can't grade them.
create function private.code_check_conflict(p_grader uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_grader = p_student
      or private.are_friends(p_grader, p_student)
      or exists (select 1 from public.venture_members a join public.venture_members b on b.venture_id = a.venture_id
                  where a.user_id = p_grader and b.user_id = p_student);
$$;
revoke all on function private.code_check_conflict(uuid, uuid) from public;

create function private.code_check_queue(p_status text default 'submitted')
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
   where (p_status = 'submitted' and c.status = 'submitted')
      or (p_status = 'graded' and c.status in ('passed', 'failed') and c.grader_id is not null and c.graded_at > now() - interval '30 days')
   order by case when p_status = 'submitted' then c.submitted_at end asc, c.graded_at desc
   limit 200;
end;
$$;

create function private.code_check_case(p_id uuid)
returns table (id uuid, student_name text, skill_name text, category public.skill_category, status public.code_check_status,
               prompt text, path text, start_line integer, end_line integer, answers jsonb, rubric jsonb, feedback text,
               claimed_by_name text, claimed_by_me boolean, conflict boolean, submitted_at timestamptz, overdue boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
begin
  return query
  select c.id, p.full_name, s.name, s.category, c.status, pr.prompt, c.path, c.start_line, c.end_line, c.answers, c.rubric,
         c.feedback, cp.full_name, c.claimed_by = v_me, private.code_check_conflict(v_me, c.user_id), c.submitted_at,
         c.status = 'submitted' and c.submitted_at < now() - make_interval(hours => private.code_check_limit('due_hours'))
    from public.code_checks c
    join public.profiles p on p.user_id = c.user_id
    join public.skills s on s.id = c.skill_id
    left join public.code_check_prompts pr on pr.id = c.prompt_id
    left join public.profiles cp on cp.user_id = c.claimed_by
   where c.id = p_id and c.status in ('submitted', 'passed', 'failed');
end;
$$;

create function private.claim_code_check(p_id uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  c public.code_checks;
begin
  select * into c from public.code_checks where id = p_id for update;
  if c.id is null or c.status <> 'submitted' then
    raise exception 'this code check isn''t waiting for a grade' using errcode = '55000';
  end if;
  if private.code_check_conflict(v_me, c.user_id) then
    raise exception 'you know this student (friend or teammate), so someone else grades it' using errcode = '42501';
  end if;
  if p_claim then
    if c.claimed_by is not null and c.claimed_by <> v_me then
      raise exception 'someone else is grading this code check' using errcode = '55000';
    end if;
    update public.code_checks set claimed_by = v_me, claimed_at = now() where id = p_id;
  else
    if c.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this code check' using errcode = '55000';
    end if;
    update public.code_checks set claimed_by = null, claimed_at = null where id = p_id;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'code_check.claim' else 'code_check.release' end, 'code_check', p_id::text,
          case when p_claim then 'claimed to grade' else 'released' end,
          jsonb_build_object('claimed_by', c.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;

-- p_rubric: {"behaviour": {"pass": bool, "comment": text}, "design": ..., "change": ..., "accuracy": ...}
-- (PRD 5.21: explains behaviour, justifies design, handles the change, accuracy); 3 of 4 passes.
create function private.grade_code_check(p_id uuid, p_rubric jsonb, p_feedback text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
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
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when v_pass then 'code_check.pass' else 'code_check.fail' end, 'code_check', p_id::text,
          left(btrim(p_feedback), 2000), jsonb_build_object('status', c.status),
          jsonb_build_object('status', case when v_pass then 'passed' else 'failed' end, 'parts_passed', v_passed));
  perform private.notify(c.user_id, null, 'code_check_graded', 'code_check', c.id,
                         jsonb_build_object('skill', (select name from public.skills where id = c.skill_id), 'passed', v_pass));
  if v_pass then
    perform private.recompute_user_skills(c.user_id);
  end if;
  return v_pass;
end;
$$;

-- ---------------------------------------------------------------------------
-- A passed check is L4 (with the endorsement path from slice 2)
-- ---------------------------------------------------------------------------
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
  union
  select c.skill_id from public.code_checks c where c.user_id = p_user and c.status = 'passed';
$$;

create or replace function private.my_skill_proofs(p_skill text)
returns table (
  kind text, level smallint, title text, detail text, url text, venture_id uuid, occurred_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'pull_request', 3::smallint, p.repo_full_name || ' #' || p.number,
         case when p.counted then 'Merged or approved by someone else'
              when p.exclusion = 'own_repo' then 'Your own repository: doesn''t count'
              when p.exclusion = 'young_account' then 'Approved by an account under 90 days old: doesn''t count'
              else 'Not merged or approved by another person: doesn''t count' end,
         'https://github.com/' || p.repo_full_name || '/pull/' || p.number, null::uuid, p.merged_at
    from public.github_pr_skills s
    join public.github_pull_requests p
      on p.user_id = s.user_id and p.repo_github_id = s.repo_github_id and p.number = s.number
   where s.user_id = (select auth.uid()) and s.skill_id = p_skill
  union all
  select 'contribution', 3::smallint, v.title, e.description, null, v.id, o.created_at
    from public.contributions o
    join public.ventures v on v.id = o.venture_id
    cross join lateral (
      select c.id, c.description, c.skill_ids from public.contributions c
       where c.id = o.id or c.corrects_id = o.id
       order by c.created_at desc, (c.id = o.id)
       limit 1
    ) e
   where o.user_id = (select auth.uid()) and o.corrects_id is null and o.source = 'manual'
     and p_skill = any (e.skill_ids)
     and exists (select 1 from public.contribution_confirmations k
                  where k.contribution_id = e.id and k.confirmer_id <> o.user_id)
  union all
  select 'endorsement', 4::smallint, pr.full_name, v.title, null, v.id, e.created_at
    from public.endorsements e
    join public.profiles pr on pr.user_id = e.endorser_id
    join public.ventures v on v.id = e.venture_id
   where e.endorsee_id = (select auth.uid()) and e.skill_id = p_skill and not e.hidden
     and e.evidence_id is not null and private.entry_shows_skill(e.evidence_id, e.skill_id)
  union all
  select 'code_check', 4::smallint, 'Code check passed', null, null, null, c.graded_at
    from public.code_checks c
   where c.user_id = (select auth.uid()) and c.skill_id = p_skill and c.status = 'passed'
   order by 7 desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants and public wrappers (security invoker)
-- ---------------------------------------------------------------------------
revoke all on function
  private.request_code_check(text),
  private.code_check_state(text),
  private.start_code_check(uuid),
  private.save_code_check(uuid, jsonb, boolean),
  private.my_code_check(uuid),
  private.code_check_queue(text),
  private.code_check_case(uuid),
  private.claim_code_check(uuid, boolean),
  private.grade_code_check(uuid, jsonb, text)
  from public;
grant execute on function
  private.request_code_check(text),
  private.code_check_state(text),
  private.start_code_check(uuid),
  private.save_code_check(uuid, jsonb, boolean),
  private.my_code_check(uuid),
  private.code_check_queue(text),
  private.code_check_case(uuid),
  private.claim_code_check(uuid, boolean),
  private.grade_code_check(uuid, jsonb, text)
  to authenticated;

create function public.request_code_check(p_skill text) returns uuid
language sql volatile security invoker set search_path = '' as $$ select private.request_code_check(p_skill) $$;
create function public.code_check_state(p_skill text)
returns table (check_id uuid, status public.code_check_status, blocker text)
language sql stable security invoker set search_path = '' as $$ select * from private.code_check_state(p_skill) $$;
create function public.start_code_check(p_id uuid) returns timestamptz
language sql volatile security invoker set search_path = '' as $$ select private.start_code_check(p_id) $$;
create function public.save_code_check(p_id uuid, p_answers jsonb, p_submit boolean default false) returns public.code_check_status
language sql volatile security invoker set search_path = '' as $$ select private.save_code_check(p_id, p_answers, p_submit) $$;
create function public.my_code_check(p_id uuid)
returns table (
  id uuid, skill_id text, skill_name text, category public.skill_category, status public.code_check_status, prompt text,
  path text, start_line integer, end_line integer, answers jsonb, rubric jsonb, feedback text,
  requested_at timestamptz, started_at timestamptz, deadline_at timestamptz, snippet_served boolean,
  submitted_at timestamptz, graded_at timestamptz, unavailable_reason text
)
language sql stable security invoker set search_path = '' as $$ select * from private.my_code_check(p_id) $$;
create function public.code_check_queue(p_status text default 'submitted')
returns table (id uuid, student_name text, skill_name text, status public.code_check_status, claimed_by_name text,
               claimed_by_me boolean, conflict boolean, submitted_at timestamptz, overdue boolean, graded_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.code_check_queue(p_status) $$;
create function public.code_check_case(p_id uuid)
returns table (id uuid, student_name text, skill_name text, category public.skill_category, status public.code_check_status,
               prompt text, path text, start_line integer, end_line integer, answers jsonb, rubric jsonb, feedback text,
               claimed_by_name text, claimed_by_me boolean, conflict boolean, submitted_at timestamptz, overdue boolean)
language sql stable security invoker set search_path = '' as $$ select * from private.code_check_case(p_id) $$;
create function public.claim_code_check(p_id uuid, p_claim boolean) returns void
language sql volatile security invoker set search_path = '' as $$ select private.claim_code_check(p_id, p_claim) $$;
create function public.grade_code_check(p_id uuid, p_rubric jsonb, p_feedback text) returns boolean
language sql volatile security invoker set search_path = '' as $$ select private.grade_code_check(p_id, p_rubric, p_feedback) $$;

revoke all on function
  public.request_code_check(text),
  public.code_check_state(text),
  public.start_code_check(uuid),
  public.save_code_check(uuid, jsonb, boolean),
  public.my_code_check(uuid),
  public.code_check_queue(text),
  public.code_check_case(uuid),
  public.claim_code_check(uuid, boolean),
  public.grade_code_check(uuid, jsonb, text)
  from public, anon;
grant execute on function
  public.request_code_check(text),
  public.code_check_state(text),
  public.start_code_check(uuid),
  public.save_code_check(uuid, jsonb, boolean),
  public.my_code_check(uuid),
  public.code_check_queue(text),
  public.code_check_case(uuid),
  public.claim_code_check(uuid, boolean),
  public.grade_code_check(uuid, jsonb, text)
  to authenticated;
