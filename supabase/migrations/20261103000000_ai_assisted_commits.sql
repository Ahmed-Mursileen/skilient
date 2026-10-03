-- AI-assisted work (decisions 2026-10-03, PRD 5.5). A commit written by an AI coding agent counts
-- as the student's work, labelled "AI-assisted", when GitHub can show it is theirs: its git author
-- is a known agent identity (platform_config github.ai_agents) and it reached the default branch
-- through a merged pull request the student opened, in a repository they shared with Skilient.
-- Human authors other than the student still never count, and a Co-Authored-By trailer alone
-- never counts. The worker checks the pull request and the author; this file stores the result,
-- counts it toward L1/L2 like the student's own commits, and flags a skill as AI-assisted when
-- most of its counted lines came from an agent. A passed code check removes the flag.

-- ---------------------------------------------------------------------------
-- Config: the agent identities (git author email or GitHub login, lower case)
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason) values
  ('github.ai_agents', 1,
   '[{"match": "noreply@anthropic.com", "name": "Claude"},
     {"match": "claude[bot]", "name": "Claude"},
     {"match": "claude", "name": "Claude"},
     {"match": "copilot-swe-agent[bot]", "name": "GitHub Copilot"},
     {"match": "198982749+copilot@users.noreply.github.com", "name": "GitHub Copilot"},
     {"match": "devin-ai-integration[bot]", "name": "Devin"},
     {"match": "cursoragent@cursor.com", "name": "Cursor"},
     {"match": "codex@openai.com", "name": "Codex"},
     {"match": "chatgpt-codex-connector[bot]", "name": "Codex"}]',
   'Decisions 2026-10-03: commits by these AI coding agents count as AI-assisted work.');
insert into public.config_keys (key, area, description, applies, schema) values
  ('github.ai_agents', 'github',
   'AI coding agents whose commits count as AI-assisted work when they arrive in a pull request the student opened and merged. "match": a git author email or GitHub login.',
   'now',
   '{"type": "array", "items": {"type": "object", "required": ["match", "name"], "additionalProperties": false,
     "properties": {"match": {"type": "string", "minLength": 3, "maxLength": 200}, "name": {"type": "string", "minLength": 1, "maxLength": 60}}}}');

-- The agent's display name for an email or login ("Claude"); the raw value when unknown.
create function private.ai_agent_label(p_agent text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a ->> 'name' from jsonb_array_elements(coalesce(private.config('github.ai_agents'), '[]'::jsonb)) a
      where lower(a ->> 'match') = lower(p_agent) limit 1),
    p_agent)
$$;
revoke all on function private.ai_agent_label(text) from public, anon;
grant execute on function private.ai_agent_label(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.github_commits
  add column ai_agent text check (ai_agent is null or char_length(ai_agent) between 3 and 200),
  add column via_pr integer check (via_pr is null or via_pr > 0),
  add constraint github_commits_agent_via_pr check (ai_agent is null or via_pr is not null);
comment on column public.github_commits.ai_agent is
  'The AI coding agent that authored this commit (its email or login), when it came through a pull request the student opened and merged. Null: the student authored it.';
comment on column public.github_commits.via_pr is 'The pull request (number) an agent commit arrived through.';

alter table public.user_skills
  add column ai_lines integer not null default 0,
  add column ai_assisted boolean not null default false;
comment on column public.user_skills.ai_assisted is
  'Most of this skill''s counted GitHub evidence was written by an AI coding agent. A passed code check clears it.';
grant select (ai_lines, ai_assisted) on public.user_skills to authenticated;

alter table public.contributions
  add column ai_agent text check (ai_agent is null or char_length(ai_agent) between 3 and 200);
comment on column public.contributions.ai_agent is 'For a GitHub entry: the AI coding agent that wrote the commit.';

-- The worker's lookup: the agent commits it has recorded for a repository.
create index github_commits_agent_idx on public.github_commits (user_id, repo_id) where ai_agent is not null;

-- Merged pull requests are checked for agent commits once: this marks how far a repository got,
-- so the first sync after this change backfills every earlier pull request.
alter table public.github_user_repos add column agent_prs_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- my_skills gains the flag and the AI-written lines (return type changes: drop and recreate)
-- ---------------------------------------------------------------------------
drop function public.my_skills();
drop function private.my_skills();
create function private.my_skills()
returns table (skill_id text, level smallint, active_days integer, lines integer, hits integer, repos integer,
               last_used_at timestamptz, ai_lines integer, ai_assisted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.skill_id, u.level, u.active_days, u.lines, u.hits, u.repos, u.last_used_at, u.ai_lines, u.ai_assisted
    from public.user_skills u
   where u.user_id = (select auth.uid()) and u.level >= 1;
$$;
revoke all on function private.my_skills() from public, anon;
grant execute on function private.my_skills() to authenticated;
create function public.my_skills()
returns table (skill_id text, level smallint, active_days integer, lines integer, hits integer, repos integer,
               last_used_at timestamptz, ai_lines integer, ai_assisted boolean)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.my_skills() $$;
revoke all on function public.my_skills() from public, anon;
grant execute on function public.my_skills() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Functions that carry the agent (regenerated from their current definitions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.harvest_commits(p_user uuid, p_repo bigint, p_commits jsonb, p_complete boolean)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_listed text[];
  v_pending text[];
begin
  if not exists (select 1 from public.github_user_repos where user_id = p_user and repo_id = p_repo) then
    return '{}';
  end if;
  select coalesce(array_agg(c ->> 'sha'), '{}') into v_listed from jsonb_array_elements(p_commits) c;

  insert into public.github_commits (user_id, repo_id, sha, authored_at, occurred_at, seen_via, signed,
                                     status, exclusion, extracted_at, ai_agent, via_pr)
  select p_user, p_repo, c ->> 'sha', (c ->> 'authored_at')::timestamptz,
         least(coalesce((c ->> 'committed_at')::timestamptz, now()), now()), 'harvest',
         coalesce((c ->> 'signed')::boolean, false),
         case when coalesce((c ->> 'parents')::integer, 1) > 1 then 'excluded' else 'pending' end::public.github_commit_status,
         case when coalesce((c ->> 'parents')::integer, 1) > 1 then 'merge' end,
         case when coalesce((c ->> 'parents')::integer, 1) > 1 then now() end,
         nullif(c ->> 'ai_agent', ''), (c ->> 'via_pr')::integer
    from jsonb_array_elements(p_commits) c
   where c ->> 'sha' ~ '^[0-9a-f]{40}$'
  on conflict (user_id, repo_id, sha) do update
    set ai_agent = coalesce(public.github_commits.ai_agent, excluded.ai_agent),
        via_pr = coalesce(public.github_commits.via_pr, excluded.via_pr)
    where excluded.ai_agent is not null;

  if p_complete then
    delete from public.skill_evidence e
     using public.github_commits c
     where c.user_id = p_user and c.repo_id = p_repo and not (c.sha = any (v_listed)) and c.status <> 'excluded'
       and c.ai_agent is null
       and e.user_id = c.user_id and e.repo_id = c.repo_id and e.sha = c.sha;
    update public.github_commits
       set status = 'excluded', exclusion = 'rewritten', extracted_at = coalesce(extracted_at, now())
     where user_id = p_user and repo_id = p_repo and not (sha = any (v_listed)) and status <> 'excluded'
       and ai_agent is null;
  end if;

  update public.github_user_repos set harvested_at = now(), last_synced_at = now()
   where user_id = p_user and repo_id = p_repo;

  select coalesce(array_agg(sha order by occurred_at), '{}') into v_pending
    from public.github_commits
   where user_id = p_user and repo_id = p_repo and extracted_at is null;
  return v_pending;
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_commit(p_user uuid, p_repo bigint, p_commit jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                     meaningful_lines, status, exclusion, extracted_at, ai_agent, via_pr)
  values (p_user, p_repo, v_sha, v_authored, v_occurred, v_seen, coalesce((p_commit ->> 'signed')::boolean, false),
          coalesce((p_commit ->> 'files')::integer, 0), least(coalesce((p_commit ->> 'meaningful_lines')::integer, 0), 400),
          case when v_excluded is null then 'counted' else 'excluded' end::public.github_commit_status, v_excluded, now(),
          nullif(p_commit ->> 'ai_agent', ''), (p_commit ->> 'via_pr')::integer)
  on conflict (user_id, repo_id, sha) do update
    set authored_at = excluded.authored_at,
        occurred_at = excluded.occurred_at,
        seen_via = case when excluded.seen_via = 'push' then 'push' else public.github_commits.seen_via end,
        signed = excluded.signed,
        files = excluded.files,
        meaningful_lines = excluded.meaningful_lines,
        status = excluded.status,
        exclusion = excluded.exclusion,
        extracted_at = excluded.extracted_at,
        ai_agent = coalesce(public.github_commits.ai_agent, excluded.ai_agent),
        via_pr = coalesce(public.github_commits.via_pr, excluded.via_pr);

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
$function$;

CREATE OR REPLACE FUNCTION private.recompute_user_skills(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_found integer;
begin
  with repos as (
    select ur.repo_id, ur.kind from public.github_user_repos ur where ur.user_id = p_user and not ur.excluded
  ),
  ev as (
    select e.skill_id, e.repo_id, e.detectors, e.lines, e.occurred_at, c.status, s.category, c.ai_agent
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
           coalesce(sum(lines) filter (where status = 'counted' and ai_agent is not null), 0)::integer as ai_lines,
           count(*) filter (where status = 'counted' and ai_agent is not null) as ai_hits,
           count(*) filter (where status = 'counted') as counted_hits,
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
  github as (
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
           a.last_used as last_used_at,
           coalesce(a.ai_lines, 0)::integer as ai_lines,
           (case when a.lines > 0 then a.ai_lines * 2 > a.lines
                 else coalesce(a.ai_hits, 0) * 2 > coalesce(a.counted_hits, 0) and a.ai_hits > 0 end) as ai_major
      from agg a
      full join linguist l on l.skill_id = a.skill_id
  ),
  proofs as (
    select skill_id, 3::smallint as level from private.l3_skills(p_user)
    union all
    select skill_id, 4::smallint from private.l4_skills(p_user)
  ),
  computed as (
    select k.skill_id,
           greatest(coalesce(g.level, 0), coalesce((select max(pr.level) from proofs pr where pr.skill_id = k.skill_id), 0))::smallint as level,
           coalesce(g.active_days, 0) as active_days,
           coalesce(g.lines, 0) as lines,
           coalesce(g.hits, 0) as hits,
           coalesce(g.repos, 0) as repos,
           g.last_used_at,
           coalesce(g.ai_lines, 0) as ai_lines,
           (coalesce(g.ai_major, false)
            and not exists (select 1 from public.code_checks cc
                             where cc.user_id = p_user and cc.skill_id = k.skill_id and cc.status = 'passed')) as ai_assisted
      from (select skill_id from github union select skill_id from proofs) k
      join public.skills s on s.id = k.skill_id and s.retired_at is null
      left join github g on g.skill_id = k.skill_id
  ),
  dropped as (
    delete from public.user_skills u
     where u.user_id = p_user
       and not exists (select 1 from computed c where c.skill_id = u.skill_id)
  )
  insert into public.user_skills (user_id, skill_id, level, active_days, lines, hits, repos, last_used_at, ai_lines, ai_assisted)
  select p_user, skill_id, level, active_days, lines, hits, repos, last_used_at, ai_lines, ai_assisted from computed
  on conflict (user_id, skill_id) do update
    set level = excluded.level,
        active_days = excluded.active_days,
        lines = excluded.lines,
        hits = excluded.hits,
        repos = excluded.repos,
        last_used_at = excluded.last_used_at,
        ai_lines = excluded.ai_lines,
        ai_assisted = excluded.ai_assisted,
        updated_at = now()
  where (public.user_skills.level, public.user_skills.active_days, public.user_skills.lines, public.user_skills.hits,
         public.user_skills.repos, public.user_skills.last_used_at, public.user_skills.ai_lines, public.user_skills.ai_assisted)
        is distinct from
        (excluded.level, excluded.active_days, excluded.lines, excluded.hits, excluded.repos, excluded.last_used_at,
         excluded.ai_lines, excluded.ai_assisted);

  select count(*) into v_found from public.user_skills where user_id = p_user and level >= 1;
  update public.sync_jobs set skills_found = v_found
   where user_id = p_user and status in ('queued', 'running');
  return v_found;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_venture_commits(p_venture uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.ventures;
  v_count integer;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or v.repo_id is null or v.status not in ('recruiting', 'in_progress') then
    return 0;
  end if;
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, source, commit_sha,
                                    before_venture, created_at, ai_agent)
  select v.id, c.user_id, 'code',
         format('Commit %s to %s (%s meaningful %s)', left(c.sha, 7), v.repo_full_name, c.meaningful_lines,
                case when c.meaningful_lines = 1 then 'line' else 'lines' end),
         format('https://github.com/%s/commit/%s', v.repo_full_name, c.sha),
         'github', c.sha, c.occurred_at < v.created_at, c.occurred_at, c.ai_agent
    from public.github_commits c
    join public.venture_members m on m.venture_id = v.id and m.user_id = c.user_id
   where c.repo_id = v.repo_id
     and c.status = 'counted'
     and c.occurred_at >= v.created_at - interval '6 months'
     and (p_user is null or c.user_id = p_user)
  on conflict (venture_id, user_id, commit_sha) where commit_sha is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION private.my_skill_proofs(p_skill text)
 RETURNS TABLE(kind text, level smallint, title text, detail text, url text, venture_id uuid, occurred_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select 'ai_pull_request', 2::smallint, g.full_name || ' #' || c.via_pr,
         format('Written with %s; %s %s', private.ai_agent_label(min(c.ai_agent)), count(*),
                case when count(*) = 1 then 'commit' else 'commits' end),
         'https://github.com/' || g.full_name || '/pull/' || c.via_pr, null::uuid, max(c.occurred_at)
    from public.github_commits c
    join public.github_repos g on g.repo_id = c.repo_id
   where c.user_id = (select auth.uid()) and c.ai_agent is not null and c.via_pr is not null and c.status = 'counted'
     and exists (select 1 from public.skill_evidence e where e.user_id = c.user_id and e.repo_id = c.repo_id
                   and e.sha = c.sha and e.skill_id = p_skill)
   group by g.full_name, c.via_pr
  union all
  select 'code_check', 4::smallint, 'Code check passed', null, null, null, c.graded_at
    from public.code_checks c
   where c.user_id = (select auth.uid()) and c.skill_id = p_skill and c.status = 'passed'
   order by 7 desc;
$function$;

CREATE OR REPLACE FUNCTION private.cv_snapshot_base(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_person jsonb;
  v_sections text[];
  v_show_pct boolean;
  v_show_email boolean;
  v_dept text;
  v_uni text;
  v_year smallint;
  v_tier public.ranking_tier;
  v_top integer;
  v_skills jsonb;
  v_projects jsonb;
  v_prs jsonb;
  v_endorse jsonb;
  v_creds jsonb;
  v_summary text;
  v_n_proj integer;
  v_n_done integer;
  v_n_prs integer;
  v_top3 text[];
begin
  if not private.cv_eligible(p_user) then
    return null;
  end if;

  select coalesce(s.sections, private.cv_all_sections()),
         coalesce(s.show_percentile, not p.leaderboard_opt_out),
         coalesce(s.show_email, false),
         p.department, un.name, p.graduation_year,
         jsonb_build_object(
           'name', p.full_name,
           'username', p.username,
           'university', un.name,
           'department', p.department,
           'graduation_year', p.graduation_year::integer,
           'email', case when coalesce(s.show_email, false) then u.email end)
    into v_sections, v_show_pct, v_show_email, v_dept, v_uni, v_year, v_person
    from public.profiles p
    join public.universities un on un.id = p.university_id
    join auth.users u on u.id = p.user_id
    left join public.cv_settings s on s.user_id = p.user_id
   where p.user_id = p_user;

  -- Tier always shows; the percentile only as "top N%" within the top half, and only when
  -- the student shows it (default: not when they left the leaderboard).
  select r.tier,
         case when r.ranked and r.percentile is not null and v_show_pct
                   and greatest(1, ceil((1 - r.percentile) * 100))::integer <= 50
              then greatest(1, ceil((1 - r.percentile) * 100))::integer end
    into v_tier, v_top
    from public.ranking_scores r where r.user_id = p_user;

  -- Skills: L2 and above, up to 15, by level then evidence.
  with ev as (
    select us.skill_id, sk.name, us.level::integer as level, us.repos, us.active_days, us.ai_assisted,
           (select count(*)::integer from public.github_pr_skills ps
              join public.github_pull_requests pr
                on pr.user_id = ps.user_id and pr.repo_github_id = ps.repo_github_id and pr.number = ps.number
             where ps.user_id = p_user and ps.skill_id = us.skill_id and pr.counted) as pull_requests,
           (select count(*)::integer from public.contributions o
             where o.user_id = p_user and o.corrects_id is null and o.source = 'manual'
               and private.entry_shows_skill(o.id, us.skill_id)
               and o.id in (select e.entry_id from private.verified_entries(p_user) e)) as entries,
           (select count(*)::integer from public.endorsements e
             where e.endorsee_id = p_user and e.skill_id = us.skill_id and not e.hidden) as endorsements
      from public.user_skills us
      join public.skills sk on sk.id = us.skill_id and sk.retired_at is null
     where us.user_id = p_user and us.level >= 2
  ), top as (
    select * from ev
     order by level desc, repos + active_days + pull_requests + entries + endorsements desc, name
     limit 15
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', skill_id, 'name', name, 'level', level, 'ai_assisted', ai_assisted,
           'evidence', jsonb_build_object('repos', repos, 'active_days', active_days,
                                          'pull_requests', pull_requests, 'entries', entries,
                                          'endorsements', endorsements))
           order by level desc, repos + active_days + pull_requests + entries + endorsements desc, name), '[]'::jsonb),
         (array_agg(name order by level desc, repos + active_days + pull_requests + entries + endorsements desc, name))[1:3]
    into v_skills, v_top3
    from top;

  -- Projects: ventures in progress or completed where the student is a member, or was one
  -- and keeps peer-verified entries (decisions.md 2026-09-28). Unlisted ventures stay off.
  -- Deliverables are a count, never links (PRD 5.28); a private repository is not named.
  with verified as (
    select e.venture_id, count(*)::integer as n from private.verified_entries(p_user) e group by e.venture_id
  ), mine as (
    select v.id, v.title, v.type, v.status, v.completed_at, v.description, v.skill_ids,
           v.repo_id, v.repo_full_name, v.owner_id = p_user as is_owner,
           m.team_role, coalesce(m.joined_at,
             (select min(c.created_at) from public.contributions c where c.venture_id = v.id and c.user_id = p_user)) as started_at,
           m.user_id is null as former,
           coalesce(vf.n, 0) as verified_entries
      from public.ventures v
      left join public.venture_members m on m.venture_id = v.id and m.user_id = p_user
      left join verified vf on vf.venture_id = v.id
     where v.status in ('in_progress', 'completed') and v.visibility <> 'unlisted'
       and (m.user_id is not null or coalesce(vf.n, 0) > 0)
     order by (v.status = 'completed') desc, v.completed_at desc nulls last, started_at desc
     limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', mine.id,
           'title', mine.title,
           'type', mine.type,
           'status', mine.status,
           'role', case when mine.former then 'former_member' else mine.team_role::text end,
           'owner', mine.is_owner,
           'started', to_char(mine.started_at at time zone 'Asia/Karachi', 'YYYY-MM'),
           'completed', to_char(mine.completed_at at time zone 'Asia/Karachi', 'YYYY-MM'),
           'team_size', (select count(*)::integer from public.venture_members t where t.venture_id = mine.id),
           'verified_entries', mine.verified_entries,
           'faculty_confirmed', 0,
           'faculty_reviewed', false,
           'deliverables', (select count(*)::integer from public.venture_deliverables d where d.venture_id = mine.id),
           'skills', coalesce((select jsonb_agg(sk.name order by sk.name) from public.skills sk where sk.id = any (mine.skill_ids)), '[]'::jsonb),
           'repository', case when mine.repo_full_name is null then null
                              when coalesce((select g.private from public.github_repos g where g.repo_id = mine.repo_id), true)
                                then 'Private repository'
                              else mine.repo_full_name end,
           'description', case when char_length(mine.description) > 500
                               then rtrim(left(mine.description, 499)) || '…' else mine.description end)
           order by (mine.status = 'completed') desc, mine.completed_at desc nulls last, mine.started_at desc), '[]'::jsonb),
         count(*)::integer,
         count(*) filter (where mine.status = 'completed')::integer
    into v_projects, v_n_proj, v_n_done
    from mine;

  -- Open-source work: merged pull requests that count (someone else's repository).
  with prs as (
    select pr.repo_full_name, pr.repo_private, pr.number, pr.merged_at,
           coalesce((select jsonb_agg(sk.name order by sk.name)
                       from public.github_pr_skills ps join public.skills sk on sk.id = ps.skill_id
                      where ps.user_id = pr.user_id and ps.repo_github_id = pr.repo_github_id and ps.number = pr.number), '[]'::jsonb) as skills
      from public.github_pull_requests pr
     where pr.user_id = p_user and pr.counted
     order by pr.merged_at desc
     limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'repository', case when repo_private then 'Private repository' else repo_full_name end,
           'number', case when repo_private then null else number end,
           'merged', to_char(merged_at at time zone 'Asia/Karachi', 'YYYY-MM-DD'),
           'skills', skills) order by merged_at desc), '[]'::jsonb)
    into v_prs
    from prs;
  select count(*)::integer into v_n_prs from public.github_pull_requests where user_id = p_user and counted;

  -- Endorsements: up to 5 tied to evidence, one per endorser, higher endorser tier first.
  with tied as (
    select distinct on (e.endorser_id)
           e.endorser_id, e.created_at, e.note, sk.name as skill, v.title as venture, pr.full_name as endorser, rs.tier
      from public.endorsements e
      join public.skills sk on sk.id = e.skill_id
      join public.ventures v on v.id = e.venture_id
      join public.profiles pr on pr.user_id = e.endorser_id
      left join public.ranking_scores rs on rs.user_id = e.endorser_id
     where e.endorsee_id = p_user and not e.hidden and e.evidence_id is not null
       and private.entry_shows_skill(e.evidence_id, e.skill_id)
     order by e.endorser_id, e.created_at desc
  ), top as (
    select * from tied order by tier desc nulls last, created_at desc limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'endorser', endorser, 'skill', skill, 'venture', venture, 'note', note,
           'date', to_char(created_at at time zone 'Asia/Karachi', 'YYYY-MM-DD'))
           order by tier desc nulls last, created_at desc), '[]'::jsonb)
    into v_endorse
    from top;

  -- Credentials: approved by a trust reviewer and not expired.
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', c.title,
           'issuer', coalesce(ri.name, c.issuer),
           'issued', to_char(c.issued_on, 'YYYY-MM'),
           'expires', to_char(c.expires_on, 'YYYY-MM'))
           order by c.issued_on desc, c.title), '[]'::jsonb)
    into v_creds
    from public.credentials c
    left join public.recognised_issuers ri on ri.id = c.recognised_issuer_id
   where c.user_id = p_user and c.status = 'approved'
     and (c.expires_on is null or c.expires_on > (now() at time zone 'Asia/Karachi')::date);

  -- Template summary (no AI): department, never the free-text programme.
  v_summary := coalesce(v_dept || ' student', 'Student') || ' at ' || v_uni
    || coalesce(', class of ' || v_year, '')
    || case when cardinality(v_top3) > 0 then ', with verified work in ' || private.cv_join_names(v_top3)
            when v_n_proj > 0 then ', with verified work' else '' end
    || case when v_n_proj > 0 then ' across ' || v_n_proj || case when v_n_proj = 1 then ' venture' else ' ventures' end
              || case when v_n_done > 0 then ' (' || v_n_done || ' completed)' else '' end
            else '' end
    || '.'
    || case when v_n_prs > 0 then ' ' || v_n_prs || case when v_n_prs = 1 then ' merged pull request' else ' merged pull requests' end
              || ' to other developers'' repositories.' else '' end
    || case when v_tier is not null then ' ' || initcap(v_tier::text) || ' tier on Skilient'
              || coalesce(', top ' || v_top || '%', '') || '.' else '' end;

  return jsonb_build_object(
    'schema', 'skilient.cv/1',
    'person', v_person,
    'standing', jsonb_build_object('tier', v_tier, 'top_percent', v_top),
    'sections', to_jsonb(v_sections),
    'summary', v_summary,
    'skills', v_skills,
    'projects', v_projects,
    'open_source', v_prs,
    'endorsements', v_endorse,
    'credentials', v_creds,
    'education', jsonb_build_object('university', v_uni, 'department', v_dept, 'graduation_year', v_year::integer)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.search_talent(p_filters jsonb, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                                                   'code_check', s.id = any (m.checked_skills),
                                                                   'ai_assisted', exists (select 1 from public.user_skills ua where ua.user_id = m.student_id and ua.skill_id = s.id and ua.ai_assisted))
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
$function$;

CREATE OR REPLACE FUNCTION private.talent_explore(p_filters jsonb, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                                                   'code_check', s.id = any (m.checked_skills),
                                                                   'ai_assisted', exists (select 1 from public.user_skills ua where ua.user_id = m.student_id and ua.skill_id = s.id and ua.ai_assisted))
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
$function$;

-- ---------------------------------------------------------------------------
-- Contributions read: the agent behind a GitHub entry
-- ---------------------------------------------------------------------------
create or replace view public.contributions_with_status with (security_invoker = true) as
 SELECT o.id,
    o.venture_id,
    o.user_id,
    e.id AS current_id,
    e.kind,
    e.description,
    e.evidence_url,
    e.hours,
    o.source,
    o.commit_sha,
    o.created_at,
        CASE
            WHEN e.id <> o.id THEN e.created_at
            ELSE NULL::timestamp with time zone
        END AS corrected_at,
    ( SELECT count(*)::integer AS count
           FROM public.contribution_confirmations k
          WHERE k.contribution_id = e.id) AS confirmations,
    o.source = 'github'::contribution_source AND NOT o.before_venture OR (EXISTS ( SELECT 1
           FROM public.contribution_confirmations k
          WHERE k.contribution_id = e.id)) AS peer_verified,
    (EXISTS ( SELECT 1
           FROM public.contribution_confirmations k
          WHERE k.contribution_id = e.id AND k.confirmer_id = (( SELECT auth.uid() AS uid)))) AS confirmed_by_me,
    (EXISTS ( SELECT 1
           FROM public.venture_members m
          WHERE m.venture_id = o.venture_id AND m.user_id = o.user_id)) AS by_member,
    o.before_venture,
    e.skill_ids,
    (EXISTS ( SELECT 1
           FROM public.contribution_confirmations k
          WHERE k.contribution_id = e.id AND k.confirmer_role = 'supervisor'::text)) AS faculty_confirmed,
    o.ai_agent
   FROM public.contributions o
     CROSS JOIN LATERAL ( SELECT c.id,
            c.venture_id,
            c.user_id,
            c.kind,
            c.description,
            c.evidence_url,
            c.hours,
            c.corrects_id,
            c.source,
            c.commit_sha,
            c.created_at,
            c.before_venture,
            c.skill_ids
           FROM public.contributions c
          WHERE c.id = o.id OR c.corrects_id = o.id
          ORDER BY c.created_at DESC, (c.id = o.id)
         LIMIT 1) e
  WHERE o.corrects_id IS NULL;

-- ---------------------------------------------------------------------------
-- The worker's reads and writes (service role only)
-- ---------------------------------------------------------------------------
-- The agent identities, for the worker's matcher.
create function private.ai_agents()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.config('github.ai_agents'), '[]'::jsonb) $$;
revoke all on function private.ai_agents() from public, anon, authenticated;

-- The agent commits already recorded for a repository: extract accepts these alongside the
-- student's own commits.
create function private.agent_commit_shas(p_user uuid, p_repo bigint)
returns table (sha text, ai_agent text, via_pr integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.sha, c.ai_agent, c.via_pr from public.github_commits c
   where c.user_id = p_user and c.repo_id = p_repo and c.ai_agent is not null
$$;
revoke all on function private.agent_commit_shas(uuid, bigint) from public, anon, authenticated;

-- A merged pull request in a repository the student shared: which shared repository it is (the
-- worker records agent commits only there).
create function private.shared_repo_id(p_user uuid, p_github_repo_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select ur.repo_id from public.github_user_repos ur
   where ur.user_id = p_user and ur.repo_id = p_github_repo_id and not ur.excluded
$$;
revoke all on function private.shared_repo_id(uuid, bigint) from public, anon, authenticated;

-- When the repository's merged pull requests were last checked for agent commits (null: never).
create function private.agent_prs_checked(p_user uuid, p_repo bigint, p_mark boolean)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  select agent_prs_checked_at into v_at from public.github_user_repos where user_id = p_user and repo_id = p_repo;
  if p_mark then
    update public.github_user_repos set agent_prs_checked_at = now() where user_id = p_user and repo_id = p_repo;
  end if;
  return v_at;
end;
$$;
revoke all on function private.agent_prs_checked(uuid, bigint, boolean) from public, anon, authenticated;

-- Everyone with agent evidence: their skills are recomputed so the new flag is set.
do $$
declare r record;
begin
  for r in select distinct user_id from public.github_commits where ai_agent is not null loop
    perform private.recompute_user_skills(r.user_id);
  end loop;
end $$;
