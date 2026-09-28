-- Phase 2 slice 4: who reads what about a skill (PRD 6: "Evidence rows are owner-only;
-- others see skill name and level per profile visibility"). Other students read the
-- level and when it was last used; the counts behind it (days, lines, hits, repositories)
-- are the owner's, through my_skills().

revoke select on table public.user_skills from authenticated;
grant select (user_id, skill_id, level, last_used_at) on table public.user_skills to authenticated;

create function private.my_skills()
returns table (
  skill_id text,
  level smallint,
  active_days integer,
  lines integer,
  hits integer,
  repos integer,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.skill_id, u.level, u.active_days, u.lines, u.hits, u.repos, u.last_used_at
    from public.user_skills u
   where u.user_id = (select auth.uid()) and u.level >= 1;
$$;
revoke all on function private.my_skills() from public;
grant execute on function private.my_skills() to authenticated;

create function public.my_skills()
returns table (
  skill_id text,
  level smallint,
  active_days integer,
  lines integer,
  hits integer,
  repos integer,
  last_used_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.my_skills();
$$;
revoke all on function public.my_skills() from public, anon;
grant execute on function public.my_skills() to authenticated;
