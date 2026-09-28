-- Phase 2 slice 3: commit import, skill evidence, L1/L2 levels and anti-gaming holds
-- (PRD 5.5 "Import pipeline", "What counts as the student's work", "Evidence levels",
-- "Anti-gaming"). The github-worker lists the student's own commits (harvest), reads each
-- one's files and runs the taxonomy's detectors (extract), and the database turns the
-- evidence into levels (recompute_user_skills). No source code is stored: only SHAs,
-- paths, line counts and blob hashes.

-- ---------------------------------------------------------------------------
-- Sync accounting: a sync is done when every message it queued has been handled
-- ---------------------------------------------------------------------------
alter table public.sync_jobs add column pending integer not null default 0 check (pending >= 0);
comment on column public.sync_jobs.pending is 'Queued messages still to handle for this sync (internal; not granted).';
-- Open syncs from before this migration still have their discover or classify messages queued.
update public.sync_jobs set pending = greatest(repos_total - repos_done, 1) where status in ('queued', 'running');

create or replace function private.start_github_sync(p_user uuid, p_trigger text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job bigint;
begin
  select id into v_job from public.sync_jobs where user_id = p_user and status in ('queued', 'running');
  if v_job is not null then
    return v_job;
  end if;
  insert into public.sync_jobs (user_id, trigger, stage, pending) values (p_user, p_trigger, 'discover', 1)
  returning id into v_job;
  perform private.enqueue_github(jsonb_build_object('stage', 'discover', 'user_id', p_user, 'job_id', v_job));
  return v_job;
end;
$$;

-- One handled message of a sync: queues its follow-up messages, counts analysed commits,
-- and closes the sync when nothing is left. Returns true when the sync just finished.
create function private.github_job_advance(
  p_job bigint,
  p_messages jsonb default '[]'::jsonb,
  p_commits integer default 0,
  p_stage text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_msg jsonb;
  v_count integer := 0;
  v_row public.sync_jobs;
begin
  for v_msg in select * from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    perform private.enqueue_github(v_msg);
    v_count := v_count + 1;
  end loop;
  if p_job is null then
    return false;
  end if;
  update public.sync_jobs
     set pending = greatest(pending + v_count - 1, 0),
         commits_analysed = commits_analysed + greatest(p_commits, 0),
         stage = coalesce(p_stage, stage),
         status = case when status = 'queued' then 'running' else status end
   where id = p_job and status in ('queued', 'running')
  returning * into v_row;
  if not found or v_row.pending > 0 then
    return false;
  end if;
  update public.sync_jobs
     set status = 'done', stage = 'done', finished_at = now(), repos_done = repos_total
   where id = p_job;
  return true;
end;
$$;
revoke all on function private.github_job_advance(bigint, jsonb, integer, text) from public;

-- The login can change on GitHub; the numeric id never does, and must match.
create function private.refresh_github_login(p_user uuid, p_github_id bigint, p_login text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  update public.github_accounts set login = p_login
   where user_id = p_user and github_id = p_github_id and login is distinct from p_login
  returning true;
$$;
revoke all on function private.refresh_github_login(uuid, bigint, text) from public;

-- ---------------------------------------------------------------------------
-- Repository details used by the detectors
-- ---------------------------------------------------------------------------
alter table public.github_repos
  add column languages text[] not null default '{}' check (cardinality(languages) <= 100),
  add column linguist_excludes text[] not null default '{}' check (cardinality(linguist_excludes) <= 200);
comment on column public.github_repos.languages is 'GitHub language names (L1 "found in your repos").';
comment on column public.github_repos.linguist_excludes is 'Globs marked linguist-generated or linguist-vendored in .gitattributes.';
alter table public.github_user_repos add column harvested_at timestamptz;

-- Blob hashes of a fork's parent or a template's source: matching files are the original
-- project, not the student's work (PRD 5.5 "Copied fork/template").
create table private.github_upstream_blobs (
  repo_id bigint not null references public.github_repos (repo_id) on delete cascade,
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  primary key (repo_id, blob_sha)
);
alter table private.github_upstream_blobs enable row level security;

create function private.set_repo_details(p_repo bigint, p_languages text[], p_upstream_blobs text[] default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.github_repos set languages = coalesce(p_languages[1:100], '{}') where repo_id = p_repo;
  if p_upstream_blobs is not null then
    delete from private.github_upstream_blobs where repo_id = p_repo;
    insert into private.github_upstream_blobs (repo_id, blob_sha)
    select p_repo, b from unnest(p_upstream_blobs) b where b ~ '^[0-9a-f]{40}$'
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function private.set_repo_details(bigint, text[], text[]) from public;

-- ---------------------------------------------------------------------------
-- Commits
-- ---------------------------------------------------------------------------
create type public.github_commit_status as enum ('pending', 'counted', 'held', 'excluded');

-- One row per commit GitHub attributes to the student's account (author.id), per shared
-- repository. Gone with the repository link (disconnect, unshare).
create table public.github_commits (
  user_id uuid not null,
  repo_id bigint not null,
  sha text not null check (sha ~ '^[0-9a-f]{40}$'),
  authored_at timestamptz,
  -- Recency (PRD 5.5): the push time when a webhook told us, otherwise the commit time,
  -- never later than when we first saw it. The author date is never used.
  occurred_at timestamptz not null,
  seen_via text not null check (seen_via in ('harvest', 'push')),
  signed boolean not null default false,
  files integer not null default 0 check (files >= 0),
  meaningful_lines integer not null default 0 check (meaningful_lines between 0 and 400),
  status public.github_commit_status not null default 'pending',
  exclusion text check (exclusion is null or exclusion in (
    'merge', 'too_many_files', 'rename_only', 'formatting_only', 'bulk_import', 'rewritten', 'review'
  )),
  first_seen_at timestamptz not null default now(),
  extracted_at timestamptz,
  primary key (user_id, repo_id, sha),
  foreign key (user_id, repo_id) references public.github_user_repos (user_id, repo_id) on delete cascade
);
comment on table public.github_commits is 'The student''s own commits (PRD 5.5). SHAs and counts only; owner-only.';
create index github_commits_user_occurred_idx on public.github_commits (user_id, occurred_at);
create index github_commits_pending_idx on public.github_commits (user_id, repo_id) where extracted_at is null;

-- Blobs the student's commits added (files of 20+ meaningful lines), for the
-- cross-account duplicate check.
create table private.github_commit_blobs (
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  user_id uuid not null,
  repo_id bigint not null,
  sha text not null,
  primary key (blob_sha, user_id, repo_id, sha),
  foreign key (user_id, repo_id, sha) references public.github_commits (user_id, repo_id, sha) on delete cascade
);
create index github_commit_blobs_commit_idx on private.github_commit_blobs (user_id, repo_id, sha);
alter table private.github_commit_blobs enable row level security;

-- ---------------------------------------------------------------------------
-- Evidence and levels
-- ---------------------------------------------------------------------------
-- One row per (commit, skill). Later sources (PRs, ventures, endorsements, code checks)
-- arrive with phase 4; their rows will carry their own reference instead of a commit.
create table public.skill_evidence (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id text not null references public.skills (id),
  source text not null default 'commit' check (source in ('commit')),
  repo_id bigint not null,
  sha text not null,
  -- Which detectors fired: lines (languages), file, path, manifest, import.
  detectors text[] not null check (detectors <@ array['lines', 'file', 'path', 'manifest', 'import'] and cardinality(detectors) > 0),
  paths text[] not null default '{}' check (cardinality(paths) <= 10),
  lines integer not null default 0 check (lines between 0 and 400),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, repo_id, sha, skill_id),
  foreign key (user_id, repo_id, sha) references public.github_commits (user_id, repo_id, sha) on delete cascade
);
comment on table public.skill_evidence is 'What each skill level rests on (PRD 5.5). Owner-only; others see only the level.';
create index skill_evidence_user_skill_idx on public.skill_evidence (user_id, skill_id);
create index skill_evidence_skill_idx on public.skill_evidence (skill_id);

create table public.user_skills (
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id text not null references public.skills (id),
  level smallint not null check (level between 0 and 4),
  active_days integer not null default 0 check (active_days >= 0),
  lines integer not null default 0 check (lines >= 0),
  hits integer not null default 0 check (hits >= 0),
  repos integer not null default 0 check (repos >= 0),
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
comment on table public.user_skills is 'Skill levels L1-L4 (PRD 5.5), readable wherever the full profile is.';
create index user_skills_skill_level_idx on public.user_skills (skill_id, level);

-- ---------------------------------------------------------------------------
-- Review flags: hold evidence for a trust reviewer, never penalise (PRD 5.5)
-- ---------------------------------------------------------------------------
create type public.review_flag_kind as enum ('burst', 'backdating', 'cross_account_duplicate');
create type public.review_flag_status as enum ('open', 'cleared', 'upheld');

create table public.review_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.review_flag_kind not null,
  -- One flag per user and cause: a day (burst), a commit (backdating), another student (duplicate).
  key text not null check (char_length(key) between 1 and 100),
  refs jsonb not null default '{}'::jsonb check (jsonb_typeof(refs) = 'object'),
  status public.review_flag_status not null default 'open',
  reviewer_id uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, kind, key)
);
comment on table public.review_flags is 'Held evidence awaiting a trust reviewer (/ops). The student sees only that something is under review.';
create index review_flags_open_idx on public.review_flags (created_at) where status = 'open';

create table private.review_flag_commits (
  flag_id bigint not null references public.review_flags (id) on delete cascade,
  user_id uuid not null,
  repo_id bigint not null,
  sha text not null,
  primary key (flag_id, user_id, repo_id, sha),
  foreign key (user_id, repo_id, sha) references public.github_commits (user_id, repo_id, sha) on delete cascade
);
create index review_flag_commits_commit_idx on private.review_flag_commits (user_id, repo_id, sha);
alter table private.review_flag_commits enable row level security;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.github_commits enable row level security;
alter table public.skill_evidence enable row level security;
alter table public.user_skills enable row level security;
alter table public.review_flags enable row level security;
revoke all on table public.github_commits, public.skill_evidence, public.user_skills, public.review_flags
  from anon, authenticated;

grant select on table public.github_commits, public.skill_evidence to authenticated;
create policy github_commits_read_own on public.github_commits
  for select to authenticated using (user_id = (select auth.uid()));
create policy skill_evidence_read_own on public.skill_evidence
  for select to authenticated using (user_id = (select auth.uid()));

grant select on table public.user_skills to authenticated;
-- The owner, and anyone who can read the owner's full profile (the subquery runs under
-- the viewer's own profiles RLS).
create policy user_skills_read on public.user_skills
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.user_id = user_skills.user_id)
  );

-- The student sees that something is under review, not the kind or the details.
grant select (id, user_id, status, created_at, resolved_at) on table public.review_flags to authenticated;
create policy review_flags_read on public.review_flags
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff('trust_reviewer')));
-- Trust reviewers read the kind and refs through review_flag_details().

-- ---------------------------------------------------------------------------
-- Harvest: the student's commits on the default branch, newest 500 per repository
-- ---------------------------------------------------------------------------
-- p_commits: [{sha, authored_at, committed_at, parents, signed}] already filtered to
-- author.id = the student's GitHub id. p_complete: the listing wasn't cut at 500, so a
-- stored commit missing from it was removed by a history rewrite (PRD 5.5: its evidence
-- is dropped). Returns the SHAs still to extract.
create function private.harvest_commits(p_user uuid, p_repo bigint, p_commits jsonb, p_complete boolean)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_listed text[];
  v_pending text[];
begin
  if not exists (select 1 from public.github_user_repos where user_id = p_user and repo_id = p_repo) then
    return '{}';
  end if;
  select coalesce(array_agg(c ->> 'sha'), '{}') into v_listed from jsonb_array_elements(p_commits) c;

  insert into public.github_commits (user_id, repo_id, sha, authored_at, occurred_at, seen_via, signed,
                                     status, exclusion, extracted_at)
  select p_user, p_repo, c ->> 'sha', (c ->> 'authored_at')::timestamptz,
         least(coalesce((c ->> 'committed_at')::timestamptz, now()), now()), 'harvest',
         coalesce((c ->> 'signed')::boolean, false),
         case when coalesce((c ->> 'parents')::integer, 1) > 1 then 'excluded' else 'pending' end::public.github_commit_status,
         case when coalesce((c ->> 'parents')::integer, 1) > 1 then 'merge' end,
         case when coalesce((c ->> 'parents')::integer, 1) > 1 then now() end
    from jsonb_array_elements(p_commits) c
   where c ->> 'sha' ~ '^[0-9a-f]{40}$'
  on conflict (user_id, repo_id, sha) do nothing;

  if p_complete then
    delete from public.skill_evidence e
     using public.github_commits c
     where c.user_id = p_user and c.repo_id = p_repo and not (c.sha = any (v_listed)) and c.status <> 'excluded'
       and e.user_id = c.user_id and e.repo_id = c.repo_id and e.sha = c.sha;
    update public.github_commits
       set status = 'excluded', exclusion = 'rewritten', extracted_at = coalesce(extracted_at, now())
     where user_id = p_user and repo_id = p_repo and not (sha = any (v_listed)) and status <> 'excluded';
  end if;

  update public.github_user_repos set harvested_at = now(), last_synced_at = now()
   where user_id = p_user and repo_id = p_repo;

  select coalesce(array_agg(sha order by occurred_at), '{}') into v_pending
    from public.github_commits
   where user_id = p_user and repo_id = p_repo and extracted_at is null;
  return v_pending;
end;
$$;
revoke all on function private.harvest_commits(uuid, bigint, jsonb, boolean) from public;

create function private.set_repo_linguist_excludes(p_repo bigint, p_globs text[])
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.github_repos set linguist_excludes = coalesce(p_globs[1:200], '{}') where repo_id = p_repo;
$$;
revoke all on function private.set_repo_linguist_excludes(bigint, text[]) from public;

-- ---------------------------------------------------------------------------
-- Extract: one analysed commit -> commit row, evidence, blobs and flags
-- ---------------------------------------------------------------------------
-- Opens (or reuses) a flag and links commits to it; linked commits that were counted are held.
create function private.open_review_flag(
  p_user uuid,
  p_kind public.review_flag_kind,
  p_key text,
  p_refs jsonb,
  p_commits jsonb -- [{repo_id, sha}]
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_flag bigint;
  v_status public.review_flag_status;
begin
  insert into public.review_flags (user_id, kind, key, refs)
  values (p_user, p_kind, p_key, p_refs)
  on conflict (user_id, kind, key) do update set refs = public.review_flags.refs || excluded.refs
  returning id, status into v_flag, v_status;
  -- A flag a reviewer already cleared doesn't hold the same commits again; new commits
  -- joining a cleared burst day are linked but stay counted.
  insert into private.review_flag_commits (flag_id, user_id, repo_id, sha)
  select v_flag, p_user, (c ->> 'repo_id')::bigint, c ->> 'sha'
    from jsonb_array_elements(p_commits) c
  on conflict do nothing;
  if v_status = 'open' then
    update public.github_commits g
       set status = 'held'
      from private.review_flag_commits l
     where l.flag_id = v_flag and g.user_id = l.user_id and g.repo_id = l.repo_id and g.sha = l.sha
       and g.status = 'counted';
  end if;
  return v_flag;
end;
$$;
revoke all on function private.open_review_flag(uuid, public.review_flag_kind, text, jsonb, jsonb) from public;

-- p_commit: {sha, authored_at, committed_at, pushed_at?, seen_via, signed, files,
--   meaningful_lines, excluded: reason|null,
--   detections: [{skill, kind, path, lines}], blobs: [blob sha]}
-- Idempotent by SHA: a commit already extracted is left alone. Returns true when recorded now.
create function private.record_commit(p_user uuid, p_repo bigint, p_commit jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sha text := p_commit ->> 'sha';
  v_seen text := coalesce(p_commit ->> 'seen_via', 'harvest');
  v_pushed timestamptz := (p_commit ->> 'pushed_at')::timestamptz;
  v_authored timestamptz := (p_commit ->> 'authored_at')::timestamptz;
  v_excluded text := nullif(p_commit ->> 'excluded', '');
  v_occurred timestamptz;
  v_existing public.github_commits;
  v_day date;
  v_day_commits integer;
  v_day_lines integer;
  v_other record;
begin
  if v_sha is null or v_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'invalid sha' using errcode = '22023';
  end if;
  if not exists (select 1 from public.github_user_repos where user_id = p_user and repo_id = p_repo) then
    return false; -- unshared or disconnected meanwhile
  end if;
  select * into v_existing from public.github_commits where user_id = p_user and repo_id = p_repo and sha = v_sha;
  if found and v_existing.extracted_at is not null then
    return false;
  end if;

  v_occurred := case
    when v_seen = 'push' and v_pushed is not null then least(v_pushed, now())
    when found then v_existing.occurred_at
    else least(coalesce((p_commit ->> 'committed_at')::timestamptz, now()), now())
  end;

  insert into public.github_commits (user_id, repo_id, sha, authored_at, occurred_at, seen_via, signed, files,
                                     meaningful_lines, status, exclusion, extracted_at)
  values (p_user, p_repo, v_sha, v_authored, v_occurred, v_seen, coalesce((p_commit ->> 'signed')::boolean, false),
          coalesce((p_commit ->> 'files')::integer, 0), least(coalesce((p_commit ->> 'meaningful_lines')::integer, 0), 400),
          case when v_excluded is null then 'counted' else 'excluded' end::public.github_commit_status, v_excluded, now())
  on conflict (user_id, repo_id, sha) do update
    set authored_at = excluded.authored_at,
        occurred_at = excluded.occurred_at,
        seen_via = case when excluded.seen_via = 'push' then 'push' else public.github_commits.seen_via end,
        signed = excluded.signed,
        files = excluded.files,
        meaningful_lines = excluded.meaningful_lines,
        status = excluded.status,
        exclusion = excluded.exclusion,
        extracted_at = excluded.extracted_at;

  -- Evidence: one row per skill. Excluded commits (a bulk import) still show the skill as
  -- present (L1), never as authored.
  insert into public.skill_evidence (user_id, skill_id, repo_id, sha, detectors, paths, lines, occurred_at)
  select p_user, d ->> 'skill', p_repo, v_sha,
         array_agg(distinct d ->> 'kind'),
         (array_agg(distinct d ->> 'path'))[1:10],
         least(coalesce(sum((d ->> 'lines')::integer), 0), 400),
         v_occurred
    from jsonb_array_elements(coalesce(p_commit -> 'detections', '[]'::jsonb)) d
    join public.skills s on s.id = d ->> 'skill'
   group by d ->> 'skill'
  on conflict (user_id, repo_id, sha, skill_id) do nothing;

  if v_excluded is not null then
    return true;
  end if;

  insert into private.github_commit_blobs (blob_sha, user_id, repo_id, sha)
  select b, p_user, p_repo, v_sha
    from jsonb_array_elements_text(coalesce(p_commit -> 'blobs', '[]'::jsonb)) b
   where b ~ '^[0-9a-f]{40}$'
  on conflict do nothing;

  -- Backdating: pushed now, but authored more than 30 days before the push.
  if v_seen = 'push' and v_authored is not null and v_pushed is not null
     and v_authored < v_pushed - interval '30 days' then
    perform private.open_review_flag(p_user, 'backdating', v_sha,
      jsonb_build_object('authored_at', v_authored, 'pushed_at', v_pushed),
      jsonb_build_array(jsonb_build_object('repo_id', p_repo, 'sha', v_sha)));
  end if;

  -- Burst: more than 50 commits or 5,000 lines in one day (Pakistan time).
  v_day := (v_occurred at time zone 'Asia/Karachi')::date;
  select count(*), coalesce(sum(meaningful_lines), 0) into v_day_commits, v_day_lines
    from public.github_commits
   where user_id = p_user and status in ('counted', 'held')
     and (occurred_at at time zone 'Asia/Karachi')::date = v_day;
  if v_day_commits > 50 or v_day_lines > 5000 then
    perform private.open_review_flag(p_user, 'burst', v_day::text,
      jsonb_build_object('day', v_day, 'commits', v_day_commits, 'lines', v_day_lines),
      (select jsonb_agg(jsonb_build_object('repo_id', repo_id, 'sha', sha))
         from public.github_commits
        where user_id = p_user and status in ('counted', 'held')
          and (occurred_at at time zone 'Asia/Karachi')::date = v_day));
  end if;

  -- Cross-account duplicate: a file this commit added is byte-identical to one another
  -- student's commit added, in a different repository. Both are held.
  for v_other in
    select distinct o.user_id, o.repo_id, o.sha
      from private.github_commit_blobs mine
      join private.github_commit_blobs o on o.blob_sha = mine.blob_sha
     where mine.user_id = p_user and mine.repo_id = p_repo and mine.sha = v_sha
       and o.user_id <> p_user and o.repo_id <> p_repo
  loop
    perform private.open_review_flag(p_user, 'cross_account_duplicate', v_other.user_id::text,
      jsonb_build_object('other_repo_id', v_other.repo_id),
      jsonb_build_array(jsonb_build_object('repo_id', p_repo, 'sha', v_sha)));
    perform private.open_review_flag(v_other.user_id, 'cross_account_duplicate', p_user::text,
      jsonb_build_object('other_repo_id', p_repo),
      jsonb_build_array(jsonb_build_object('repo_id', v_other.repo_id, 'sha', v_other.sha)));
  end loop;

  return true;
end;
$$;
revoke all on function private.record_commit(uuid, bigint, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Levels
-- ---------------------------------------------------------------------------
-- L1: the skill is in a shared repository the student owns or has authored commits in
--     (GitHub's language stats), or any of their commits touched it.
-- L2: counted evidence on 3+ distinct days and 150+ meaningful lines (languages) or 3+
--     import/manifest hits (frameworks, libraries) or 3+ hits of any kind (tools,
--     platforms, practices). Held and excluded commits don't count; excluded repositories
--     don't count at all. L3/L4 come from other sources (phase 4) and are kept as they are.
create function private.recompute_user_skills(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_found integer;
begin
  with repos as (
    select ur.repo_id, ur.kind from public.github_user_repos ur where ur.user_id = p_user and not ur.excluded
  ),
  ev as (
    select e.skill_id, e.repo_id, e.detectors, e.lines, e.occurred_at, c.status, s.category
      from public.skill_evidence e
      join repos r on r.repo_id = e.repo_id
      join public.github_commits c on c.user_id = e.user_id and c.repo_id = e.repo_id and c.sha = e.sha
      join public.skills s on s.id = e.skill_id
     where e.user_id = p_user
  ),
  agg as (
    select skill_id, min(category::text) as category,
           count(distinct (occurred_at at time zone 'Asia/Karachi')::date) filter (where status = 'counted') as days,
           coalesce(sum(lines) filter (where status = 'counted'), 0)::integer as lines,
           count(*) filter (where status = 'counted' and detectors && array['manifest', 'import']) as pkg_hits,
           count(*) filter (where status = 'counted' and detectors && array['file', 'path', 'manifest', 'import']) as any_hits,
           count(distinct repo_id) as repos,
           max(occurred_at) filter (where status in ('counted', 'held')) as last_used
      from ev group by skill_id
  ),
  linguist as (
    select distinct s.id as skill_id
      from repos r
      join public.github_repos g on g.repo_id = r.repo_id
      join public.skills s on s.retired_at is null
                          and jsonb_typeof(s.detectors -> 'linguist') = 'array'
                          and exists (select 1 from jsonb_array_elements_text(s.detectors -> 'linguist') l
                                       where l = any (g.languages))
     where r.kind = 'owned'
        or exists (select 1 from public.github_commits c where c.user_id = p_user and c.repo_id = r.repo_id)
  ),
  computed as (
    select coalesce(a.skill_id, l.skill_id) as skill_id,
           (case
             when a.skill_id is not null and a.days >= 3 and (
               (a.category = 'language' and a.lines >= 150)
               or (a.category in ('framework', 'library') and a.pkg_hits >= 3)
               or (a.category in ('tool', 'platform', 'practice') and a.any_hits >= 3)
             ) then 2
             else 1
           end)::smallint as level,
           coalesce(a.days, 0)::integer as active_days,
           coalesce(a.lines, 0)::integer as lines,
           coalesce(case when a.category in ('framework', 'library') then a.pkg_hits else a.any_hits end, 0)::integer as hits,
           coalesce(a.repos, 0)::integer as repos,
           a.last_used as last_used_at
      from agg a
      full join linguist l on l.skill_id = a.skill_id
  ),
  -- L3/L4 (other sources, phase 4) are never lowered here.
  dropped as (
    delete from public.user_skills u
     where u.user_id = p_user and u.level <= 2
       and not exists (select 1 from computed c where c.skill_id = u.skill_id)
  )
  insert into public.user_skills (user_id, skill_id, level, active_days, lines, hits, repos, last_used_at)
  select p_user, skill_id, level, active_days, lines, hits, repos, last_used_at from computed
  on conflict (user_id, skill_id) do update
    set level = case when public.user_skills.level > 2 then public.user_skills.level else excluded.level end,
        active_days = excluded.active_days,
        lines = excluded.lines,
        hits = excluded.hits,
        repos = excluded.repos,
        last_used_at = excluded.last_used_at,
        updated_at = now()
  where (public.user_skills.level, public.user_skills.active_days, public.user_skills.lines, public.user_skills.hits,
         public.user_skills.repos, public.user_skills.last_used_at)
        is distinct from
        (case when public.user_skills.level > 2 then public.user_skills.level else excluded.level end,
         excluded.active_days, excluded.lines, excluded.hits, excluded.repos, excluded.last_used_at);

  select count(*) into v_found from public.user_skills where user_id = p_user and level >= 1;
  update public.sync_jobs set skills_found = v_found
   where user_id = p_user and status in ('queued', 'running');
  return v_found;
end;
$$;
revoke all on function private.recompute_user_skills(uuid) from public;

-- Excluding, unsharing or disconnecting a repository changes the levels at once.
create function private.github_user_repos_recompute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    for v_user in select distinct user_id from old_rows loop
      perform private.recompute_user_skills(v_user);
    end loop;
  else
    for v_user in
      select distinct n.user_id from new_rows n join old_rows o on o.user_id = n.user_id and o.repo_id = n.repo_id
       where n.excluded is distinct from o.excluded
    loop
      perform private.recompute_user_skills(v_user);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.github_user_repos_recompute() from public;
create trigger github_user_repos_recompute_delete
  after delete on public.github_user_repos
  referencing old table as old_rows
  for each statement execute function private.github_user_repos_recompute();
create trigger github_user_repos_recompute_update
  after update on public.github_user_repos
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.github_user_repos_recompute();

-- ---------------------------------------------------------------------------
-- Trust reviewers resolve flags (the /ops queue arrives in phase 11)
-- ---------------------------------------------------------------------------
-- Cleared: the held commits count again. Upheld: they're excluded for good.
create function private.resolve_review_flag(p_flag bigint, p_upheld boolean, p_note text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reviewer uuid := (select auth.uid());
  v_user uuid;
begin
  if not private.is_staff('trust_reviewer') then
    raise exception 'trust reviewers only' using errcode = '42501';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'a note is required' using errcode = '22023';
  end if;
  update public.review_flags
     set status = case when p_upheld then 'upheld' else 'cleared' end::public.review_flag_status,
         reviewer_id = v_reviewer, note = left(p_note, 2000), resolved_at = now()
   where id = p_flag and status = 'open'
  returning user_id into v_user;
  if v_user is null then
    return false;
  end if;

  if p_upheld then
    update public.github_commits g
       set status = 'excluded', exclusion = 'review'
      from private.review_flag_commits l
     where l.flag_id = p_flag and g.user_id = l.user_id and g.repo_id = l.repo_id and g.sha = l.sha
       and g.status in ('held', 'counted');
  else
    -- Back to counted unless another open flag still holds the commit.
    update public.github_commits g
       set status = 'counted'
      from private.review_flag_commits l
     where l.flag_id = p_flag and g.user_id = l.user_id and g.repo_id = l.repo_id and g.sha = l.sha
       and g.status = 'held'
       and not exists (
         select 1 from private.review_flag_commits l2
           join public.review_flags f on f.id = l2.flag_id and f.status = 'open'
          where l2.user_id = g.user_id and l2.repo_id = g.repo_id and l2.sha = g.sha
       );
  end if;
  perform private.recompute_user_skills(v_user);
  return true;
end;
$$;
revoke all on function private.resolve_review_flag(bigint, boolean, text) from public;
grant execute on function private.resolve_review_flag(bigint, boolean, text) to authenticated;

create function public.resolve_review_flag(p_flag bigint, p_upheld boolean, p_note text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_review_flag(p_flag, p_upheld, p_note);
$$;
revoke all on function public.resolve_review_flag(bigint, boolean, text) from public, anon;
grant execute on function public.resolve_review_flag(bigint, boolean, text) to authenticated;

-- Flag details for trust reviewers (the kind and refs aren't granted as columns).
create function private.review_flag_details(p_flag bigint)
returns table (id bigint, user_id uuid, kind public.review_flag_kind, refs jsonb, status public.review_flag_status,
               commits bigint, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('trust_reviewer') then
    raise exception 'trust reviewers only' using errcode = '42501';
  end if;
  return query
    select f.id, f.user_id, f.kind, f.refs, f.status,
           (select count(*) from private.review_flag_commits l where l.flag_id = f.id), f.created_at
      from public.review_flags f where f.id = p_flag;
end;
$$;
revoke all on function private.review_flag_details(bigint) from public;
grant execute on function private.review_flag_details(bigint) to authenticated;

create function public.review_flag_details(p_flag bigint)
returns table (id bigint, user_id uuid, kind public.review_flag_kind, refs jsonb, status public.review_flag_status,
               commits bigint, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.review_flag_details(p_flag);
$$;
revoke all on function public.review_flag_details(bigint) from public, anon;
grant execute on function public.review_flag_details(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Webhooks: pushes to the default branch queue their commits; force-pushes re-harvest
-- ---------------------------------------------------------------------------
create or replace function private.process_github_webhook(p_delivery_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event private.github_webhook_events;
  v_installation bigint;
  v_discover uuid[] := '{}';
  v_user uuid;
  v_repo bigint;
  v_shas jsonb;
  v_target record;
begin
  select * into v_event from private.github_webhook_events where delivery_id = p_delivery_id for update;
  if not found or v_event.processed_at is not null then
    return '{}'::jsonb;
  end if;
  v_installation := coalesce(v_event.installation_id, (v_event.payload #>> '{installation,id}')::bigint);

  if v_event.event = 'installation' then
    if v_event.action = 'deleted' then
      update public.github_installations set deleted_at = now() where installation_id = v_installation;
      delete from public.github_user_repos where installation_id = v_installation;
      delete from public.github_user_installations where installation_id = v_installation;
      delete from public.github_repos r
       where not exists (select 1 from public.github_user_repos ur where ur.repo_id = r.repo_id);
    elsif v_event.action = 'suspend' then
      update public.github_installations set suspended_at = now() where installation_id = v_installation;
    elsif v_event.action = 'unsuspend' then
      update public.github_installations set suspended_at = null where installation_id = v_installation;
      select coalesce(array_agg(user_id), '{}') into v_discover
        from public.github_user_installations where installation_id = v_installation;
    end if;
  elsif v_event.event = 'installation_repositories' then
    delete from public.github_user_repos ur
     where ur.installation_id = v_installation
       and ur.repo_id in (select (r ->> 'id')::bigint from jsonb_array_elements(coalesce(v_event.payload -> 'repositories_removed', '[]')) r);
    delete from public.github_repos r
     where not exists (select 1 from public.github_user_repos ur where ur.repo_id = r.repo_id);
    update public.github_installations
       set repository_selection = coalesce(v_event.payload ->> 'repository_selection', repository_selection)
     where installation_id = v_installation;
    select coalesce(array_agg(user_id), '{}') into v_discover
      from public.github_user_installations where installation_id = v_installation;
  elsif v_event.event = 'github_app_authorization' and v_event.action = 'revoked' then
    select user_id into v_user from public.github_accounts
     where github_id = (v_event.payload #>> '{sender,id}')::bigint;
    if v_user is not null then
      perform private.mark_github_revoked(v_user);
    end if;
  elsif v_event.event = 'push' and not coalesce((v_event.payload ->> 'deleted')::boolean, false) then
    v_repo := (v_event.payload #>> '{repository,id}')::bigint;
    select coalesce(jsonb_agg(s), '[]'::jsonb) into v_shas
      from jsonb_array_elements_text(coalesce(v_event.payload -> 'commits', '[]'::jsonb)) s
     where s ~ '^[0-9a-f]{40}$';
    -- Every linked student sharing the repository; the worker keeps only commits whose
    -- author.id is theirs.
    for v_target in
      select ur.user_id
        from public.github_user_repos ur
        join public.github_repos g on g.repo_id = ur.repo_id
        join public.github_accounts a on a.user_id = ur.user_id and a.revoked_at is null
       where ur.repo_id = v_repo and not ur.excluded and ur.kind is not null
         and v_event.payload ->> 'ref' = 'refs/heads/' || g.default_branch
    loop
      if coalesce((v_event.payload ->> 'forced')::boolean, false) then
        perform private.enqueue_github(jsonb_build_object('stage', 'harvest', 'user_id', v_target.user_id, 'repo_id', v_repo));
      elsif jsonb_array_length(v_shas) > 0 then
        perform private.enqueue_github(jsonb_build_object(
          'stage', 'extract', 'user_id', v_target.user_id, 'repo_id', v_repo,
          'shas', v_shas, 'pushed_at', v_event.received_at));
      end if;
    end loop;
  end if;
  -- pull_request and pull_request_review feed L3 (phase 4); until then they're only recorded.

  update private.github_webhook_events set processed_at = now() where delivery_id = p_delivery_id;
  return jsonb_build_object('discover', to_jsonb(v_discover));
end;
$$;

-- ---------------------------------------------------------------------------
-- Nightly reconcile (PRD 5.5): a fresh sync for every linked student
-- ---------------------------------------------------------------------------
create function private.github_nightly_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_user uuid;
  v_n integer := 0;
begin
  v_run := public.job_run_start('github-nightly-sync');
  begin
    for v_user in select user_id from public.github_accounts where revoked_at is null loop
      perform private.start_github_sync(v_user, 'nightly');
      v_n := v_n + 1;
    end loop;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
end;
$$;
revoke all on function private.github_nightly_sync() from public;

select cron.schedule('github-nightly-sync', '17 21 * * *', $$select private.github_nightly_sync()$$); -- 02:17 PKT
