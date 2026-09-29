-- Phase 4, slice 2: L3 and L4 levels (PRD 5.5 "Evidence levels", 5.16; decisions.md
-- 2026-09-30).
--   L3 Corroborated: a merged pull request by the student, touching the skill, in a repository
--      they don't own, merged or approved by another human (not a bot, account at least 90
--      days old at merge time); or a teammate-confirmed contribution entry tagged with the skill
--      (a confirmed "before Skilient" commit entry counts for the skills found in that commit).
--   L4 Demonstrated: evidence-tied endorsements of the skill from at least 2 different
--      teammates, from any of the student's ventures (code checks join in slice 4).
-- Levels are computed from all current evidence: L1-L2 from commits, L3-L4 from these proofs,
-- which survive a GitHub disconnect. A skill shows its highest level.

-- ---------------------------------------------------------------------------
-- Contribution entries carry up to 3 of the venture's skills
-- ---------------------------------------------------------------------------
alter table public.contributions add column skill_ids text[] not null default '{}'
  check (cardinality(skill_ids) <= 3);
comment on column public.contributions.skill_ids is
  'Skills this entry shows (from the venture''s tags). A teammate''s confirmation makes them L3 for the author.';

-- The skills an entry may carry: distinct, at most 3, each one of the venture's tags.
create function private.entry_skills(p_venture uuid, p_skills text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skills text[] := coalesce((select array_agg(distinct s order by s) from unnest(coalesce(p_skills, '{}')) s), '{}');
begin
  if cardinality(v_skills) > 3 then
    raise exception 'tag up to 3 skills' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(v_skills) s
              where not s = any (coalesce((select v.skill_ids from public.ventures v where v.id = p_venture), '{}'))) then
    raise exception 'tag only the venture''s own skills' using errcode = '22023';
  end if;
  return v_skills;
end;
$$;
revoke all on function private.entry_skills(uuid, text[]) from public;

drop function public.log_contribution(uuid, public.contribution_kind, text, text, numeric);
drop function public.correct_contribution(uuid, public.contribution_kind, text, text, numeric);
drop function private.log_contribution(uuid, public.contribution_kind, text, text, numeric);
drop function private.correct_contribution(uuid, public.contribution_kind, text, text, numeric);

create function private.log_contribution(p_venture uuid, p_kind public.contribution_kind, p_description text,
                                         p_evidence_url text, p_hours numeric, p_skill_ids text[])
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
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, hours, skill_ids)
  values (p_venture, v_user, p_kind, btrim(p_description), nullif(btrim(coalesce(p_evidence_url, '')), ''), p_hours,
          private.entry_skills(p_venture, p_skill_ids))
  returning id into v_id;
  return v_id;
end;
$$;

-- A correction replaces what the timeline shows (its skills too); the original stays.
create function private.correct_contribution(p_original uuid, p_kind public.contribution_kind, p_description text,
                                             p_evidence_url text, p_hours numeric, p_skill_ids text[])
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
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, hours, corrects_id, skill_ids)
  values (o.venture_id, v_user, p_kind, btrim(p_description), nullif(btrim(coalesce(p_evidence_url, '')), ''), p_hours, o.id,
          private.entry_skills(o.venture_id, p_skill_ids))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function
  private.log_contribution(uuid, public.contribution_kind, text, text, numeric, text[]),
  private.correct_contribution(uuid, public.contribution_kind, text, text, numeric, text[])
  from public;
grant execute on function
  private.log_contribution(uuid, public.contribution_kind, text, text, numeric, text[]),
  private.correct_contribution(uuid, public.contribution_kind, text, text, numeric, text[])
  to authenticated;

create function public.log_contribution(p_venture uuid, p_kind public.contribution_kind, p_description text,
                                        p_evidence_url text default null, p_hours numeric default null,
                                        p_skill_ids text[] default '{}')
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.log_contribution(p_venture, p_kind, p_description, p_evidence_url, p_hours, p_skill_ids) $$;

create function public.correct_contribution(p_original uuid, p_kind public.contribution_kind, p_description text,
                                            p_evidence_url text default null, p_hours numeric default null,
                                            p_skill_ids text[] default '{}')
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.correct_contribution(p_original, p_kind, p_description, p_evidence_url, p_hours, p_skill_ids) $$;

revoke all on function
  public.log_contribution(uuid, public.contribution_kind, text, text, numeric, text[]),
  public.correct_contribution(uuid, public.contribution_kind, text, text, numeric, text[])
  from public, anon;
grant execute on function
  public.log_contribution(uuid, public.contribution_kind, text, text, numeric, text[]),
  public.correct_contribution(uuid, public.contribution_kind, text, text, numeric, text[])
  to authenticated;

-- The timeline shows the current version's skills.
create or replace view public.contributions_with_status
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
       ((o.source = 'github' and not o.before_venture)
         or exists (select 1 from public.contribution_confirmations k where k.contribution_id = e.id)) as peer_verified,
       exists (select 1 from public.contribution_confirmations k
                where k.contribution_id = e.id and k.confirmer_id = (select auth.uid())) as confirmed_by_me,
       exists (select 1 from public.venture_members m where m.venture_id = o.venture_id and m.user_id = o.user_id)
         as by_member,
       o.before_venture,
       e.skill_ids
  from public.contributions o
  cross join lateral (
    select c.* from public.contributions c
     where c.id = o.id or c.corrects_id = o.id
     order by c.created_at desc, (c.id = o.id)
     limit 1
  ) e
 where o.corrects_id is null;

-- The skills an entry shows: its current version's tags, or for a GitHub entry the skills
-- detected in that commit.
create function private.entry_shows_skill(p_entry uuid, p_skill text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.contributions o
      cross join lateral (
        select c.skill_ids from public.contributions c
         where c.id = o.id or c.corrects_id = o.id
         order by c.created_at desc, (c.id = o.id)
         limit 1
      ) e
     where o.id = p_entry and o.corrects_id is null
       and (p_skill = any (e.skill_ids)
            or (o.source = 'github' and exists (
                  select 1 from public.skill_evidence se
                   where se.user_id = o.user_id and se.sha = o.commit_sha and se.skill_id = p_skill)))
  );
$$;
revoke all on function private.entry_shows_skill(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Merged pull requests (the GitHub `prs` stage). Not tied to the shared repositories, so
-- they survive a disconnect (PRD 5.5: L3 and L4 evidence survives). Owner-only.
-- ---------------------------------------------------------------------------
create table public.github_pull_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  repo_github_id bigint not null,
  number integer not null check (number > 0),
  pr_github_id bigint not null,
  repo_full_name text not null check (char_length(repo_full_name) between 3 and 140),
  repo_private boolean not null,
  merged_at timestamptz not null,
  -- The other person whose merge or approval corroborates it (a GitHub account id).
  approver_github_id bigint,
  counted boolean not null,
  exclusion text check (exclusion is null or exclusion in ('own_repo', 'no_other_human', 'young_account')),
  files integer not null default 0 check (files >= 0),
  seen_at timestamptz not null default now(),
  primary key (user_id, repo_github_id, number),
  check (counted = (exclusion is null)),
  check (not counted or approver_github_id is not null)
);
comment on table public.github_pull_requests is
  'The student''s merged pull requests (PRD 5.5 L3). counted = in someone else''s repository, merged or approved by another human.';
create index github_pull_requests_counted_idx on public.github_pull_requests (user_id, merged_at) where counted;

create table public.github_pr_skills (
  user_id uuid not null,
  repo_github_id bigint not null,
  number integer not null,
  skill_id text not null references public.skills (id),
  paths text[] not null default '{}' check (cardinality(paths) <= 10),
  primary key (user_id, repo_github_id, number, skill_id),
  foreign key (user_id, repo_github_id, number)
    references public.github_pull_requests (user_id, repo_github_id, number) on delete cascade
);
create index github_pr_skills_skill_idx on public.github_pr_skills (skill_id);

alter table public.github_pull_requests enable row level security;
alter table public.github_pr_skills enable row level security;
revoke all on table public.github_pull_requests, public.github_pr_skills from anon, authenticated;
grant select on table public.github_pull_requests, public.github_pr_skills to authenticated;
create policy github_pull_requests_read_own on public.github_pull_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy github_pr_skills_read_own on public.github_pr_skills for select to authenticated
  using (user_id = (select auth.uid()));

-- The worker records one pull request with the skills its files show.
-- p: {repo_github_id, number, pr_github_id, repo_full_name, repo_private, merged_at,
--     approver_github_id, exclusion, files, skills: [{skill, paths}]}
create function private.record_pull_request(p_user uuid, p jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_repo bigint := (p ->> 'repo_github_id')::bigint;
  v_number integer := (p ->> 'number')::integer;
  v_exclusion text := nullif(p ->> 'exclusion', '');
begin
  if not exists (select 1 from public.github_accounts where user_id = p_user and revoked_at is null) then
    return false;
  end if;
  insert into public.github_pull_requests (user_id, repo_github_id, number, pr_github_id, repo_full_name, repo_private,
                                           merged_at, approver_github_id, counted, exclusion, files)
  values (p_user, v_repo, v_number, (p ->> 'pr_github_id')::bigint, p ->> 'repo_full_name',
          coalesce((p ->> 'repo_private')::boolean, true), (p ->> 'merged_at')::timestamptz,
          case when v_exclusion is null then (p ->> 'approver_github_id')::bigint end,
          v_exclusion is null, v_exclusion, coalesce((p ->> 'files')::integer, 0))
  on conflict (user_id, repo_github_id, number) do update
    set pr_github_id = excluded.pr_github_id,
        repo_full_name = excluded.repo_full_name,
        repo_private = excluded.repo_private,
        merged_at = excluded.merged_at,
        approver_github_id = excluded.approver_github_id,
        counted = excluded.counted,
        exclusion = excluded.exclusion,
        files = excluded.files,
        seen_at = now();
  delete from public.github_pr_skills where user_id = p_user and repo_github_id = v_repo and number = v_number;
  insert into public.github_pr_skills (user_id, repo_github_id, number, skill_id, paths)
  select p_user, v_repo, v_number, s.skill_id, (array_agg(distinct s.path))[1:10]
    from jsonb_to_recordset(coalesce(p -> 'skills', '[]'::jsonb)) as s(skill_id text, path text)
    join public.skills k on k.id = s.skill_id
   group by s.skill_id;
  perform private.recompute_user_skills(p_user);
  return true;
end;
$$;
revoke all on function private.record_pull_request(uuid, jsonb) from public;

-- Pull requests the worker has already recorded, so a nightly search only fetches new ones.
create function private.known_pull_requests(p_user uuid)
returns table (repo_full_name text, number integer, counted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(repo_full_name), number, counted from public.github_pull_requests where user_id = p_user;
$$;
revoke all on function private.known_pull_requests(uuid) from public;

-- A merged pull request or an approving review on one: queue that pull request for its author.
create function private.github_webhook_pr(p_delivery_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event private.github_webhook_events;
  v_author bigint;
  v_user uuid;
  v_repo text;
  v_number integer;
begin
  select * into v_event from private.github_webhook_events where delivery_id = p_delivery_id;
  if not found then
    return '[]'::jsonb;
  end if;
  v_repo := v_event.payload -> 'repository' ->> 'full_name';
  v_number := (v_event.payload -> 'pull_request' ->> 'number')::integer;
  v_author := (v_event.payload -> 'pull_request' -> 'user' ->> 'id')::bigint;
  if v_repo is null or v_number is null or v_author is null then
    return '[]'::jsonb;
  end if;
  if not ((v_event.event = 'pull_request' and v_event.action = 'closed'
           and coalesce((v_event.payload -> 'pull_request' ->> 'merged')::boolean, false))
          or (v_event.event = 'pull_request_review' and v_event.action = 'submitted'
              and lower(v_event.payload -> 'review' ->> 'state') = 'approved')) then
    return '[]'::jsonb;
  end if;
  select a.user_id into v_user from public.github_accounts a where a.github_id = v_author and a.revoked_at is null;
  if v_user is null then
    return '[]'::jsonb;
  end if;
  return jsonb_build_array(jsonb_build_object('stage', 'pr', 'user_id', v_user, 'repo', v_repo, 'number', v_number));
end;
$$;
revoke all on function private.github_webhook_pr(uuid) from public;

-- ---------------------------------------------------------------------------
-- Endorsement evidence must show the skill it vouches for
-- ---------------------------------------------------------------------------
create or replace function private.endorse(p_endorsee uuid, p_venture uuid, p_items jsonb, p_note text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v public.ventures;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_count integer;
  v_given integer;
  v_month integer;
  v_item jsonb;
  v_skill text;
  v_evidence uuid;
  v_names text[] := '{}';
  v_first uuid;
  v_id uuid;
begin
  if p_endorsee is null or p_endorsee = v_me then
    raise exception 'you can''t endorse yourself' using errcode = '42501';
  end if;
  -- Serialise each endorser's writes so the limits hold under parallel calls.
  perform pg_advisory_xact_lock(hashtextextended('endorse:' || v_me::text, 0));

  select * into v from public.ventures where id = p_venture;
  if not found or not private.is_venture_member(p_venture) then
    raise exception 'venture not found' using errcode = 'P0002';
  end if;
  -- A teammate blocked either way is hidden from the team, so they aren't found here either.
  if not exists (select 1 from public.venture_members m where m.venture_id = p_venture and m.user_id = p_endorsee)
     or private.is_blocked(v_me, p_endorsee) then
    raise exception 'teammate not found' using errcode = 'P0002';
  end if;
  if v.status not in ('in_progress', 'completed') then
    raise exception 'endorsements open once the venture is in progress' using errcode = '55000';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'choose at least one skill' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count = 0 then
    raise exception 'choose at least one skill' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'skill') from jsonb_array_elements(p_items) e) <> v_count then
    raise exception 'each skill once' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'keep the note under 280 characters' using errcode = '23514';
  end if;

  select count(*)::integer into v_given from public.endorsements
   where endorser_id = v_me and endorsee_id = p_endorsee and venture_id = p_venture;
  if v_given + v_count > private.endorsement_limit('per_teammate_per_venture') then
    raise exception 'you can endorse up to % skills per teammate per venture',
      private.endorsement_limit('per_teammate_per_venture') using errcode = '23514';
  end if;
  select count(*)::integer into v_month from public.endorsements
   where endorser_id = v_me and created_at >= private.pk_month_start();
  if v_month + v_count > private.endorsement_limit('per_month') then
    raise exception 'you can give up to % endorsements a month', private.endorsement_limit('per_month')
      using errcode = '23514';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_skill := v_item ->> 'skill';
    if v_skill is null or not private.endorsable_skill(p_venture, p_endorsee, v_skill) then
      raise exception 'that skill isn''t one of the venture''s skills or theirs' using errcode = '22023';
    end if;
    if exists (select 1 from public.endorsements
                where endorser_id = v_me and endorsee_id = p_endorsee and venture_id = p_venture and skill_id = v_skill) then
      raise exception 'you already endorsed them for %', (select name from public.skills where id = v_skill)
        using errcode = '23505';
    end if;
    v_evidence := null;
    if nullif(v_item ->> 'evidence', '') is not null then
      begin
        v_evidence := (v_item ->> 'evidence')::uuid;
      exception when invalid_text_representation then
        raise exception 'that evidence isn''t one of their entries in this venture' using errcode = '22023';
      end;
      if not exists (select 1 from public.contributions c
                      where c.id = v_evidence and c.venture_id = p_venture and c.user_id = p_endorsee
                        and c.corrects_id is null) then
        raise exception 'that evidence isn''t one of their entries in this venture' using errcode = '22023';
      end if;
      if not private.entry_shows_skill(v_evidence, v_skill) then
        raise exception 'that entry doesn''t show %', (select name from public.skills where id = v_skill)
          using errcode = '22023';
      end if;
    end if;
    insert into public.endorsements (endorser_id, endorsee_id, venture_id, skill_id, evidence_id, note)
    values (v_me, p_endorsee, p_venture, v_skill, v_evidence, v_note)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    v_names := v_names || (select name from public.skills where id = v_skill);
  end loop;

  -- The recipient's own username lets the notification open their profile's endorsements.
  perform private.notify(p_endorsee, v_me, 'endorsement_received', 'endorsement', v_first,
                         private.venture_data(p_venture)
                           || jsonb_build_object('skills', to_jsonb(v_names),
                                                 'username', (select username from public.profiles where user_id = p_endorsee)));
  return v_count;
end;
$$;

-- The sheet lists each entry with the skills it shows, so evidence is offered per skill.
create or replace function private.endorse_options(p_venture uuid)
returns table (
  user_id uuid, full_name text, username text, avatar_path text, skills jsonb, given text[], evidence jsonb,
  month_left integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v public.ventures;
  v_left integer;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or not private.is_venture_member(p_venture) or v.status not in ('in_progress', 'completed') then
    return;
  end if;
  v_left := greatest(0, private.endorsement_limit('per_month')
                        - (select count(*)::integer from public.endorsements
                            where endorser_id = v_me and created_at >= private.pk_month_start()));
  return query
  select m.user_id, p.full_name,
         case when private.can_view_profile(m.user_id) then p.username end,
         case when private.can_view_profile(m.user_id) then p.avatar_path end,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'from_venture', s.id = any (v.skill_ids))
                            order by (s.id = any (v.skill_ids)) desc, s.name)
             from public.skills s
            where s.retired_at is null
              and (s.id = any (v.skill_ids)
                   or (private.can_view_profile(m.user_id)
                       and exists (select 1 from public.user_skills u
                                    where u.user_id = m.user_id and u.skill_id = s.id and u.level >= 1)))
         ), '[]'::jsonb),
         coalesce((select array_agg(e.skill_id order by e.skill_id) from public.endorsements e
                    where e.endorser_id = v_me and e.endorsee_id = m.user_id and e.venture_id = p_venture), '{}'),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'description', c.description, 'kind', c.kind, 'source', c.source,
                    'peer_verified', c.peer_verified,
                    'skills', to_jsonb(c.skill_ids || coalesce((
                       select array_agg(distinct se.skill_id) from public.skill_evidence se
                        where c.source = 'github' and se.user_id = c.user_id and se.sha = c.commit_sha), '{}')))
                    order by c.created_at desc)
             from public.contributions_with_status c
            where c.venture_id = p_venture and c.user_id = m.user_id
         ), '[]'::jsonb),
         v_left
    from public.venture_members m
    join public.profiles p on p.user_id = m.user_id
   where m.venture_id = p_venture and m.user_id <> v_me and not private.is_blocked(v_me, m.user_id)
   order by m.joined_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Levels from all current evidence
-- ---------------------------------------------------------------------------
-- L3 proofs: counted pull requests, and teammate-confirmed entries (tagged skills, or the
-- skills found in a confirmed "before Skilient" commit).
create function private.l3_skills(p_user uuid)
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
                  where k.contribution_id = o.id and k.confirmer_id <> o.user_id);
$$;
revoke all on function private.l3_skills(uuid) from public;

-- L4 proofs: at least 2 different teammates endorsed the skill, each tied to an entry that
-- shows it, from any of the student's ventures. Hidden endorsements don't count.
create function private.l4_skills(p_user uuid)
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
  having count(distinct e.endorser_id) >= private.endorsement_limit('peer_verified_min');
$$;
revoke all on function private.l4_skills(uuid) from public;

create or replace function private.recompute_user_skills(p_user uuid)
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
           a.last_used as last_used_at
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
           g.last_used_at
      from (select skill_id from github union select skill_id from proofs) k
      join public.skills s on s.id = k.skill_id and s.retired_at is null
      left join github g on g.skill_id = k.skill_id
  ),
  dropped as (
    delete from public.user_skills u
     where u.user_id = p_user
       and not exists (select 1 from computed c where c.skill_id = u.skill_id)
  )
  insert into public.user_skills (user_id, skill_id, level, active_days, lines, hits, repos, last_used_at)
  select p_user, skill_id, level, active_days, lines, hits, repos, last_used_at from computed
  on conflict (user_id, skill_id) do update
    set level = excluded.level,
        active_days = excluded.active_days,
        lines = excluded.lines,
        hits = excluded.hits,
        repos = excluded.repos,
        last_used_at = excluded.last_used_at,
        updated_at = now()
  where (public.user_skills.level, public.user_skills.active_days, public.user_skills.lines, public.user_skills.hits,
         public.user_skills.repos, public.user_skills.last_used_at)
        is distinct from
        (excluded.level, excluded.active_days, excluded.lines, excluded.hits, excluded.repos, excluded.last_used_at);

  select count(*) into v_found from public.user_skills where user_id = p_user and level >= 1;
  update public.sync_jobs set skills_found = v_found
   where user_id = p_user and status in ('queued', 'running');
  return v_found;
end;
$$;

-- Proof changes recompute the student's levels at once.
create function private.recompute_endorsees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select distinct endorsee_id from new_rows loop
    perform private.recompute_user_skills(v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.recompute_endorsees() from public;
create trigger endorsements_recompute_insert after insert on public.endorsements
  referencing new table as new_rows
  for each statement execute function private.recompute_endorsees();
create trigger endorsements_recompute_update after update on public.endorsements
  referencing new table as new_rows
  for each statement execute function private.recompute_endorsees();

create function private.recompute_confirmed_authors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct c.user_id from new_rows n join public.contributions c on c.id = n.contribution_id
  loop
    perform private.recompute_user_skills(v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.recompute_confirmed_authors() from public;
create trigger contribution_confirmations_recompute after insert on public.contribution_confirmations
  referencing new table as new_rows
  for each statement execute function private.recompute_confirmed_authors();

-- A correction replaces the confirmed version, so its author's levels may drop until a
-- teammate confirms again.
create function private.recompute_corrected_authors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select distinct user_id from new_rows where corrects_id is not null loop
    perform private.recompute_user_skills(v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.recompute_corrected_authors() from public;
create trigger contributions_recompute_corrections after insert on public.contributions
  referencing new table as new_rows
  for each statement execute function private.recompute_corrected_authors();

-- ---------------------------------------------------------------------------
-- What each level rests on, for the owner's skill drawer
-- ---------------------------------------------------------------------------
create function private.my_skill_proofs(p_skill text)
returns table (
  kind text, level smallint, title text, detail text, url text, venture_id uuid, occurred_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Merged pull requests (the owner sees private repository names).
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
  -- Confirmed entries tagged with the skill.
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
  -- Endorsements tied to an entry that shows the skill.
  select 'endorsement', 4::smallint, pr.full_name, v.title, null, v.id, e.created_at
    from public.endorsements e
    join public.profiles pr on pr.user_id = e.endorser_id
    join public.ventures v on v.id = e.venture_id
   where e.endorsee_id = (select auth.uid()) and e.skill_id = p_skill and not e.hidden
     and e.evidence_id is not null and private.entry_shows_skill(e.evidence_id, e.skill_id)
   order by 7 desc;
$$;
revoke all on function private.my_skill_proofs(text) from public;
grant execute on function private.my_skill_proofs(text) to authenticated;

create function public.my_skill_proofs(p_skill text)
returns table (
  kind text, level smallint, title text, detail text, url text, venture_id uuid, occurred_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from private.my_skill_proofs(p_skill) $$;
revoke all on function public.my_skill_proofs(text) from public, anon;
grant execute on function public.my_skill_proofs(text) to authenticated;
