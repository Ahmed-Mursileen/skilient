-- Phase 5 slice 1: the verified CV's signing core (PRD 5.18, decisions.md 2026-10-01).
--
-- A CV version is a snapshot of verified data built here in SQL (one builder for the
-- student's first CV and the monthly refresh), signed by the `cv-sign` Edge Function with
-- an Ed25519 key whose private half lives only in Vault. The function connects to Postgres
-- directly, so nothing in this file is exposed through the Data API except the public keys,
-- the owner's own records and settings.

-- ---------------------------------------------------------------------------------------
-- Signing keys: public halves only; the private half is the Vault secret
-- 'cv_signing_key:<key_id>' until the key is retired. Rows are never deleted, so every CV
-- ever issued can still be checked with the key that signed it.
-- ---------------------------------------------------------------------------------------
create table public.signing_keys (
  key_id text primary key check (key_id ~ '^cv-[0-9]{8}-[0-9a-f]{8}$'),
  algorithm text not null default 'Ed25519' check (algorithm = 'Ed25519'),
  public_key text not null unique check (public_key ~ '^[A-Za-z0-9_-]{43}$'),
  active_from timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check (retired_at is null or retired_at >= active_from)
);
comment on table public.signing_keys is
  'CV signing keys (PRD 5.18): raw Ed25519 public keys, base64url. Never deleted; one active at a time.';
create unique index signing_keys_one_active_idx on public.signing_keys ((true)) where retired_at is null;

alter table public.signing_keys enable row level security;
revoke all on table public.signing_keys from anon, authenticated;
grant select on table public.signing_keys to anon, authenticated;
-- Public keys are published at /.well-known/skilient-cv-keys.json.
create policy signing_keys_read on public.signing_keys for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------
-- CV settings: which sections, in what order, and what the header shows.
-- ---------------------------------------------------------------------------------------
create type public.cv_visibility as enum ('private', 'link', 'recruiters');

create function private.cv_all_sections()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['summary', 'skills', 'projects', 'open_source', 'endorsements', 'credentials', 'education'] $$;

create function private.cv_sections_valid(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p <@ private.cv_all_sections()
     and cardinality(p) = (select count(distinct x) from unnest(p) x);
$$;

create table public.cv_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sections text[] not null default private.cv_all_sections() check (private.cv_sections_valid(sections)),
  -- null: follow the leaderboard setting (opted out = off) (decisions.md 2026-10-01).
  show_percentile boolean,
  show_email boolean not null default false,
  visibility public.cv_visibility not null default 'link',
  updated_at timestamptz not null default now()
);
comment on table public.cv_settings is
  'Per-student CV choices (PRD 5.18). Missing row = defaults. Applied at the next version.';

alter table public.cv_settings enable row level security;
revoke all on table public.cv_settings from anon, authenticated;
grant select on table public.cv_settings to authenticated;
create policy cv_settings_owner_read on public.cv_settings for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- CV records: one per signed version. The signature covers the RFC 8785 canonical JSON of
-- {v, code, key_id, issued_at, expires_at, snapshot}; snapshot_hash is its SHA-256 (hex).
-- content_hash is over the snapshot alone and only detects "nothing changed" for the
-- monthly refresh. user_id is kept null (not deleted) when an account goes, so the verify
-- page can still say Revoked (slice 2 wipes the snapshot then).
-- ---------------------------------------------------------------------------------------
create table public.cv_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  code text not null unique check (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$'),
  version integer not null check (version >= 1),
  template text not null default 'standard' check (template ~ '^[a-z]{3,20}$'),
  snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  signature text not null check (signature ~ '^[A-Za-z0-9_-]{86}$'),
  key_id text not null references public.signing_keys (key_id),
  source text not null check (source in ('first', 'monthly', 'on_demand', 'reissue')),
  issued_at timestamptz not null check (issued_at = date_trunc('second', issued_at)),
  expires_at timestamptz not null check (expires_at > issued_at),
  superseded_by uuid references public.cv_records (id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or revoked_reason in ('owner', 'staff', 'suspended', 'deleted')),
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, version),
  check ((revoked_at is null) = (revoked_reason is null)),
  check (snapshot is not null or revoked_at is not null)
);
comment on table public.cv_records is
  'Signed CV versions (PRD 5.18). Written only by the cv-sign Edge Function through private.cv_issue_commit().';
create index cv_records_user_idx on public.cv_records (user_id, version desc);
create index cv_records_key_idx on public.cv_records (key_id);
create index cv_records_superseded_idx on public.cv_records (superseded_by) where superseded_by is not null;
create index cv_records_revoked_by_idx on public.cv_records (revoked_by) where revoked_by is not null;

alter table public.cv_records enable row level security;
revoke all on table public.cv_records from anon, authenticated;
grant select on table public.cv_records to authenticated;
create policy cv_records_owner_read on public.cv_records for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- The snapshot (CvSnapshotV1 in lib/cv/types.ts). Integers and strings only, so the
-- canonical form never depends on how a decimal is printed.
-- ---------------------------------------------------------------------------------------
create function private.cv_join_names(p text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case cardinality(p)
           when 0 then null
           when 1 then p[1]
           else array_to_string(p[1:cardinality(p) - 1], ', ') || ' and ' || p[cardinality(p)]
         end;
$$;

create function private.cv_eligible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
      join auth.users u on u.id = p.user_id
     where p.user_id = p_user and p.role = 'student' and p.onboarding_complete
       and p.username is not null and p.university_id is not null
       and (u.banned_until is null or u.banned_until <= now())
  );
$$;

create function private.cv_snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    select us.skill_id, sk.name, us.level::integer as level, us.repos, us.active_days,
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
           'id', skill_id, 'name', name, 'level', level,
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
$$;

-- ---------------------------------------------------------------------------------------
-- Issuing: prepare (snapshot + times) → the Edge Function signs → commit. Both steps are
-- for the Edge Function's direct connection only.
-- ---------------------------------------------------------------------------------------
create function private.cv_issue_prepare(p_user uuid)
returns table (snapshot jsonb, content_hash text, latest_content_hash text, issued_at text, expires_at text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snap jsonb := private.cv_snapshot(p_user);
  v_now timestamptz := date_trunc('second', now());
begin
  if v_snap is null then
    return;
  end if;
  return query
  select v_snap,
         encode(extensions.digest(convert_to(v_snap::text, 'UTF8'), 'sha256'), 'hex'),
         (select r.content_hash from public.cv_records r
           where r.user_id = p_user and r.revoked_at is null order by r.version desc limit 1),
         to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         to_char((v_now + interval '12 months') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
end;
$$;

-- Returns the new record's id, or null when nothing was issued (a first CV that already
-- exists, or an unchanged monthly snapshot). A code collision raises unique_violation and
-- the caller retries with a new code.
create function private.cv_issue_commit(
  p_user uuid, p_code text, p_key_id text, p_issued_at timestamptz, p_expires_at timestamptz,
  p_snapshot jsonb, p_content_hash text, p_snapshot_hash text, p_signature text, p_source text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('cv:' || p_user::text, 0));
  if not private.cv_eligible(p_user) then
    return null;
  end if;
  if p_source = 'first' and exists (select 1 from public.cv_records where user_id = p_user) then
    return null;
  end if;
  if p_source = 'monthly' and p_content_hash is not distinct from (
       select r.content_hash from public.cv_records r
        where r.user_id = p_user and r.revoked_at is null order by r.version desc limit 1) then
    return null;
  end if;
  if not exists (select 1 from public.signing_keys k where k.key_id = p_key_id) then
    raise exception 'unknown signing key' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.cv_records where user_id = p_user;
  insert into public.cv_records (user_id, code, version, snapshot, content_hash, snapshot_hash, signature,
                                 key_id, source, issued_at, expires_at)
  values (p_user, p_code, v_version, p_snapshot, p_content_hash, p_snapshot_hash, p_signature,
          p_key_id, p_source, p_issued_at, p_expires_at)
  returning id into v_id;

  update public.cv_records set superseded_by = v_id
   where user_id = p_user and id <> v_id and superseded_by is null;
  return v_id;
end;
$$;

-- The active key's id and private half (PKCS#8, base64), for the Edge Function only.
create function private.cv_active_key()
returns table (key_id text, private_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.key_id, s.decrypted_secret
    from public.signing_keys k
    join vault.decrypted_secrets s on s.name = 'cv_signing_key:' || k.key_id
   where k.retired_at is null;
$$;

-- Installs a key generated by the Edge Function: the old key is retired and its private
-- half deleted from Vault (it can no longer sign; its public half stays for checking).
create function private.cv_install_key(p_key_id text, p_public_key text, p_private_key text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform pg_advisory_xact_lock(hashtextextended('cv:signing-key', 0));
  select key_id into v_old from public.signing_keys where retired_at is null;
  if v_old is not null then
    update public.signing_keys set retired_at = now() where key_id = v_old;
    delete from vault.secrets where name = 'cv_signing_key:' || v_old;
  end if;
  perform vault.create_secret(p_private_key, 'cv_signing_key:' || p_key_id, 'CV signing key (Ed25519, PKCS#8)');
  insert into public.signing_keys (key_id, public_key) values (p_key_id, p_public_key);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The worker: a bearer secret pg_cron and cv_rotate_key() use to call cv-sign; the
-- monthly refresh queue; a wake each minute while the queue has work.
-- ---------------------------------------------------------------------------------------
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cv_worker_secret',
  'Bearer secret pg_cron uses to call the cv-sign Edge Function'
)
where not exists (select 1 from vault.secrets where name = 'cv_worker_secret');

select pgmq.create('cv_jobs');

create function private.cv_call_worker(p_body jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cv_worker_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/cv-sign',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := p_body,
    timeout_milliseconds := 5000
  );
end;
$$;

create function private.wake_cv_worker()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from pgmq.q_cv_jobs where vt <= now()) then
    perform private.cv_call_worker('{"action":"drain"}'::jsonb);
  end if;
end;
$$;

-- Run once by hand to create the first key, and again for an emergency rotation
-- (decisions.md 2026-10-01: no automatic yearly rotation). Asynchronous: check
-- /.well-known/skilient-cv-keys.json a few seconds later.
create function private.cv_rotate_key()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if private.cv_call_worker('{"action":"rotate"}'::jsonb) is null then
    return 'not sent: set the Vault secret project_url first (docs/setup-checklist.md)';
  end if;
  return 'rotation requested: check /.well-known/skilient-cv-keys.json';
end;
$$;

-- Monthly refresh (PRD 5.18): at 00:30 PKT on the 1st, every student with a CV who isn't
-- suspended is queued; the worker issues a new version only if the snapshot changed.
create function private.cv_refresh_start(p_force boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_n integer := 0;
begin
  if not p_force and extract(day from now() at time zone 'Asia/Karachi') <> 1 then
    return 0;
  end if;
  v_run := public.job_run_start('cv-refresh');
  begin
    with students as (
      select distinct r.user_id from public.cv_records r
       where r.user_id is not null and private.cv_eligible(r.user_id)
    )
    select count(*)::integer into v_n
      from students s
     cross join lateral pgmq.send('cv_jobs', jsonb_build_object('user_id', s.user_id, 'source', 'monthly')) q;
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return 0;
  end;
  perform public.job_run_finish(v_run, 'succeeded', v_n);
  perform private.wake_cv_worker();
  return v_n;
end;
$$;

revoke all on function private.cv_all_sections(), private.cv_sections_valid(text[]), private.cv_join_names(text[]),
  private.cv_eligible(uuid), private.cv_snapshot(uuid), private.cv_issue_prepare(uuid),
  private.cv_issue_commit(uuid, text, text, timestamptz, timestamptz, jsonb, text, text, text, text),
  private.cv_active_key(), private.cv_install_key(text, text, text), private.cv_call_worker(jsonb),
  private.wake_cv_worker(), private.cv_rotate_key(), private.cv_refresh_start(boolean) from public;

-- 19:30 UTC on the last days of a month is 00:30 PKT on the 1st; the function checks the day.
select cron.schedule('cv-refresh', '30 19 28-31 * *', $$select private.cv_refresh_start()$$);
select cron.schedule('cv-worker', '* * * * *', $$select private.wake_cv_worker()$$);
