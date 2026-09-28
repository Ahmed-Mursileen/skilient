-- Phase 2 slice 5: ventures, join flows and lifecycle (PRD 5.7, 5.15, 5.28 "Ventures").
-- Every write goes through a security-definer function that checks auth.uid() and the
-- caller's role explicitly (CLAUDE.md), locks the venture row where membership changes,
-- and refuses anything the lifecycle doesn't allow. Tables grant reads only.
--
-- Arrives later (docs/decisions.md 2026-09-28): the venture group chat on accept (chat,
-- phase 3), invite and Shipped posts (feed, phase 3), notifications (phase 3), endorsement
-- prompts and the complexity score (phase 4), and "peer-verified contributions from 2+
-- members" before completion (contribution log, slice 6).

create type public.venture_type as enum ('project', 'startup');
create type public.venture_status as enum ('recruiting', 'in_progress', 'completed', 'abandoned');
create type public.venture_visibility as enum ('public', 'university', 'unlisted');
create type public.venture_stage as enum ('idea', 'prototype', 'launched', 'revenue');
create type public.venture_team_role as enum ('lead', 'developer', 'designer', 'researcher', 'other');
create type public.application_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'closed');
create type public.venture_invite_status as enum ('pending', 'accepted', 'declined', 'revoked');

-- PRD 5.28: at most 6 members, the owner included.
create function private.venture_max_members()
returns integer
language sql
immutable
set search_path = ''
as $$ select 6 $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.ventures (
  id uuid primary key default gen_random_uuid(),
  type public.venture_type not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  -- The owner's university when created; decides who sees a University-only venture.
  university_id uuid not null references public.universities (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null check (char_length(description) between 1 and 4000),
  status public.venture_status not null default 'recruiting',
  visibility public.venture_visibility not null default 'public',
  -- Startup extras (PRD 5.28).
  stage public.venture_stage,
  pitch_url text check (pitch_url is null or (pitch_url ~ '^https://' and char_length(pitch_url) <= 500)),
  affiliation text check (affiliation is null or char_length(affiliation) <= 120),
  skill_ids text[] not null default '{}' check (cardinality(skill_ids) <= 10),
  -- The team the owner is aiming for (2-6, the owner included).
  team_size smallint not null default 4 check (team_size between 2 and 6),
  repo_id bigint,
  repo_full_name text check (repo_full_name is null or char_length(repo_full_name) <= 140),
  completed_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type = 'startup' or (stage is null and pitch_url is null)),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'abandoned') = (abandoned_at is not null))
);
comment on table public.ventures is 'Projects and startups (PRD 5.7, 5.15, 5.28). Writes only through functions.';
create index ventures_browse_idx on public.ventures (type, status, created_at desc) where visibility <> 'unlisted';
create index ventures_university_idx on public.ventures (university_id);
create index ventures_owner_idx on public.ventures (owner_id);
create index ventures_skills_idx on public.ventures using gin (skill_ids);
create trigger ventures_updated_at before update on public.ventures
  for each row execute function private.set_updated_at();

create table public.venture_members (
  venture_id uuid not null references public.ventures (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  team_role public.venture_team_role not null default 'other',
  joined_at timestamptz not null default now(),
  primary key (venture_id, user_id)
);
create index venture_members_user_idx on public.venture_members (user_id);

create table public.venture_roles (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 60),
  skill_ids text[] not null default '{}' check (cardinality(skill_ids) <= 5),
  slots smallint not null default 1 check (slots between 1 and 5),
  filled smallint not null default 0 check (filled >= 0),
  created_at timestamptz not null default now(),
  check (filled <= slots)
);
create index venture_roles_venture_idx on public.venture_roles (venture_id);

create table public.venture_questions (
  venture_id uuid not null references public.ventures (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  body text not null check (char_length(btrim(body)) between 3 and 200),
  primary key (venture_id, position)
);

create table public.application_threads (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  role_id uuid references public.venture_roles (id) on delete set null,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  -- The venture's owner when the thread was opened; follows ownership transfers.
  owner_id uuid not null references auth.users (id) on delete cascade,
  status public.application_status not null default 'pending',
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  -- [{position, question, answer}] for the owner's up-to-3 questions.
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (candidate_id <> owner_id)
);
comment on table public.application_threads is 'Applications to join a venture. Candidate and owner only.';
-- PRD 5.7: duplicate pending applications are impossible, even under parallel clicks.
create unique index application_threads_one_pending on public.application_threads (candidate_id, venture_id)
  where status = 'pending';
create index application_threads_owner_idx on public.application_threads (owner_id, status, created_at desc);
create index application_threads_candidate_idx on public.application_threads (candidate_id, created_at desc);
create index application_threads_venture_idx on public.application_threads (venture_id, status);

create table public.application_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.application_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index application_messages_thread_idx on public.application_messages (thread_id, created_at);

create table public.venture_invites (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  status public.venture_invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (invitee_id <> inviter_id)
);
create unique index venture_invites_one_pending on public.venture_invites (venture_id, invitee_id) where status = 'pending';
create index venture_invites_invitee_idx on public.venture_invites (invitee_id, status);

create table public.venture_follows (
  venture_id uuid not null references public.ventures (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venture_id, user_id)
);
create index venture_follows_user_idx on public.venture_follows (user_id);

create table public.venture_updates (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index venture_updates_venture_idx on public.venture_updates (venture_id, created_at desc);

-- Members only (PRD 5.28); outsiders see a count.
create table public.venture_deliverables (
  id uuid primary key default gen_random_uuid(),
  venture_id uuid not null references public.ventures (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 2 and 80),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index venture_deliverables_venture_idx on public.venture_deliverables (venture_id);

-- ---------------------------------------------------------------------------
-- Membership guards (defence in depth; the functions check first)
-- ---------------------------------------------------------------------------
-- A 7th member can't join, even under parallel accepts: the venture row is locked and
-- the count re-read in the same transaction. Completed ventures refuse membership changes.
create function private.venture_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.venture_status;
  v_count integer;
begin
  select status into v_status from public.ventures
   where id = coalesce(new.venture_id, old.venture_id) for update;
  if v_status is null then
    return coalesce(new, old); -- the venture is being deleted
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- a cascade (account deletion), not a team change
  end if;
  if v_status = 'completed' then
    raise exception 'a completed venture''s team is locked' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.venture_members where venture_id = new.venture_id;
    if v_count >= private.venture_max_members() then
      raise exception 'this venture already has % members', private.venture_max_members() using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.venture_members_guard() from public;
create trigger venture_members_guard before insert or delete on public.venture_members
  for each row execute function private.venture_members_guard();

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------
create function private.is_venture_member(p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venture_members m where m.venture_id = p_venture and m.user_id = (select auth.uid())
  );
$$;

create function private.has_venture_invite(p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venture_invites i
     where i.venture_id = p_venture and i.invitee_id = (select auth.uid()) and i.status = 'pending'
  );
$$;

-- Who may read a venture: Public to every signed-in user, University-only to its
-- university, Unlisted (and any venture) to its members and invitees. Never across a block.
create function private.can_view_venture(p_venture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ventures v
     where v.id = p_venture
       and not private.is_blocked_with(v.owner_id)
       and (
         v.visibility = 'public'
         or (v.visibility = 'university' and v.university_id = private.current_university_id())
         or private.is_venture_member(v.id)
         or private.has_venture_invite(v.id)
       )
  );
$$;
revoke all on function private.is_venture_member(uuid), private.has_venture_invite(uuid), private.can_view_venture(uuid)
  from public;
grant execute on function private.is_venture_member(uuid), private.has_venture_invite(uuid), private.can_view_venture(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS (reads only; every write is a function below)
-- ---------------------------------------------------------------------------
alter table public.ventures enable row level security;
alter table public.venture_members enable row level security;
alter table public.venture_roles enable row level security;
alter table public.venture_questions enable row level security;
alter table public.application_threads enable row level security;
alter table public.application_messages enable row level security;
alter table public.venture_invites enable row level security;
alter table public.venture_follows enable row level security;
alter table public.venture_updates enable row level security;
alter table public.venture_deliverables enable row level security;
revoke all on table public.ventures, public.venture_members, public.venture_roles, public.venture_questions,
  public.application_threads, public.application_messages, public.venture_invites, public.venture_follows,
  public.venture_updates, public.venture_deliverables from anon, authenticated;
grant select on table public.ventures, public.venture_members, public.venture_roles, public.venture_questions,
  public.application_threads, public.application_messages, public.venture_invites, public.venture_follows,
  public.venture_updates, public.venture_deliverables to authenticated;

-- Unlisted ventures aren't listed: outsiders open them by link through venture_by_link().
create policy ventures_read on public.ventures for select to authenticated
  using (
    not private.is_blocked_with(owner_id)
    and (
      visibility = 'public'
      or (visibility = 'university' and university_id = (select private.current_university_id()))
      or private.is_venture_member(id)
      or private.has_venture_invite(id)
    )
  );
create policy venture_members_read on public.venture_members for select to authenticated
  using (private.can_view_venture(venture_id));
create policy venture_roles_read on public.venture_roles for select to authenticated
  using (private.can_view_venture(venture_id));
create policy venture_questions_read on public.venture_questions for select to authenticated
  using (private.can_view_venture(venture_id));
create policy venture_updates_read on public.venture_updates for select to authenticated
  using (private.can_view_venture(venture_id));
create policy venture_deliverables_read on public.venture_deliverables for select to authenticated
  using (private.is_venture_member(venture_id));
create policy application_threads_read on public.application_threads for select to authenticated
  using (candidate_id = (select auth.uid()) or owner_id = (select auth.uid()));
create policy application_messages_read on public.application_messages for select to authenticated
  using (exists (
    select 1 from public.application_threads t
     where t.id = application_messages.thread_id
       and (t.candidate_id = (select auth.uid()) or t.owner_id = (select auth.uid()))
  ));
create policy venture_invites_read on public.venture_invites for select to authenticated
  using (invitee_id = (select auth.uid()) or inviter_id = (select auth.uid())
         or exists (select 1 from public.ventures v where v.id = venture_invites.venture_id and v.owner_id = (select auth.uid())));
create policy venture_follows_read on public.venture_follows for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Shared checks for the write functions
-- ---------------------------------------------------------------------------
create function private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_user and p.onboarding_complete) then
    raise exception 'finish onboarding first' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Locks and returns the venture, refusing anyone but its owner.
create function private.lock_owned_venture(p_venture uuid)
returns public.ventures
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures;
begin
  select * into v from public.ventures where id = p_venture for update;
  if not found then
    raise exception 'venture not found' using errcode = 'P0002';
  end if;
  if v.owner_id is distinct from (select auth.uid()) then
    raise exception 'only the owner can do this' using errcode = '42501';
  end if;
  return v;
end;
$$;

create function private.require_open(v public.ventures)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v.status in ('completed', 'abandoned') then
    raise exception 'this venture is %', v.status using errcode = '55000';
  end if;
end;
$$;

-- Skill ids must be live taxonomy skills.
create function private.valid_skill_ids(p_ids text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids text[] := coalesce((select array_agg(distinct x) from unnest(p_ids) x), '{}');
begin
  if exists (select 1 from unnest(v_ids) x where not exists (
      select 1 from public.skills s where s.id = x and s.retired_at is null)) then
    raise exception 'unknown skill' using errcode = '22023';
  end if;
  return v_ids;
end;
$$;

-- Adds a member under the venture lock: team size, role slot, bookkeeping.
create function private.add_venture_member(p_venture uuid, p_user uuid, p_role uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role public.venture_roles;
begin
  if exists (select 1 from public.venture_members where venture_id = p_venture and user_id = p_user) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  if p_role is not null then
    select * into v_role from public.venture_roles where id = p_role and venture_id = p_venture for update;
    if found then
      if v_role.filled >= v_role.slots then
        raise exception 'that role is already filled' using errcode = '23514';
      end if;
      update public.venture_roles set filled = filled + 1 where id = p_role;
    end if;
  end if;
  insert into public.venture_members (venture_id, user_id, team_role) values (p_venture, p_user, 'other');
  -- The venture group chat joins here with phase 3.
end;
$$;

revoke all on function private.require_user(), private.lock_owned_venture(uuid), private.require_open(public.ventures),
  private.valid_skill_ids(text[]), private.add_venture_member(uuid, uuid, uuid), private.venture_max_members() from public;

-- ---------------------------------------------------------------------------
-- Create and edit
-- ---------------------------------------------------------------------------
-- p: {type, title, description, visibility, stage, pitch_url, affiliation, skill_ids,
--     team_size, roles: [{title, skill_ids, slots}], questions: [text]}
create function private.create_venture(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_uni uuid;
  v_id uuid;
  v_role jsonb;
  v_q text;
  v_pos smallint := 0;
begin
  if not private.rate_limit('venture_create:' || v_user::text, 5, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select university_id into v_uni from public.profiles where user_id = v_user;
  if v_uni is null then
    raise exception 'finish onboarding first' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p -> 'roles', '[]')) > 6 or jsonb_array_length(coalesce(p -> 'questions', '[]')) > 3 then
    raise exception 'too many roles or questions' using errcode = '22023';
  end if;

  insert into public.ventures (type, owner_id, university_id, title, description, visibility, stage, pitch_url,
                               affiliation, skill_ids, team_size)
  values ((p ->> 'type')::public.venture_type, v_user, v_uni, btrim(p ->> 'title'), p ->> 'description',
          coalesce((p ->> 'visibility')::public.venture_visibility, 'public'),
          (p ->> 'stage')::public.venture_stage, nullif(p ->> 'pitch_url', ''), nullif(btrim(p ->> 'affiliation'), ''),
          private.valid_skill_ids(coalesce(array(select jsonb_array_elements_text(p -> 'skill_ids')), '{}')),
          coalesce((p ->> 'team_size')::smallint, 4))
  returning id into v_id;

  insert into public.venture_members (venture_id, user_id, team_role) values (v_id, v_user, 'lead');

  for v_role in select * from jsonb_array_elements(coalesce(p -> 'roles', '[]')) loop
    insert into public.venture_roles (venture_id, title, skill_ids, slots)
    values (v_id, btrim(v_role ->> 'title'),
            private.valid_skill_ids(coalesce(array(select jsonb_array_elements_text(v_role -> 'skill_ids')), '{}')),
            coalesce((v_role ->> 'slots')::smallint, 1));
  end loop;
  for v_q in select jsonb_array_elements_text(coalesce(p -> 'questions', '[]')) loop
    v_pos := v_pos + 1;
    insert into public.venture_questions (venture_id, position, body) values (v_id, v_pos, btrim(v_q));
  end loop;
  return v_id;
end;
$$;

-- Same fields as create (except type); roles and questions are managed separately.
create function private.update_venture(p_venture uuid, p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  perform private.require_open(v);
  update public.ventures
     set title = coalesce(btrim(p ->> 'title'), title),
         description = coalesce(p ->> 'description', description),
         visibility = coalesce((p ->> 'visibility')::public.venture_visibility, visibility),
         stage = case when p ? 'stage' then (p ->> 'stage')::public.venture_stage else stage end,
         pitch_url = case when p ? 'pitch_url' then nullif(p ->> 'pitch_url', '') else pitch_url end,
         affiliation = case when p ? 'affiliation' then nullif(btrim(p ->> 'affiliation'), '') else affiliation end,
         skill_ids = case when p ? 'skill_ids'
                          then private.valid_skill_ids(array(select jsonb_array_elements_text(p -> 'skill_ids')))
                          else skill_ids end,
         team_size = coalesce((p ->> 'team_size')::smallint, team_size)
   where id = p_venture;
end;
$$;

-- Adds a role (p_role null) or edits one; slots can't drop below the members already in it.
create function private.save_venture_role(p_venture uuid, p_role uuid, p_title text, p_skill_ids text[], p_slots smallint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
  v_id uuid;
begin
  perform private.require_open(v);
  if p_role is null then
    if (select count(*) from public.venture_roles where venture_id = p_venture) >= 6 then
      raise exception 'at most 6 roles' using errcode = '22023';
    end if;
    insert into public.venture_roles (venture_id, title, skill_ids, slots)
    values (p_venture, btrim(p_title), private.valid_skill_ids(coalesce(p_skill_ids, '{}')), p_slots)
    returning id into v_id;
  else
    update public.venture_roles
       set title = btrim(p_title), skill_ids = private.valid_skill_ids(coalesce(p_skill_ids, '{}')), slots = p_slots
     where id = p_role and venture_id = p_venture
    returning id into v_id;
    if v_id is null then
      raise exception 'role not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create function private.delete_venture_role(p_venture uuid, p_role uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  perform private.require_open(v);
  -- Pending applications to it stay, without a role.
  delete from public.venture_roles where id = p_role and venture_id = p_venture;
end;
$$;

create function private.set_venture_questions(p_venture uuid, p_questions text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  perform private.require_open(v);
  if cardinality(coalesce(p_questions, '{}')) > 3 then
    raise exception 'at most 3 questions' using errcode = '22023';
  end if;
  delete from public.venture_questions where venture_id = p_venture;
  insert into public.venture_questions (venture_id, position, body)
  select p_venture, n, btrim(q) from unnest(p_questions) with ordinality as t(q, n);
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply, decide, message
-- ---------------------------------------------------------------------------
-- p_answers: [text] in question order.
create function private.apply_to_venture(p_venture uuid, p_role uuid, p_message text, p_answers text[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v public.ventures;
  v_role public.venture_roles;
  v_questions integer;
  v_id uuid;
begin
  if not private.rate_limit('venture_apply:' || v_user::text, 20, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select * into v from public.ventures where id = p_venture;
  if not found or not private.can_view_venture(p_venture) then
    raise exception 'venture not found' using errcode = 'P0002';
  end if;
  perform private.require_open(v);
  if v.visibility = 'unlisted' then
    raise exception 'this venture takes members by invite only' using errcode = '42501';
  end if;
  if v.visibility = 'university' and v.university_id is distinct from private.current_university_id() then
    raise exception 'this venture is for its university only' using errcode = '42501';
  end if;
  if private.is_venture_member(p_venture) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  if (select count(*) from public.venture_members where venture_id = p_venture) >= private.venture_max_members() then
    raise exception 'this team is full' using errcode = '23514';
  end if;
  if p_role is not null then
    select * into v_role from public.venture_roles where id = p_role and venture_id = p_venture;
    if not found then
      raise exception 'role not found' using errcode = 'P0002';
    end if;
    if v_role.filled >= v_role.slots then
      raise exception 'that role is already filled' using errcode = '23514';
    end if;
  end if;
  select count(*) into v_questions from public.venture_questions where venture_id = p_venture;
  if coalesce(cardinality(p_answers), 0) <> v_questions
     or exists (select 1 from unnest(p_answers) a where char_length(btrim(a)) not between 1 and 500) then
    raise exception 'answer every question (up to 500 characters each)' using errcode = '22023';
  end if;

  begin
    insert into public.application_threads (venture_id, role_id, candidate_id, owner_id, message, answers)
    select p_venture, p_role, v_user, v.owner_id, btrim(p_message),
           coalesce((select jsonb_agg(jsonb_build_object('position', q.position, 'question', q.body, 'answer', btrim(a.answer))
                                      order by q.position)
                       from public.venture_questions q
                       join unnest(p_answers) with ordinality as a(answer, n) on a.n = q.position
                      where q.venture_id = p_venture), '[]'::jsonb)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'you already have a pending application to this venture' using errcode = '23505';
  end;
  -- Notification to the owner arrives with phase 3.
  return v_id;
end;
$$;

create function private.withdraw_application(p_thread uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  update public.application_threads set status = 'withdrawn', decided_at = now()
   where id = p_thread and candidate_id = (select auth.uid()) and status = 'pending'
  returning true;
$$;

-- PRD 5.7: only the owner decides, checked here explicitly; the venture row is locked so
-- parallel accepts can't pass 6 members or a role's slots.
create function private.decide_application(p_thread uuid, p_accept boolean)
returns public.application_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  t public.application_threads;
  v public.ventures;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into t from public.application_threads where id = p_thread;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  v := private.lock_owned_venture(t.venture_id); -- refuses non-owners
  select * into t from public.application_threads where id = p_thread for update;
  if t.status <> 'pending' then
    raise exception 'this application was already %', t.status using errcode = '55000';
  end if;
  if not p_accept then
    update public.application_threads set status = 'declined', decided_at = now() where id = p_thread;
    return 'declined';
  end if;
  perform private.require_open(v);
  if private.is_blocked_with(t.candidate_id) then
    raise exception 'you can''t add this person' using errcode = '42501';
  end if;
  perform private.add_venture_member(t.venture_id, t.candidate_id, t.role_id);
  update public.application_threads set status = 'accepted', decided_at = now() where id = p_thread;
  return 'accepted';
end;
$$;

create function private.add_application_message(p_thread uuid, p_body text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id bigint;
begin
  if not exists (select 1 from public.application_threads t
                  where t.id = p_thread and t.status = 'pending'
                    and (t.candidate_id = v_user or t.owner_id = v_user)) then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if not private.rate_limit('application_message:' || v_user::text, 30, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.application_messages (thread_id, sender_id, body) values (p_thread, v_user, btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
create function private.invite_to_venture(p_venture uuid, p_username text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
  v_invitee uuid;
  v_uni uuid;
  v_id uuid;
begin
  perform private.require_open(v);
  if not private.rate_limit('venture_invite:' || v.owner_id::text, 30, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  select user_id, university_id into v_invitee, v_uni from public.profiles
   where username = lower(btrim(p_username)) and onboarding_complete;
  if v_invitee is null or private.is_blocked_with(v_invitee) then
    raise exception 'no student with that username' using errcode = 'P0002';
  end if;
  if v.visibility = 'university' and v_uni is distinct from v.university_id then
    raise exception 'this venture is for its university only' using errcode = '42501';
  end if;
  if exists (select 1 from public.venture_members where venture_id = p_venture and user_id = v_invitee) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  if (select count(*) from public.venture_members where venture_id = p_venture) >= private.venture_max_members() then
    raise exception 'this team is full' using errcode = '23514';
  end if;
  begin
    insert into public.venture_invites (venture_id, invitee_id, inviter_id) values (p_venture, v_invitee, v.owner_id)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already invited' using errcode = '23505';
  end;
  return v_id;
end;
$$;

create function private.respond_invite(p_invite uuid, p_accept boolean)
returns public.venture_invite_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  i public.venture_invites;
  v public.ventures;
begin
  select * into i from public.venture_invites where id = p_invite and invitee_id = v_user;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  select * into v from public.ventures where id = i.venture_id for update;
  select * into i from public.venture_invites where id = p_invite for update;
  if i.status <> 'pending' then
    raise exception 'this invite was already %', i.status using errcode = '55000';
  end if;
  if not p_accept then
    update public.venture_invites set status = 'declined', responded_at = now() where id = p_invite;
    return 'declined';
  end if;
  perform private.require_user();
  perform private.require_open(v);
  perform private.add_venture_member(i.venture_id, v_user, null);
  update public.venture_invites set status = 'accepted', responded_at = now() where id = p_invite;
  -- A pending application to the same venture is settled by the invite.
  update public.application_threads set status = 'closed', decided_at = now()
   where venture_id = i.venture_id and candidate_id = v_user and status = 'pending';
  return 'accepted';
end;
$$;

create function private.revoke_invite(p_invite uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i public.venture_invites;
begin
  select * into i from public.venture_invites where id = p_invite;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  perform private.lock_owned_venture(i.venture_id);
  update public.venture_invites set status = 'revoked', responded_at = now() where id = p_invite and status = 'pending';
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team management (before completion; PRD 5.15)
-- ---------------------------------------------------------------------------
create function private.leave_venture(p_venture uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v public.ventures;
begin
  select * into v from public.ventures where id = p_venture for update;
  if not found or not exists (select 1 from public.venture_members where venture_id = p_venture and user_id = v_user) then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if v.owner_id = v_user then
    raise exception 'transfer ownership before leaving' using errcode = '55000';
  end if;
  -- Confirmed contributions stay on the member's record (slice 6).
  delete from public.venture_members where venture_id = p_venture and user_id = v_user;
end;
$$;

create function private.remove_venture_member(p_venture uuid, p_member uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  perform private.require_open(v);
  if p_member = v.owner_id then
    raise exception 'the owner can''t be removed' using errcode = '55000';
  end if;
  delete from public.venture_members where venture_id = p_venture and user_id = p_member;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
end;
$$;

create function private.set_member_role(p_venture uuid, p_member uuid, p_role public.venture_team_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  perform private.require_open(v);
  update public.venture_members set team_role = p_role where venture_id = p_venture and user_id = p_member;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
end;
$$;

create function private.transfer_venture_ownership(p_venture uuid, p_member uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
begin
  perform private.require_open(v);
  if p_member = v.owner_id or not exists (
      select 1 from public.venture_members where venture_id = p_venture and user_id = p_member) then
    raise exception 'the new owner must be a member' using errcode = '22023';
  end if;
  update public.ventures set owner_id = p_member where id = p_venture;
  update public.application_threads set owner_id = p_member where venture_id = p_venture and status = 'pending';
  -- Both are notified with phase 3.
end;
$$;

-- The repository must be one the owner shared with the Skilient GitHub App (PRD 5.15).
create function private.link_venture_repo(p_venture uuid, p_repo bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.ventures := private.lock_owned_venture(p_venture);
  v_name text;
begin
  perform private.require_open(v);
  if p_repo is null then
    update public.ventures set repo_id = null, repo_full_name = null where id = p_venture;
    return;
  end if;
  select g.full_name into v_name
    from public.github_user_repos ur join public.github_repos g on g.repo_id = ur.repo_id
   where ur.user_id = v.owner_id and ur.repo_id = p_repo and not ur.excluded;
  if v_name is null then
    raise exception 'share that repository with Skilient first' using errcode = '42501';
  end if;
  update public.ventures set repo_id = p_repo, repo_full_name = v_name where id = p_venture;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle (PRD 5.15): recruiting -> in_progress -> completed | abandoned; recruiting -> abandoned
-- ---------------------------------------------------------------------------
create function private.transition_venture(p_venture uuid, p_to public.venture_status)
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
    -- Slice 6 adds: peer-verified contributions from at least 2 members.
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

-- ---------------------------------------------------------------------------
-- Follows, updates, deliverables
-- ---------------------------------------------------------------------------
create function private.follow_venture(p_venture uuid, p_follow boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  if p_follow then
    if not exists (select 1 from public.ventures where id = p_venture and visibility = 'public')
       or not private.can_view_venture(p_venture) then
      raise exception 'only public ventures can be followed' using errcode = '42501';
    end if;
    insert into public.venture_follows (venture_id, user_id) values (p_venture, v_user) on conflict do nothing;
  else
    delete from public.venture_follows where venture_id = p_venture and user_id = v_user;
  end if;
  return p_follow;
end;
$$;

create function private.post_venture_update(p_venture uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if not private.is_venture_member(p_venture) then
    raise exception 'members only' using errcode = '42501';
  end if;
  if exists (select 1 from public.ventures where id = p_venture and status = 'abandoned') then
    raise exception 'this venture is abandoned' using errcode = '55000';
  end if;
  if not private.rate_limit('venture_update:' || v_user::text, 20, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.venture_updates (venture_id, author_id, body) values (p_venture, v_user, btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

-- The author, or the owner, can delete an update.
create function private.delete_venture_update(p_update uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.venture_updates u
   where u.id = p_update
     and (u.author_id = (select auth.uid())
          or exists (select 1 from public.ventures v where v.id = u.venture_id and v.owner_id = (select auth.uid())))
  returning true;
$$;

create function private.add_venture_deliverable(p_venture uuid, p_label text, p_url text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v public.ventures;
  v_id uuid;
begin
  select * into v from public.ventures where id = p_venture;
  if not found or not private.is_venture_member(p_venture) then
    raise exception 'members only' using errcode = '42501';
  end if;
  perform private.require_open(v);
  if (select count(*) from public.venture_deliverables where venture_id = p_venture) >= 20 then
    raise exception 'at most 20 deliverables' using errcode = '22023';
  end if;
  insert into public.venture_deliverables (venture_id, label, url, added_by)
  values (p_venture, btrim(p_label), btrim(p_url), v_user)
  returning id into v_id;
  return v_id;
end;
$$;

create function private.remove_venture_deliverable(p_deliverable uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.venture_deliverables;
  v public.ventures;
begin
  select * into d from public.venture_deliverables where id = p_deliverable;
  if not found then
    return false;
  end if;
  select * into v from public.ventures where id = d.venture_id;
  if not (v.owner_id = (select auth.uid()) or d.added_by = (select auth.uid())) then
    raise exception 'only the owner or who added it' using errcode = '42501';
  end if;
  perform private.require_open(v);
  delete from public.venture_deliverables where id = p_deliverable;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads for outsiders: counts, and unlisted ventures by link
-- ---------------------------------------------------------------------------
create function private.venture_counts(p_venture uuid)
returns table (members integer, followers integer, deliverables integer, updates integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.venture_members m where m.venture_id = p_venture),
         (select count(*)::integer from public.venture_follows f where f.venture_id = p_venture),
         (select count(*)::integer from public.venture_deliverables d where d.venture_id = p_venture),
         (select count(*)::integer from public.venture_updates u where u.venture_id = p_venture)
   where private.can_view_venture(p_venture)
      or exists (select 1 from public.ventures v where v.id = p_venture and v.visibility = 'unlisted'
                   and not private.is_blocked_with(v.owner_id));
$$;

-- PRD 5.28 "Unlisted (link only)": the id in the link is the key. Returns the venture's
-- public face; members, roles and updates stay behind can_view_venture.
create function private.venture_by_link(p_venture uuid)
returns table (id uuid, type public.venture_type, title text, description text, status public.venture_status,
               visibility public.venture_visibility, owner_id uuid, university_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.type, v.title, v.description, v.status, v.visibility, v.owner_id, v.university_id, v.created_at
    from public.ventures v
   where v.id = p_venture and not private.is_blocked_with(v.owner_id)
     and (v.visibility = 'unlisted' or private.can_view_venture(v.id));
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (security invoker) and grants
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in (
       'create_venture', 'update_venture', 'save_venture_role', 'delete_venture_role', 'set_venture_questions',
       'apply_to_venture', 'withdraw_application', 'decide_application', 'add_application_message',
       'invite_to_venture', 'respond_invite', 'revoke_invite', 'leave_venture', 'remove_venture_member',
       'set_member_role', 'transfer_venture_ownership', 'link_venture_repo', 'transition_venture',
       'follow_venture', 'post_venture_update', 'delete_venture_update', 'add_venture_deliverable',
       'remove_venture_deliverable', 'venture_counts', 'venture_by_link')
  loop
    execute format('revoke all on function private.%I(%s) from public', f.proname, f.args);
    execute format('grant execute on function private.%I(%s) to authenticated', f.proname, f.args);
  end loop;
end;
$$;
grant execute on function private.require_user(), private.lock_owned_venture(uuid), private.require_open(public.ventures),
  private.valid_skill_ids(text[]), private.add_venture_member(uuid, uuid, uuid), private.venture_max_members()
  to authenticated;

create function public.create_venture(p jsonb) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.create_venture(p) $$;
create function public.update_venture(p_venture uuid, p jsonb) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.update_venture(p_venture, p) $$;
create function public.save_venture_role(p_venture uuid, p_title text, p_skill_ids text[], p_slots smallint, p_role uuid default null)
  returns uuid language sql volatile security invoker set search_path = ''
  as $$ select private.save_venture_role(p_venture, p_role, p_title, p_skill_ids, p_slots) $$;
create function public.delete_venture_role(p_venture uuid, p_role uuid) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.delete_venture_role(p_venture, p_role) $$;
create function public.set_venture_questions(p_venture uuid, p_questions text[]) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.set_venture_questions(p_venture, p_questions) $$;
create function public.apply_to_venture(p_venture uuid, p_message text, p_answers text[] default '{}', p_role uuid default null)
  returns uuid language sql volatile security invoker set search_path = ''
  as $$ select private.apply_to_venture(p_venture, p_role, p_message, p_answers) $$;
create function public.withdraw_application(p_thread uuid) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.withdraw_application(p_thread) $$;
create function public.decide_application(p_thread uuid, p_accept boolean) returns public.application_status
  language sql volatile security invoker set search_path = '' as $$ select private.decide_application(p_thread, p_accept) $$;
create function public.add_application_message(p_thread uuid, p_body text) returns bigint
  language sql volatile security invoker set search_path = '' as $$ select private.add_application_message(p_thread, p_body) $$;
create function public.invite_to_venture(p_venture uuid, p_username text) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.invite_to_venture(p_venture, p_username) $$;
create function public.respond_invite(p_invite uuid, p_accept boolean) returns public.venture_invite_status
  language sql volatile security invoker set search_path = '' as $$ select private.respond_invite(p_invite, p_accept) $$;
create function public.revoke_invite(p_invite uuid) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.revoke_invite(p_invite) $$;
create function public.leave_venture(p_venture uuid) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.leave_venture(p_venture) $$;
create function public.remove_venture_member(p_venture uuid, p_member uuid) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.remove_venture_member(p_venture, p_member) $$;
create function public.set_member_role(p_venture uuid, p_member uuid, p_role public.venture_team_role) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.set_member_role(p_venture, p_member, p_role) $$;
create function public.transfer_venture_ownership(p_venture uuid, p_member uuid) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.transfer_venture_ownership(p_venture, p_member) $$;
create function public.link_venture_repo(p_venture uuid, p_repo bigint default null) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.link_venture_repo(p_venture, p_repo) $$;
create function public.transition_venture(p_venture uuid, p_to public.venture_status) returns void
  language sql volatile security invoker set search_path = '' as $$ select private.transition_venture(p_venture, p_to) $$;
create function public.follow_venture(p_venture uuid, p_follow boolean) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.follow_venture(p_venture, p_follow) $$;
create function public.post_venture_update(p_venture uuid, p_body text) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.post_venture_update(p_venture, p_body) $$;
create function public.delete_venture_update(p_update uuid) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.delete_venture_update(p_update) $$;
create function public.add_venture_deliverable(p_venture uuid, p_label text, p_url text) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.add_venture_deliverable(p_venture, p_label, p_url) $$;
create function public.remove_venture_deliverable(p_deliverable uuid) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.remove_venture_deliverable(p_deliverable) $$;
create function public.venture_counts(p_venture uuid)
  returns table (members integer, followers integer, deliverables integer, updates integer)
  language sql stable security invoker set search_path = '' as $$ select * from private.venture_counts(p_venture) $$;
create function public.venture_by_link(p_venture uuid)
  returns table (id uuid, type public.venture_type, title text, description text, status public.venture_status,
                 visibility public.venture_visibility, owner_id uuid, university_id uuid, created_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.venture_by_link(p_venture) $$;

do $$
declare
  f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'create_venture', 'update_venture', 'save_venture_role', 'delete_venture_role', 'set_venture_questions',
       'apply_to_venture', 'withdraw_application', 'decide_application', 'add_application_message',
       'invite_to_venture', 'respond_invite', 'revoke_invite', 'leave_venture', 'remove_venture_member',
       'set_member_role', 'transfer_venture_ownership', 'link_venture_repo', 'transition_venture',
       'follow_venture', 'post_venture_update', 'delete_venture_update', 'add_venture_deliverable',
       'remove_venture_deliverable', 'venture_counts', 'venture_by_link')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to authenticated', f.proname, f.args);
  end loop;
end;
$$;
