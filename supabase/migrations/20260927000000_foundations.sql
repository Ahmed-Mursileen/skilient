-- Phase 0 foundations: health check and job run log.
-- Conventions (PRD 6, build: database workflow): uuid PKs, created_at, RLS default deny,
-- security definer functions with a fixed search_path.

-- ---------------------------------------------------------------------------
-- Health check (used by /api/health with the publishable key)
-- ---------------------------------------------------------------------------
create or replace function public.health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

comment on function public.health_check() is 'Trivial query for /api/health; touches no data.';

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- job_runs: one row per pg_cron job / Edge Function worker run (PRD 10, Monitoring)
-- ---------------------------------------------------------------------------
create type public.job_run_status as enum ('running', 'succeeded', 'failed');

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.job_run_status not null default 'running',
  rows integer check (rows is null or rows >= 0),
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_runs_finished_consistent check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

comment on table public.job_runs is 'Every scheduled job / worker run; read by job-watchdog and /ops. Written only via job_run_start/job_run_finish.';

create index job_runs_job_started_at_idx on public.job_runs (job, started_at desc);
create index job_runs_running_idx on public.job_runs (started_at) where status = 'running';

-- Default deny: RLS on, no policies. Staff read access arrives with staff_roles / is_staff() (phase 1).
alter table public.job_runs enable row level security;
revoke all on table public.job_runs from anon, authenticated;

-- security invoker: the only caller is service_role, which already bypasses RLS, so
-- definer rights would add risk (callable-by-PUBLIC endpoint in an exposed schema) for nothing.
create or replace function public.job_run_start(p_job text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.job_runs (job, meta)
  values (p_job, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.job_run_finish(
  p_id uuid,
  p_status public.job_run_status,
  p_rows integer default null,
  p_error text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status = 'running' then
    raise exception 'job_run_finish needs a final status' using errcode = '22023';
  end if;

  update public.job_runs
     set status = p_status,
         finished_at = now(),
         rows = p_rows,
         error = left(p_error, 4000)
   where id = p_id
     and status = 'running';

  if not found then
    raise exception 'job run % not found or already finished', p_id using errcode = 'P0002';
  end if;
end;
$$;

-- Callable only by jobs (service_role / postgres via pg_cron); never by users.
revoke all on function public.job_run_start(text, jsonb) from public, anon, authenticated;
revoke all on function public.job_run_finish(uuid, public.job_run_status, integer, text) from public, anon, authenticated;
grant execute on function public.job_run_start(text, jsonb) to service_role;
grant execute on function public.job_run_finish(uuid, public.job_run_status, integer, text) to service_role;
