-- Phase 2 slice 5b: read functions for the venture screens (PRD 5.7, 5.28).
-- A venture's team is public wherever the venture is: joining a venture people can see is
-- a public act, so its members show with their card (name, username, avatar, team role),
-- even when their full profile is university-only. Nothing else about them is shown.

create function private.venture_team(p_venture uuid)
returns table (user_id uuid, username text, full_name text, avatar_path text, team_role public.venture_team_role,
               joined_at timestamptz, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.username, p.full_name, p.avatar_path, m.team_role, m.joined_at, v.owner_id = m.user_id
    from public.venture_members m
    join public.ventures v on v.id = m.venture_id
    join public.profiles p on p.user_id = m.user_id
   where m.venture_id = p_venture
     and (private.can_view_venture(p_venture)
          or (v.visibility = 'unlisted' and not private.is_blocked_with(v.owner_id)))
   order by (v.owner_id = m.user_id) desc, m.joined_at;
$$;

-- /ventures (PRD 5.28 "Browse"): listed ventures only (never Unlisted), newest first, with
-- the owner's card, team size and open role slots. Keyset paging on created_at.
create function private.browse_ventures(
  p_type public.venture_type,
  p_status public.venture_status default null,
  p_open_roles boolean default false,
  p_my_university boolean default false,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table (id uuid, type public.venture_type, title text, summary text, status public.venture_status,
               visibility public.venture_visibility, stage public.venture_stage, skill_ids text[],
               university_name text, owner_username text, owner_name text, members integer, team_size smallint,
               open_slots integer, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.type, v.title, left(v.description, 220), v.status, v.visibility, v.stage, v.skill_ids,
         u.name, p.username, p.full_name,
         (select count(*)::integer from public.venture_members m where m.venture_id = v.id),
         v.team_size,
         coalesce((select sum(r.slots - r.filled)::integer from public.venture_roles r where r.venture_id = v.id), 0),
         v.created_at
    from public.ventures v
    join public.universities u on u.id = v.university_id
    join public.profiles p on p.user_id = v.owner_id
   where v.type = p_type
     and v.visibility <> 'unlisted'
     and private.can_view_venture(v.id)
     and (p_status is null or v.status = p_status)
     and (not p_open_roles or exists (select 1 from public.venture_roles r where r.venture_id = v.id and r.filled < r.slots))
     and (not p_my_university or v.university_id = private.current_university_id())
     and (p_before is null or v.created_at < p_before)
   order by v.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- The profile's Ventures tab: ventures the student is in that the viewer can see.
create function private.profile_ventures(p_user uuid)
returns table (id uuid, type public.venture_type, title text, status public.venture_status,
               team_role public.venture_team_role, is_owner boolean, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.type, v.title, v.status, m.team_role, v.owner_id = p_user, m.joined_at
    from public.venture_members m
    join public.ventures v on v.id = m.venture_id
   where m.user_id = p_user
     and (v.visibility <> 'unlisted' or p_user = (select auth.uid()) or private.is_venture_member(v.id))
     and private.can_view_venture(v.id)
   order by (v.status in ('recruiting', 'in_progress')) desc, m.joined_at desc;
$$;

revoke all on function private.venture_team(uuid), private.profile_ventures(uuid),
  private.browse_ventures(public.venture_type, public.venture_status, boolean, boolean, timestamptz, integer) from public;
grant execute on function private.venture_team(uuid), private.profile_ventures(uuid),
  private.browse_ventures(public.venture_type, public.venture_status, boolean, boolean, timestamptz, integer) to authenticated;

create function public.venture_team(p_venture uuid)
returns table (user_id uuid, username text, full_name text, avatar_path text, team_role public.venture_team_role,
               joined_at timestamptz, is_owner boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.venture_team(p_venture) $$;

create function public.browse_ventures(
  p_type public.venture_type,
  p_status public.venture_status default null,
  p_open_roles boolean default false,
  p_my_university boolean default false,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table (id uuid, type public.venture_type, title text, summary text, status public.venture_status,
               visibility public.venture_visibility, stage public.venture_stage, skill_ids text[],
               university_name text, owner_username text, owner_name text, members integer, team_size smallint,
               open_slots integer, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.browse_ventures(p_type, p_status, p_open_roles, p_my_university, p_before, p_limit) $$;

create function public.profile_ventures(p_user uuid)
returns table (id uuid, type public.venture_type, title text, status public.venture_status,
               team_role public.venture_team_role, is_owner boolean, joined_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.profile_ventures(p_user) $$;

revoke all on function public.venture_team(uuid), public.profile_ventures(uuid),
  public.browse_ventures(public.venture_type, public.venture_status, boolean, boolean, timestamptz, integer) from public, anon;
grant execute on function public.venture_team(uuid), public.profile_ventures(uuid),
  public.browse_ventures(public.venture_type, public.venture_status, boolean, boolean, timestamptz, integer) to authenticated;

-- /requests: the card (name, username) of each person the caller shares an application
-- thread or a venture invite with, and no one else.
create function private.application_people(p_ids uuid[])
returns table (user_id uuid, username text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.username, p.full_name
    from public.profiles p
   where p.user_id = any (p_ids[1:200])
     and not private.is_blocked_with(p.user_id)
     and (
       exists (select 1 from public.application_threads t
                where (t.candidate_id = (select auth.uid()) and t.owner_id = p.user_id)
                   or (t.owner_id = (select auth.uid()) and t.candidate_id = p.user_id))
       or exists (select 1 from public.venture_invites i
                   where (i.invitee_id = (select auth.uid()) and i.inviter_id = p.user_id)
                      or (i.inviter_id = (select auth.uid()) and i.invitee_id = p.user_id))
     );
$$;
revoke all on function private.application_people(uuid[]) from public;
grant execute on function private.application_people(uuid[]) to authenticated;

create function public.application_people(p_ids uuid[])
returns table (user_id uuid, username text, full_name text)
language sql stable security invoker set search_path = ''
as $$ select * from private.application_people(p_ids) $$;
revoke all on function public.application_people(uuid[]) from public, anon;
grant execute on function public.application_people(uuid[]) to authenticated;
