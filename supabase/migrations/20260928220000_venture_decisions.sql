-- Owner decisions of 2026-09-28 (docs/decisions.md) on the venture slices:
-- (a) team cards show only what each member's own profile visibility allows, and never
--     cross a block in either direction;
-- (d) GitHub import also takes a member's counted commits from up to 6 months before the
--     venture was created, marked "before Skilient"; those count only once another member
--     confirms them. Commits made after creation stay verified as they are.

-- ---------------------------------------------------------------------------
-- (a) Team cards
-- ---------------------------------------------------------------------------
-- The profiles_select_visible rule as a function, for definer functions that show cards.
create function private.can_view_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.user_id = p_user
       and (
         p.user_id = (select auth.uid())
         or (
           not private.is_blocked_with(p.user_id)
           and (
             p.visibility = 'global'
             or (p.visibility = 'university' and p.university_id = (select private.current_university_id()))
             or (p.visibility = 'friends' and private.is_friend_of(p.user_id))
           )
         )
       )
  );
$$;
revoke all on function private.can_view_profile(uuid) from public;
grant execute on function private.can_view_profile(uuid) to authenticated;

drop function public.venture_team(uuid);
drop function private.venture_team(uuid);

-- Everyone on the team is listed by name (the venture is visible, so is its team size), but
-- the username (profile link) and photo only where the viewer may see that member's
-- profile. A member blocked with the viewer, either way, isn't listed at all.
create function private.venture_team(p_venture uuid)
returns table (user_id uuid, username text, full_name text, avatar_path text, team_role public.venture_team_role,
               joined_at timestamptz, is_owner boolean, profile_visible boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         case when private.can_view_profile(m.user_id) then p.username end,
         p.full_name,
         case when private.can_view_profile(m.user_id) then p.avatar_path end,
         m.team_role, m.joined_at, v.owner_id = m.user_id,
         private.can_view_profile(m.user_id)
    from public.venture_members m
    join public.ventures v on v.id = m.venture_id
    join public.profiles p on p.user_id = m.user_id
   where m.venture_id = p_venture
     and (m.user_id = (select auth.uid()) or not private.is_blocked_with(m.user_id))
     and (private.can_view_venture(p_venture)
          or (v.visibility = 'unlisted' and not private.is_blocked_with(v.owner_id)))
   order by (v.owner_id = m.user_id) desc, m.joined_at;
$$;
revoke all on function private.venture_team(uuid) from public;
grant execute on function private.venture_team(uuid) to authenticated;

create function public.venture_team(p_venture uuid)
returns table (user_id uuid, username text, full_name text, avatar_path text, team_role public.venture_team_role,
               joined_at timestamptz, is_owner boolean, profile_visible boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.venture_team(p_venture) $$;
revoke all on function public.venture_team(uuid) from public, anon;
grant execute on function public.venture_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (d) Commits from before the venture
-- ---------------------------------------------------------------------------
alter table public.contributions add column before_venture boolean not null default false;
alter table public.contributions add constraint contributions_before_venture_github
  check (source = 'github' or not before_venture);
comment on column public.contributions.before_venture is
  'A GitHub commit made before the venture was created (up to 6 months): shown as "before Skilient", counts once a teammate confirms it.';

-- Verified = a teammate confirmed the shown version, or a GitHub commit made since the
-- venture was created.
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
       o.before_venture
  from public.contributions o
  cross join lateral (
    select c.* from public.contributions c
     where c.id = o.id or c.corrects_id = o.id
     order by c.created_at desc, (c.id = o.id)
     limit 1
  ) e
 where o.corrects_id is null;

create or replace function private.sync_venture_commits(p_venture uuid, p_user uuid default null)
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
  insert into public.contributions (venture_id, user_id, kind, description, evidence_url, source, commit_sha,
                                    before_venture, created_at)
  select v.id, c.user_id, 'code',
         format('Commit %s to %s (%s meaningful %s)', left(c.sha, 7), v.repo_full_name, c.meaningful_lines,
                case when c.meaningful_lines = 1 then 'line' else 'lines' end),
         format('https://github.com/%s/commit/%s', v.repo_full_name, c.sha),
         'github', c.sha, c.occurred_at < v.created_at, c.occurred_at
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
$$;

-- Teammates confirm manual entries and pre-venture commits; post-creation commits are
-- verified already.
create or replace function private.confirm_contribution(p_entry uuid)
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
  if o.source = 'github' and not o.before_venture then
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

create or replace function private.verified_contributors(p_venture uuid)
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
       (o.source = 'github' and not o.before_venture)
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

-- Bring in the older commits for ventures that already link a repository.
select private.sync_venture_commits(v.id) from public.ventures v where v.repo_id is not null;
