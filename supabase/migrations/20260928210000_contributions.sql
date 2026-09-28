-- Phase 2 slice 6: the contribution log (PRD 5.14) and the last completion rule (PRD 5.15:
-- peer-verified contributions from at least 2 members).
--
-- Insert-only by design: the tables grant reads only and have no update or delete policy;
-- every row comes from a security-definer function below. A correction is a new row that
-- points at the original (the author's, within 24 h of it); the newest correction is what
-- the timeline shows, and it needs its own confirmation (docs/decisions.md 2026-09-28).
-- GitHub-sourced rows come from counted commits in the venture's linked repository.

create type public.contribution_kind as enum ('code', 'design', 'research', 'docs', 'management', 'other');
create type public.contribution_source as enum ('manual', 'github');

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.contribution_kind not null,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  evidence_url text check (evidence_url is null or (evidence_url ~ '^https?://[^\s]+$' and char_length(evidence_url) <= 500)),
  hours numeric(5, 2) check (hours is null or (hours > 0 and hours <= 100)),
  corrects_id uuid references public.contributions (id) on delete cascade,
  source public.contribution_source not null default 'manual',
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  created_at timestamptz not null default now(),
  check ((source = 'github') = (commit_sha is not null)),
  check (source = 'manual' or corrects_id is null)
);
comment on table public.contributions is
  'Venture contribution log (PRD 5.14). Insert-only: corrections are new rows (corrects_id); nothing is edited or deleted.';
create index contributions_venture_created_idx on public.contributions (venture_id, created_at desc);
create index contributions_user_idx on public.contributions (user_id, venture_id);
create index contributions_corrects_idx on public.contributions (corrects_id) where corrects_id is not null;
-- One GitHub row per commit per venture.
create unique index contributions_commit_uniq on public.contributions (venture_id, user_id, commit_sha)
  where commit_sha is not null;

create table public.contribution_confirmations (
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  confirmer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contribution_id, confirmer_id)
);
comment on table public.contribution_confirmations is 'A teammate''s confirmation makes an entry peer-verified (PRD 5.14).';
create index contribution_confirmations_confirmer_idx on public.contribution_confirmations (confirmer_id);

alter table public.contributions enable row level security;
alter table public.contribution_confirmations enable row level security;
revoke all on table public.contributions, public.contribution_confirmations from anon, authenticated;
grant select on table public.contributions, public.contribution_confirmations to authenticated;

-- The log is part of the venture's public face (the Contributions tab), like its team.
create policy contributions_read on public.contributions for select to authenticated
  using (private.can_view_venture(venture_id));
create policy contribution_confirmations_read on public.contribution_confirmations for select to authenticated
  using (exists (
    select 1 from public.contributions c
     where c.id = contribution_confirmations.contribution_id and private.can_view_venture(c.venture_id)
  ));

-- ---------------------------------------------------------------------------
-- The timeline: one row per original entry, showing its newest correction.
-- Peer-verified = GitHub-sourced, or the shown version has a teammate's confirmation.
-- ---------------------------------------------------------------------------
create view public.contributions_with_status
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
       (o.source = 'github'
         or exists (select 1 from public.contribution_confirmations k where k.contribution_id = e.id)) as peer_verified,
       exists (select 1 from public.contribution_confirmations k
                where k.contribution_id = e.id and k.confirmer_id = (select auth.uid())) as confirmed_by_me,
       exists (select 1 from public.venture_members m where m.venture_id = o.venture_id and m.user_id = o.user_id)
         as by_member
  from public.contributions o
  cross join lateral (
    select c.* from public.contributions c
     where c.id = o.id or c.corrects_id = o.id
     order by c.created_at desc, (c.id = o.id)
     limit 1
  ) e
 where o.corrects_id is null;
comment on view public.contributions_with_status is
  'Contribution timeline (PRD 5.14): originals with their newest correction and peer-verified status. Caller''s RLS applies.';
grant select on public.contributions_with_status to authenticated;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
-- Checks shared by logging and correcting: a current member of an open venture.
create function private.require_contributor(p_venture uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v public.ventures;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or not private.is_venture_member(p_venture) then
    raise exception 'members only' using errcode = '42501';
  end if;
  if v.status not in ('recruiting', 'in_progress') then
    raise exception 'this venture is %, so its log is locked', v.status using errcode = '55000';
  end if;
  return v_user;
end;
$$;

create function private.log_contribution(p_venture uuid, p_kind public.contribution_kind, p_description text,
                                         p_evidence_url text, p_hours numeric)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_contributor(p_venture);
  v_id uuid;
begin
  if not private.rate_limit('contribution:' || v_user::text, 20, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, hours)
  values (p_venture, v_user, p_kind, btrim(p_description), nullif(btrim(coalesce(p_evidence_url, '')), ''), p_hours)
  returning id into v_id;
  -- Reputation decay (phase 5) reads the newest contribution as activity.
  return v_id;
end;
$$;

-- A correction replaces what the timeline shows; the original stays as the record.
create function private.correct_contribution(p_original uuid, p_kind public.contribution_kind, p_description text,
                                             p_evidence_url text, p_hours numeric)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  o public.contributions;
  v_id uuid;
begin
  select * into o from public.contributions where id = p_original;
  if not found or not private.can_view_venture(o.venture_id) then
    raise exception 'contribution not found' using errcode = 'P0002';
  end if;
  if o.corrects_id is not null then
    raise exception 'correct the original entry' using errcode = '22023';
  end if;
  if o.user_id <> v_user or o.source <> 'manual' then
    raise exception 'only its author can correct an entry' using errcode = '42501';
  end if;
  perform private.require_contributor(o.venture_id);
  if o.created_at < now() - interval '24 hours' then
    raise exception 'entries can be corrected for 24 hours' using errcode = '55000';
  end if;
  if not private.rate_limit('contribution:' || v_user::text, 20, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, hours, corrects_id)
  values (o.venture_id, v_user, p_kind, btrim(p_description), nullif(btrim(coalesce(p_evidence_url, '')), ''), p_hours, o.id)
  returning id into v_id;
  return v_id;
end;
$$;

-- A teammate confirms the version the timeline shows (p_entry is the original's id).
create function private.confirm_contribution(p_entry uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  o public.contributions;
  v_current uuid;
begin
  select * into o from public.contributions where id = p_entry;
  if not found or not private.can_view_venture(o.venture_id) then
    raise exception 'contribution not found' using errcode = 'P0002';
  end if;
  if o.corrects_id is not null then
    raise exception 'confirm the entry, not a correction' using errcode = '22023';
  end if;
  if o.source <> 'manual' then
    raise exception 'GitHub entries are already verified' using errcode = '22023';
  end if;
  if o.user_id = v_user then
    raise exception 'you can''t confirm your own entry' using errcode = '42501';
  end if;
  perform private.require_contributor(o.venture_id);
  select c.id into v_current from public.contributions c
   where c.id = o.id or c.corrects_id = o.id
   order by c.created_at desc, (c.id = o.id)
   limit 1;
  insert into public.contribution_confirmations (contribution_id, confirmer_id)
  values (v_current, v_user)
  on conflict do nothing;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- GitHub-sourced entries: counted commits by a member, in the linked repository, made
-- since the venture started. Idempotent; runs on link, on join, and as commits count.
-- ---------------------------------------------------------------------------
create function private.sync_venture_commits(p_venture uuid, p_user uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures;
  v_count integer;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or v.repo_id is null or v.status not in ('recruiting', 'in_progress') then
    return 0;
  end if;
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, source, commit_sha, created_at)
  select v.id, c.user_id, 'code',
         format('Commit %s to %s (%s meaningful %s)', left(c.sha, 7), v.repo_full_name, c.meaningful_lines,
                case when c.meaningful_lines = 1 then 'line' else 'lines' end),
         format('https://github.com/%s/commit/%s', v.repo_full_name, c.sha),
         'github', c.sha, c.occurred_at
    from public.github_commits c
    join public.venture_members m on m.venture_id = v.id and m.user_id = c.user_id
   where c.repo_id = v.repo_id
     and c.status = 'counted'
     and c.occurred_at >= v.created_at
     and (p_user is null or c.user_id = p_user)
  on conflict (venture_id, user_id, commit_sha) where commit_sha is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.sync_venture_commits(uuid, uuid) from public;

create function private.github_commit_contributions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venture uuid;
begin
  if new.status = 'counted' and (tg_op = 'INSERT' or old.status is distinct from 'counted') then
    for v_venture in
      select v.id from public.ventures v
        join public.venture_members m on m.venture_id = v.id and m.user_id = new.user_id
       where v.repo_id = new.repo_id and v.status in ('recruiting', 'in_progress')
    loop
      perform private.sync_venture_commits(v_venture, new.user_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.github_commit_contributions() from public;
create trigger github_commit_contributions after insert or update of status on public.github_commits
  for each row execute function private.github_commit_contributions();

create function private.venture_member_commits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_venture_commits(new.venture_id, new.user_id);
  return null;
end;
$$;
revoke all on function private.venture_member_commits() from public;
create trigger venture_member_commits after insert on public.venture_members
  for each row execute function private.venture_member_commits();

create function private.venture_repo_commits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.repo_id is not null and new.repo_id is distinct from old.repo_id then
    perform private.sync_venture_commits(new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.venture_repo_commits() from public;
create trigger venture_repo_commits after update of repo_id on public.ventures
  for each row execute function private.venture_repo_commits();

-- ---------------------------------------------------------------------------
-- Completion (PRD 5.15): at least 2 current members with a peer-verified contribution.
-- Contributions by people who left or were removed stay on the log but don't count.
-- ---------------------------------------------------------------------------
create function private.verified_contributors(p_venture uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct o.user_id)::integer
    from public.contributions o
    join public.venture_members m on m.venture_id = o.venture_id and m.user_id = o.user_id
   where o.venture_id = p_venture
     and o.corrects_id is null
     and (
       o.source = 'github'
       or exists (
         select 1 from public.contribution_confirmations k
          where k.contribution_id = (
            select c.id from public.contributions c
             where c.id = o.id or c.corrects_id = o.id
             order by c.created_at desc, (c.id = o.id)
             limit 1)
       )
     );
$$;
revoke all on function private.verified_contributors(uuid) from public;

create or replace function private.transition_venture(p_venture uuid, p_to public.venture_status)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  if not (
    (v.status = 'recruiting' and p_to in ('in_progress', 'abandoned'))
    or (v.status = 'in_progress' and p_to in ('completed', 'abandoned'))
  ) then
    raise exception 'a % venture can''t become %', v.status, p_to using errcode = '55000';
  end if;
  if p_to = 'completed' then
    if (select count(*) from public.venture_members where venture_id = p_venture) < 2 then
      raise exception 'a venture needs at least 2 members to complete' using errcode = '23514';
    end if;
    if not exists (select 1 from public.venture_deliverables where venture_id = p_venture) then
      raise exception 'add at least one deliverable link before completing' using errcode = '23514';
    end if;
    if private.verified_contributors(p_venture) < 2 then
      raise exception 'at least 2 members need a peer-verified contribution before completing' using errcode = '23514';
    end if;
  end if;
  update public.ventures
     set status = p_to,
         completed_at = case when p_to = 'completed' then now() else completed_at end,
         abandoned_at = case when p_to = 'abandoned' then now() else abandoned_at end
   where id = p_venture;
  if p_to in ('completed', 'abandoned') then
    update public.application_threads set status = 'closed', decided_at = now()
     where venture_id = p_venture and status = 'pending';
    update public.venture_invites set status = 'revoked', responded_at = now()
     where venture_id = p_venture and status = 'pending';
  end if;
  -- Completion also posts "Shipped" (phase 3) and prompts endorsements (phase 4).
end;
$$;

-- For the owner's Manage tab: how many current members are peer-verified.
create function private.venture_verified_contributors(p_venture uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.verified_contributors(p_venture) where private.can_view_venture(p_venture);
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (security invoker) and grants
-- ---------------------------------------------------------------------------
revoke all on function private.require_contributor(uuid) from public;
grant execute on function private.require_contributor(uuid) to authenticated;
revoke all on function
  private.log_contribution(uuid, public.contribution_kind, text, text, numeric),
  private.correct_contribution(uuid, public.contribution_kind, text, text, numeric),
  private.confirm_contribution(uuid),
  private.venture_verified_contributors(uuid)
  from public;
grant execute on function
  private.log_contribution(uuid, public.contribution_kind, text, text, numeric),
  private.correct_contribution(uuid, public.contribution_kind, text, text, numeric),
  private.confirm_contribution(uuid),
  private.venture_verified_contributors(uuid)
  to authenticated;

create function public.log_contribution(p_venture uuid, p_kind public.contribution_kind, p_description text,
                                        p_evidence_url text default null, p_hours numeric default null)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.log_contribution(p_venture, p_kind, p_description, p_evidence_url, p_hours) $$;

create function public.correct_contribution(p_original uuid, p_kind public.contribution_kind, p_description text,
                                            p_evidence_url text default null, p_hours numeric default null)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.correct_contribution(p_original, p_kind, p_description, p_evidence_url, p_hours) $$;

create function public.confirm_contribution(p_entry uuid)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.confirm_contribution(p_entry) $$;

create function public.venture_verified_contributors(p_venture uuid)
returns integer
language sql stable security invoker set search_path = ''
as $$ select private.venture_verified_contributors(p_venture) $$;

revoke all on function
  public.log_contribution(uuid, public.contribution_kind, text, text, numeric),
  public.correct_contribution(uuid, public.contribution_kind, text, text, numeric),
  public.confirm_contribution(uuid),
  public.venture_verified_contributors(uuid)
  from public, anon;
grant execute on function
  public.log_contribution(uuid, public.contribution_kind, text, text, numeric),
  public.correct_contribution(uuid, public.contribution_kind, text, text, numeric),
  public.confirm_contribution(uuid),
  public.venture_verified_contributors(uuid)
  to authenticated;
