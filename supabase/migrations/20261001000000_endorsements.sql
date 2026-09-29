-- Phase 4, slice 1: peer endorsements (PRD 5.16; decisions.md 2026-09-30).
-- Teammates on a shared in-progress or completed venture endorse each other's skills. Every
-- limit is enforced here: current members only, not yourself, not across a block, at most 5
-- skills per teammate per venture, at most 20 given per calendar month (Pakistan time), each
-- skill in the venture's tags or the endorsee's skills, a note of at most 280 characters, and
-- an optional evidence item (one of the endorsee's entries in that venture). The endorsee can
-- hide an endorsement but nobody edits one. Weight is computed at ranking time (slice 5).

insert into public.platform_config (key, version, value, reason) values
  ('endorsements.limits', 1, '{"per_teammate_per_venture": 5, "per_month": 20, "peer_verified_min": 2}',
   'PRD 5.16 launch values (decisions.md 2026-09-30)');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.endorsements (
  id uuid primary key default gen_random_uuid(),
  endorser_id uuid not null references auth.users (id) on delete cascade,
  endorsee_id uuid not null references auth.users (id) on delete cascade,
  venture_id uuid not null references public.ventures (id) on delete cascade,
  skill_id text not null references public.skills (id),
  -- The endorsee's contribution entry (an original, not a correction) this vouches for.
  evidence_id uuid references public.contributions (id) on delete set null,
  note text check (note is null or char_length(note) between 1 and 280),
  hidden boolean not null default false,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endorser_id, endorsee_id, skill_id, venture_id),
  check (endorser_id <> endorsee_id),
  check (hidden = (hidden_at is not null))
);
comment on table public.endorsements is
  'Peer endorsements (PRD 5.16). Written only by endorse(); the endorsee may hide one. Never edited.';
create index endorsements_endorsee_idx on public.endorsements (endorsee_id, skill_id);
create index endorsements_endorser_created_idx on public.endorsements (endorser_id, created_at);
create index endorsements_venture_idx on public.endorsements (venture_id);
create index endorsements_skill_idx on public.endorsements (skill_id);
create index endorsements_evidence_idx on public.endorsements (evidence_id) where evidence_id is not null;

-- The endorsee and the endorser read their own rows (the endorser sees what they gave, not
-- whether it was hidden); everyone else reads through endorsements_for().
alter table public.endorsements enable row level security;
revoke all on table public.endorsements from anon, authenticated;
grant select (id, endorser_id, endorsee_id, venture_id, skill_id, evidence_id, note, created_at)
  on table public.endorsements to authenticated;
create policy endorsements_read_own on public.endorsements for select to authenticated
  using (endorser_id = (select auth.uid()) or endorsee_id = (select auth.uid()));

-- A skill is peer-verified once 2 different teammates endorse it (hidden ones don't count).
-- Kept on user_skills so the chip shows it wherever the level shows.
alter table public.user_skills add column peer_verified boolean not null default false;
grant select (peer_verified) on table public.user_skills to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: a "Trust and ranking" category, in-app only by default
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('trust', 'Trust and ranking', 'Endorsements, credential and code-check results, and your tier.', 10, 'off', false);
insert into public.notification_types (type, category, emailed) values
  ('endorsement_received', 'trust', true),
  ('endorse_teammates', 'trust', false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.endorsement_limit(p_name text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (private.config('endorsements.limits') ->> p_name)::integer;
$$;
revoke all on function private.endorsement_limit(text) from public;

-- Start of the current calendar month in Pakistan time.
create function private.pk_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
$$;
revoke all on function private.pk_month_start() from public;

-- Skills p_user may be endorsed for in p_venture: the venture's tags plus their L1+ skills.
create function private.endorsable_skill(p_venture uuid, p_user uuid, p_skill text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.skills s where s.id = p_skill and s.retired_at is null)
     and (
       exists (select 1 from public.ventures v where v.id = p_venture and p_skill = any (v.skill_ids))
       or exists (select 1 from public.user_skills u where u.user_id = p_user and u.skill_id = p_skill and u.level >= 1)
     );
$$;
revoke all on function private.endorsable_skill(uuid, uuid, text) from public;

-- Recompute the peer-verified mark on p_user's skills.
create function private.refresh_peer_verified(p_user uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.user_skills u
     set peer_verified = coalesce(e.endorsers, 0) >= private.endorsement_limit('peer_verified_min')
    from (select s.skill_id, count(distinct x.endorser_id)::integer as endorsers
            from public.user_skills s
            left join public.endorsements x on x.endorsee_id = s.user_id and x.skill_id = s.skill_id and not x.hidden
           where s.user_id = p_user
           group by s.skill_id) e
   where u.user_id = p_user and u.skill_id = e.skill_id
     and u.peer_verified is distinct from (coalesce(e.endorsers, 0) >= private.endorsement_limit('peer_verified_min'));
$$;
revoke all on function private.refresh_peer_verified(uuid) from public;

create function private.endorsements_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct endorsee_id from new_rows
  loop
    perform private.refresh_peer_verified(v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.endorsements_changed() from public;
create trigger endorsements_changed_insert after insert on public.endorsements
  referencing new table as new_rows
  for each statement execute function private.endorsements_changed();
create trigger endorsements_changed_update after update on public.endorsements
  referencing new table as new_rows
  for each statement execute function private.endorsements_changed();

-- A skill row that appears later (new GitHub evidence) picks up its mark at once.
create function private.user_skills_peer_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.peer_verified := (
    select count(distinct x.endorser_id) >= private.endorsement_limit('peer_verified_min')
      from public.endorsements x
     where x.endorsee_id = new.user_id and x.skill_id = new.skill_id and not x.hidden
  );
  return new;
end;
$$;
revoke all on function private.user_skills_peer_verified() from public;
create trigger user_skills_peer_verified before insert on public.user_skills
  for each row execute function private.user_skills_peer_verified();

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
-- p_items: [{"skill": "<skill id>", "evidence": "<contribution id>" | null}, ...]
create function private.endorse(p_endorsee uuid, p_venture uuid, p_items jsonb, p_note text)
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

-- The endorsee hides (or shows again) an endorsement they received.
create function private.hide_endorsement(p_id uuid, p_hidden boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  update public.endorsements
     set hidden = coalesce(p_hidden, true),
         hidden_at = case when coalesce(p_hidden, true) then coalesce(hidden_at, now()) end
   where id = p_id and endorsee_id = v_me;
  if not found then
    raise exception 'endorsement not found' using errcode = 'P0002';
  end if;
  return coalesce(p_hidden, true);
end;
$$;

-- Completion prompts every member to endorse their teammates (PRD 5.15).
create function private.prompt_endorsements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for m in select vm.user_id from public.venture_members vm where vm.venture_id = new.id loop
      perform private.notify(m.user_id, null, 'endorse_teammates', 'venture', new.id, private.venture_data(new.id));
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.prompt_endorsements() from public;
create trigger ventures_prompt_endorsements after update of status on public.ventures
  for each row execute function private.prompt_endorsements();

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- A profile's endorsements for anyone who may see that full profile. The endorser's name is
-- always shown (they are a teammate), their username and photo only where the viewer may see
-- their profile, the venture's title only where the viewer may see the venture. Endorsers
-- blocked with the viewer are left out; hidden ones show to the endorsee only.
create function private.endorsements_for(p_user uuid)
returns table (
  id uuid, skill_id text, skill_name text, endorser_id uuid, endorser_name text, endorser_username text,
  endorser_avatar_path text, venture_id uuid, venture_title text, note text, has_evidence boolean,
  hidden boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.skill_id, s.name, e.endorser_id, p.full_name,
         case when private.can_view_profile(e.endorser_id) then p.username end,
         case when private.can_view_profile(e.endorser_id) then p.avatar_path end,
         case when private.can_view_venture(e.venture_id) then e.venture_id end,
         case when private.can_view_venture(e.venture_id) then v.title end,
         e.note, e.evidence_id is not null,
         e.hidden, e.created_at
    from public.endorsements e
    join public.skills s on s.id = e.skill_id
    join public.profiles p on p.user_id = e.endorser_id
    join public.ventures v on v.id = e.venture_id
   where e.endorsee_id = p_user
     and private.can_view_profile(p_user)
     and (not e.hidden or p_user = (select auth.uid()))
     and (e.endorser_id = (select auth.uid()) or not private.is_blocked_with(e.endorser_id))
   order by s.name, e.created_at desc;
$$;

-- What the endorse sheet needs for one venture: each teammate with the skills they can be
-- endorsed for, what the caller already gave them, and their entries to cite as evidence.
create function private.endorse_options(p_venture uuid)
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
           select jsonb_agg(jsonb_build_object('id', c.id, 'description', c.description, 'kind', c.kind,
                                               'source', c.source, 'peer_verified', c.peer_verified)
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
-- Grants and public wrappers (security invoker)
-- ---------------------------------------------------------------------------
revoke all on function
  private.endorse(uuid, uuid, jsonb, text),
  private.hide_endorsement(uuid, boolean),
  private.endorsements_for(uuid),
  private.endorse_options(uuid)
  from public;
grant execute on function
  private.endorse(uuid, uuid, jsonb, text),
  private.hide_endorsement(uuid, boolean),
  private.endorsements_for(uuid),
  private.endorse_options(uuid)
  to authenticated;

create function public.endorse(p_endorsee uuid, p_venture uuid, p_items jsonb, p_note text default null)
returns integer
language sql volatile security invoker set search_path = ''
as $$ select private.endorse(p_endorsee, p_venture, p_items, p_note) $$;

create function public.hide_endorsement(p_id uuid, p_hidden boolean default true)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select private.hide_endorsement(p_id, p_hidden) $$;

create function public.endorsements_for(p_user uuid)
returns table (
  id uuid, skill_id text, skill_name text, endorser_id uuid, endorser_name text, endorser_username text,
  endorser_avatar_path text, venture_id uuid, venture_title text, note text, has_evidence boolean,
  hidden boolean, created_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from private.endorsements_for(p_user) $$;

create function public.endorse_options(p_venture uuid)
returns table (
  user_id uuid, full_name text, username text, avatar_path text, skills jsonb, given text[], evidence jsonb,
  month_left integer
)
language sql stable security invoker set search_path = ''
as $$ select * from private.endorse_options(p_venture) $$;

revoke all on function
  public.endorse(uuid, uuid, jsonb, text),
  public.hide_endorsement(uuid, boolean),
  public.endorsements_for(uuid),
  public.endorse_options(uuid)
  from public, anon;
grant execute on function
  public.endorse(uuid, uuid, jsonb, text),
  public.hide_endorsement(uuid, boolean),
  public.endorsements_for(uuid),
  public.endorse_options(uuid)
  to authenticated;
