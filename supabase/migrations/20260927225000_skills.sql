-- Phase 2 slice 2: the skill taxonomy (PRD 5.5 "Skill taxonomy and detectors").
-- Curated in lib/github/taxonomy/skills.yaml and loaded by generated sync migrations
-- (scripts/skills.mjs). Ids are stable slugs; a skill dropped from the YAML is retired,
-- never deleted, so evidence and levels keep their reference.

create type public.skill_category as enum ('language', 'framework', 'library', 'tool', 'platform', 'practice');

create table public.skills (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null check (char_length(name) between 1 and 60),
  category public.skill_category not null,
  parent_id text references public.skills (id) on delete set null,
  -- Expanded detectors run by the github-worker (supabase/functions/_shared/github/detectors.ts).
  detectors jsonb not null default '{}'::jsonb check (jsonb_typeof(detectors) = 'object'),
  taxonomy_version integer not null check (taxonomy_version >= 1),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.skills is 'Skill taxonomy (PRD 5.5), owned by Skilient Trust staff. Readable by every signed-in user.';
create index skills_parent_idx on public.skills (parent_id);
create trigger skills_updated_at before update on public.skills
  for each row execute function private.set_updated_at();

alter table public.skills enable row level security;
revoke all on table public.skills from anon, authenticated;
grant select on table public.skills to authenticated;
-- Skill names and categories are public knowledge inside the platform; writes only via sync
-- migrations now and the ops taxonomy editor later (phase 11).
create policy skills_read_signed_in on public.skills for select to authenticated using (true);

-- Upserts the taxonomy by id, sets parents, and retires skills no longer listed.
-- p_skills: [{id, name, category, parent, detectors}]
create function private.sync_skills(p_version integer, p_skills jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.skills (id, name, category, detectors, taxonomy_version, retired_at)
  select s ->> 'id', s ->> 'name', (s ->> 'category')::public.skill_category,
         coalesce(s -> 'detectors', '{}'::jsonb), p_version, null
    from jsonb_array_elements(p_skills) s
  on conflict (id) do update
    set name = excluded.name,
        category = excluded.category,
        detectors = excluded.detectors,
        taxonomy_version = excluded.taxonomy_version,
        retired_at = null;

  update public.skills k
     set parent_id = s ->> 'parent'
    from jsonb_array_elements(p_skills) s
   where k.id = s ->> 'id' and k.parent_id is distinct from s ->> 'parent';

  update public.skills
     set retired_at = now()
   where retired_at is null
     and id not in (select s ->> 'id' from jsonb_array_elements(p_skills) s);
end;
$$;
revoke all on function private.sync_skills(integer, jsonb) from public;
