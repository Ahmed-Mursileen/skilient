-- Phase 11, slice 2 (PRD 5.26): sanctions with role limits and appeals.
--
-- Sanctions: users get warn | suspend | ban, organisations warn | throttle | suspend. A moderator
-- suspends for at most 7 days; bans are super admin only (both checked in the function and again
-- by a trigger on the table). A suspended or banned account can only read, appeal and delete
-- itself: a trigger refuses its writes on every table where people create things. A ban also
-- blocks sign-in (auth.users.banned_until; the phase 5 trigger revokes its CVs). A throttle caps an
-- organisation's contact requests a day.
--
-- Appeals: one per decision (unique), within 30 days, decided by staff holding the deciding role
-- but never the staff member who made the decision (check constraint plus trigger). Final.

-- ---------------------------------------------------------------------------
-- Sanctions: organisations, throttles and lifting
-- ---------------------------------------------------------------------------
alter table public.sanctions
  alter column user_id drop not null,
  add column org_id uuid references public.organizations (id) on delete cascade,
  add column per_day integer check (per_day is null or per_day between 1 and 50),
  add column lifted_at timestamptz,
  add column lifted_by uuid references auth.users (id) on delete set null,
  add column lift_reason text check (lift_reason is null or char_length(btrim(lift_reason)) between 3 and 2000),
  add constraint sanctions_one_subject check ((user_id is null) <> (org_id is null)),
  add constraint sanctions_kind_fits_subject check (
    case when org_id is not null then kind in ('warn', 'throttle', 'suspend') else kind in ('warn', 'suspend', 'ban') end),
  add constraint sanctions_until_after_start check (until is null or until > created_at),
  add constraint sanctions_throttle_per_day check ((kind = 'throttle') = (per_day is not null)),
  add constraint sanctions_throttle_until check (kind <> 'throttle' or until is not null),
  add constraint sanctions_user_suspend_until check (kind <> 'suspend' or org_id is not null or until is not null),
  add constraint sanctions_lift_reason check ((lifted_at is null) = (lift_reason is null));
comment on table public.sanctions is
  'Warnings, suspensions, bans and throttles (PRD 5.26). Written only by staff functions; only the lift fields ever change.';
create index sanctions_org_idx on public.sanctions (org_id, created_at desc) where org_id is not null;
create index sanctions_lifted_by_idx on public.sanctions (lifted_by) where lifted_by is not null;
create index sanctions_active_user_idx on public.sanctions (user_id) where lifted_at is null and kind in ('suspend', 'ban');

-- Role limits again at the table, so no future function can skip them.
create function private.sanctions_role_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super boolean := exists (select 1 from public.staff_roles r where r.user_id = new.staff_id and r.role = 'super_admin');
begin
  if tg_op = 'UPDATE' then
    if (new.user_id, new.org_id, new.kind, new.until, new.per_day, new.reason, new.staff_id, new.case_id, new.created_at)
       is distinct from (old.user_id, old.org_id, old.kind, old.until, old.per_day, old.reason, old.staff_id, old.case_id, old.created_at)
       and not (new.user_id is null and old.user_id is not null) and not (new.case_id is null and old.case_id is not null) then
      raise exception 'a sanction can only be lifted, not edited' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.kind = 'ban' and not v_super then
    raise exception 'only a super admin can ban an account' using errcode = '42501';
  end if;
  if new.kind = 'suspend' and new.user_id is not null and not v_super
     and (new.until is null or new.until > new.created_at + interval '7 days') then
    raise exception 'moderators can suspend for at most 7 days' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.sanctions_role_limits() from public;
create trigger sanctions_role_limits before insert or update on public.sanctions
  for each row execute function private.sanctions_role_limits();

-- The account's current suspension or ban (a ban wins), or null.
create function private.active_restriction(p_user uuid)
returns public.sanctions
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.sanctions s
   where s.user_id = p_user and s.kind in ('suspend', 'ban') and s.lifted_at is null and (s.until is null or s.until > now())
   order by s.kind = 'ban' desc, s.until desc nulls first
   limit 1;
$$;
revoke all on function private.active_restriction(uuid) from public;

-- Refuses a write by a suspended or banned account. Only the acting user counts (auth.uid());
-- jobs and Edge Functions have no user and pass.
create function private.refuse_if_restricted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is not null and exists (
       select 1 from public.sanctions s
        where s.user_id = v_me and s.kind in ('suspend', 'ban') and s.lifted_at is null and (s.until is null or s.until > now())) then
    raise exception 'your account is suspended, so you can only read, appeal or delete your account' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_if_restricted() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'post_comments', 'chat_messages', 'message_reactions', 'chat_pins', 'poll_votes', 'event_rsvps', 'endorsements',
    'ventures', 'venture_invites', 'application_threads', 'application_messages', 'venture_updates', 'venture_follows',
    'contributions', 'contribution_confirmations', 'friend_requests', 'credentials', 'code_checks', 'cv_share_links',
    'job_applications', 'event_registrations', 'contact_requests', 'job_posts', 'competition_teams', 'project_ideas',
    'supervisor_comments', 'review_requests', 'venture_reviews'
  ] loop
    execute format('create trigger refuse_if_restricted before insert on public.%I for each row execute function private.refuse_if_restricted()', t);
  end loop;
end;
$$;

-- A throttled organisation sends at most per_day contact requests in any 24 hours.
create function private.org_throttle_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_per_day integer;
begin
  select min(s.per_day) into v_per_day from public.sanctions s
   where s.org_id = new.org_id and s.kind = 'throttle' and s.lifted_at is null and s.until > now();
  if v_per_day is not null
     and (select count(*) from public.contact_requests c where c.org_id = new.org_id and c.created_at > now() - interval '24 hours') >= v_per_day then
    raise exception 'Skilient has limited your organisation to % contact requests a day for now', v_per_day using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.org_throttle_check() from public;
create trigger org_throttle_check before insert on public.contact_requests
  for each row execute function private.org_throttle_check();

insert into public.notification_types (type, category, emailed) values
  ('account_restricted', 'account', true),
  ('restriction_lifted', 'account', true),
  ('org_sanctioned', 'account', true),
  ('appeal_decided', 'account', true);

-- ---------------------------------------------------------------------------
-- Staff: sanction and lift
-- ---------------------------------------------------------------------------
create function private.sanction_json(s public.sanctions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'until', s.until, 'per_day', s.per_day, 'reason', s.reason, 'staff_id', s.staff_id,
    'case_id', s.case_id, 'lifted_at', s.lifted_at, 'lift_reason', s.lift_reason) end;
$$;
revoke all on function private.sanction_json(public.sanctions) from public;

-- p_kind: warn | suspend | ban. p_until: required for a suspension (moderators: at most 7 days);
-- null on a ban means permanent. p_case links the sanction to a report case.
create function private.sanction_user(p_user uuid, p_kind text, p_until timestamptz, p_reason text, p_case uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_current public.sanctions;
  v_new public.sanctions;
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_kind not in ('warn', 'suspend', 'ban') then
    raise exception 'choose warn, suspend or ban' using errcode = '22023';
  end if;
  if p_user = v_me then
    raise exception 'you can''t sanction your own account' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  if p_kind = 'warn' and p_until is not null then
    raise exception 'a warning has no end date' using errcode = '22023';
  end if;
  if p_kind = 'suspend' and (p_until is null or p_until <= now()) then
    raise exception 'choose when the suspension ends' using errcode = '22023';
  end if;
  if p_kind = 'suspend' and p_until > now() + interval '7 days' and not private.is_staff('super_admin') then
    raise exception 'moderators can suspend for at most 7 days' using errcode = '42501';
  end if;
  if p_kind = 'ban' then
    if not private.is_staff('super_admin') then
      raise exception 'only a super admin can ban an account' using errcode = '42501';
    end if;
    if p_until is not null and p_until <= now() then
      raise exception 'the ban must end in the future, or leave the end empty for a permanent ban' using errcode = '22023';
    end if;
  end if;
  if p_case is not null and not exists (select 1 from public.report_cases c where c.id = p_case and c.owner_id = p_user) then
    raise exception 'that report case isn''t about this account' using errcode = '22023';
  end if;
  -- One suspension or ban at a time: lift it first, so the history stays readable.
  perform 1 from auth.users u where u.id = p_user for update;
  v_current := private.active_restriction(p_user);
  if p_kind <> 'warn' and v_current.id is not null then
    raise exception 'this account already has an active %; lift it first', v_current.kind using errcode = '55000';
  end if;

  insert into public.sanctions (user_id, kind, until, reason, staff_id, case_id)
  values (p_user, p_kind::public.sanction_kind, p_until, v_reason, v_me, p_case)
  returning * into v_new;

  if p_kind in ('suspend', 'ban') then
    -- Every device is signed out now, so the restriction applies without waiting for a token to expire.
    delete from auth.sessions where user_id = p_user;
  end if;
  if p_kind = 'ban' then
    update auth.users set banned_until = coalesce(p_until, timestamptz '2999-12-31 00:00:00+00') where id = p_user;
  end if;
  perform private.notify(p_user, null, 'account_restricted', 'sanction', v_new.id,
                         jsonb_build_object('kind', p_kind, 'until', p_until));
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'sanction.' || p_kind, 'user', p_user::text, v_reason,
          jsonb_build_object('active', private.sanction_json(v_current)),
          jsonb_build_object('active', private.sanction_json(coalesce(private.active_restriction(p_user), v_current)), 'sanction', private.sanction_json(v_new)));
  return v_new.id;
end;
$$;

-- p_kind: warn | throttle | suspend. A throttle needs p_per_day (1-50) and p_until (at most 90 days);
-- a suspension takes the organisation's verified status away until lifted.
create function private.sanction_org(p_org uuid, p_kind text, p_until timestamptz, p_per_day integer, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_reason text := btrim(coalesce(p_reason, ''));
  o public.organizations;
  v_new public.sanctions;
  m record;
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = p_org for update;
  if o.id is null then
    raise exception 'organisation not found' using errcode = 'P0002';
  end if;
  if p_kind = 'warn' then
    if p_until is not null or p_per_day is not null then
      raise exception 'a warning has no limit or end date' using errcode = '22023';
    end if;
  elsif p_kind = 'throttle' then
    if p_per_day is null or p_per_day not between 1 and 50 then
      raise exception 'choose 1 to 50 contact requests a day' using errcode = '22023';
    end if;
    if p_until is null or p_until <= now() or p_until > now() + interval '90 days' then
      raise exception 'a throttle ends within 90 days' using errcode = '22023';
    end if;
  elsif p_kind = 'suspend' then
    if p_until is not null or p_per_day is not null then
      raise exception 'an organisation stays suspended until it is lifted' using errcode = '22023';
    end if;
    if o.status <> 'verified' then
      raise exception 'only a verified organisation can be suspended' using errcode = '55000';
    end if;
  else
    raise exception 'choose warn, throttle or suspend' using errcode = '22023';
  end if;
  if p_kind in ('throttle', 'suspend') and exists (
       select 1 from public.sanctions s where s.org_id = p_org and s.kind = p_kind::public.sanction_kind
          and s.lifted_at is null and (s.until is null or s.until > now())) then
    raise exception 'this organisation already has an active %; lift it first', p_kind using errcode = '55000';
  end if;

  insert into public.sanctions (org_id, kind, until, per_day, reason, staff_id)
  values (p_org, p_kind::public.sanction_kind, p_until, p_per_day, v_reason, v_me)
  returning * into v_new;
  if p_kind = 'suspend' then
    update public.organizations set status = 'suspended', status_reason = v_reason where id = p_org;
  end if;
  for m in select om.user_id from public.org_members om where om.org_id = p_org and om.role = 'admin' and om.status = 'active' loop
    perform private.notify(m.user_id, null, 'org_sanctioned', 'sanction', v_new.id,
                           jsonb_build_object('kind', p_kind, 'until', p_until, 'per_day', p_per_day, 'org_name', o.name));
  end loop;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'org_sanction.' || p_kind, 'organization', p_org::text, v_reason,
          jsonb_build_object('status', o.status),
          jsonb_build_object('status', (select status from public.organizations where id = p_org), 'sanction', private.sanction_json(v_new)));
  return v_new.id;
end;
$$;

-- Internal: lift one sanction and undo its effects. The caller has checked the role.
create function private.lift_sanction_row(p_id uuid, p_staff uuid, p_reason text)
returns public.sanctions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.sanctions;
begin
  update public.sanctions set lifted_at = now(), lifted_by = p_staff, lift_reason = p_reason
   where id = p_id and lifted_at is null
  returning * into s;
  if s.id is null then
    raise exception 'that sanction was already lifted' using errcode = '55000';
  end if;
  if s.kind = 'ban' and s.user_id is not null and private.active_restriction(s.user_id) is null then
    update auth.users set banned_until = null where id = s.user_id;
  end if;
  if s.kind = 'suspend' and s.org_id is not null then
    update public.organizations set status = 'verified', status_reason = null where id = s.org_id and status = 'suspended';
  end if;
  if s.user_id is not null and s.kind in ('suspend', 'ban') then
    perform private.notify(s.user_id, null, 'restriction_lifted', 'sanction', s.id, jsonb_build_object('kind', s.kind));
  end if;
  return s;
end;
$$;
revoke all on function private.lift_sanction_row(uuid, uuid, text) from public;

-- Moderators lift user warnings and suspensions, super admins bans, accounts staff organisation sanctions.
create function private.lift_sanction(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  v_reason text := btrim(coalesce(p_reason, ''));
  s public.sanctions;
  v_after public.sanctions;
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select * into s from public.sanctions where id = p_id for update;
  if s.id is null then
    raise exception 'sanction not found' using errcode = 'P0002';
  end if;
  if (s.org_id is not null and not private.is_staff('accounts'))
     or (s.kind = 'ban' and not private.is_staff('super_admin'))
     or (s.user_id is not null and s.kind <> 'ban' and not private.is_staff('moderator')) then
    raise exception 'your role can''t lift this sanction' using errcode = '42501';
  end if;
  if s.lifted_at is null and s.until is not null and s.until <= now() then
    raise exception 'this sanction has already ended' using errcode = '55000';
  end if;
  v_after := private.lift_sanction_row(p_id, v_me, v_reason);
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'sanction.lift', 'sanction', p_id::text, v_reason, private.sanction_json(s), private.sanction_json(v_after));
end;
$$;

-- Staff list: active (or recent) sanctions across users and organisations.
create function private.ops_sanctions(p_active boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  if not (private.is_staff('moderator') or private.is_staff('accounts')) then
    raise exception 'moderators and accounts staff only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'kind', s.kind, 'until', s.until, 'per_day', s.per_day, 'reason', s.reason, 'created_at', s.created_at,
             'lifted_at', s.lifted_at, 'lift_reason', s.lift_reason, 'case_id', s.case_id,
             'user_id', s.user_id, 'user_name', p.full_name, 'org_id', s.org_id, 'org_name', o.name,
             'staff_name', sp.full_name, 'staff_is_me', s.staff_id = v_me)
             order by s.created_at desc)
      from public.sanctions s
      left join public.profiles p on p.user_id = s.user_id
      left join public.organizations o on o.id = s.org_id
      left join public.profiles sp on sp.user_id = s.staff_id
     where case when p_active then s.lifted_at is null and (s.until is null or s.until > now()) and s.kind <> 'warn'
                else s.created_at > now() - interval '90 days' end
       and ((s.org_id is not null and private.is_staff('accounts')) or (s.user_id is not null and private.is_staff('moderator')))
     limit 500), '[]'::jsonb);
end;
$$;

-- Moderators find an account by its sign-in email or username.
create function private.ops_find_account(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  return (select jsonb_build_object('user_id', u.id, 'name', p.full_name, 'username', p.username, 'email', u.email,
                                    'active', private.sanction_json(private.active_restriction(u.id)))
            from auth.users u
            left join public.profiles p on p.user_id = u.id
           where u.email = v_q or p.username = ltrim(v_q, '@')
           limit 1);
end;
$$;

-- The account a report case is about, for the sanction form on the case page.
create function private.ops_case_owner(p_case uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_moderator();
begin
  return (select c.owner_id from public.report_cases c where c.id = p_case);
end;
$$;

-- The signed-in account's current suspension or ban, for the banner.
create function private.my_restriction()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.id is null then null
              else jsonb_build_object('id', s.id, 'kind', s.kind, 'until', s.until, 'reason', s.reason) end
    from (select (private.active_restriction((select auth.uid()))).*) s;
$$;

-- ---------------------------------------------------------------------------
-- Appeals
-- ---------------------------------------------------------------------------
create type public.appeal_decision_type as enum ('sanction', 'report_case', 'cv_revocation', 'credential', 'code_check');
create type public.appeal_status as enum ('pending', 'upheld', 'overturned');

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  decision_type public.appeal_decision_type not null,
  decision_id uuid not null,
  appellant_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  -- Who made the decision and which role decides the appeal, fixed when the appeal is filed.
  original_staff_id uuid not null references auth.users (id) on delete restrict,
  decider_role public.staff_role not null,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  filed_by uuid references auth.users (id) on delete set null,
  status public.appeal_status not null default 'pending',
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(btrim(decision_reason)) between 3 and 2000),
  outcome jsonb,
  created_at timestamptz not null default now(),
  unique (decision_type, decision_id),
  check (decided_by is null or decided_by <> original_staff_id),
  check (claimed_by is null or claimed_by <> original_staff_id),
  check ((status = 'pending') = (decided_at is null)),
  check (status = 'pending' or decision_reason is not null)
);
comment on table public.appeals is
  'One appeal per decision (PRD 5.26), decided by a different staff member, final. Written only by functions.';
create index appeals_queue_idx on public.appeals (status, created_at);
create index appeals_appellant_idx on public.appeals (appellant_id, created_at desc);
create index appeals_org_idx on public.appeals (org_id) where org_id is not null;
create index appeals_original_staff_idx on public.appeals (original_staff_id);
create index appeals_claimed_by_idx on public.appeals (claimed_by) where claimed_by is not null;
create index appeals_decided_by_idx on public.appeals (decided_by) where decided_by is not null;
create index appeals_filed_by_idx on public.appeals (filed_by) where filed_by is not null;

-- The checks above already stop the original staff member; the trigger also stops a decided
-- appeal from changing again (final) and gives a readable refusal.
create function private.appeals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'this appeal was decided; the decision is final' using errcode = '55000';
  end if;
  if new.decided_by = new.original_staff_id or new.claimed_by = new.original_staff_id then
    raise exception 'you made the original decision, so another staff member must decide this appeal' using errcode = '42501';
  end if;
  if (new.decision_type, new.decision_id, new.appellant_id, new.original_staff_id, new.decider_role, new.body)
     is distinct from (old.decision_type, old.decision_id, old.appellant_id, old.original_staff_id, old.decider_role, old.body) then
    raise exception 'an appeal''s decision and text can''t change' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.appeals_guard() from public;
create trigger appeals_guard before update on public.appeals for each row execute function private.appeals_guard();

alter table public.appeals enable row level security;
revoke all on table public.appeals from anon, authenticated;
grant select on table public.appeals to authenticated;
create policy appeals_read on public.appeals for select to authenticated
  using (appellant_id = (select auth.uid()) or (select private.is_staff(decider_role)));

-- What a decision is, who owns it, who made it and which role decides an appeal. Null when the
-- decision can't be appealed (wrong state, a dismissal, an expired or lifted restriction).
create function private.appeal_subject(p_type public.appeal_decision_type, p_id uuid)
returns table (owner_id uuid, org_id uuid, staff_id uuid, decided_at timestamptz, decider_role public.staff_role, summary jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_type = 'sanction' then
    return query
    select s.user_id, s.org_id, s.staff_id, s.created_at,
           (case when s.org_id is not null then 'accounts' when s.kind = 'ban' then 'super_admin' else 'moderator' end)::public.staff_role,
           jsonb_build_object('kind', s.kind, 'until', s.until, 'per_day', s.per_day, 'reason', s.reason,
                              'org_name', (select o.name from public.organizations o where o.id = s.org_id))
      from public.sanctions s
     where s.id = p_id and s.lifted_at is null and (s.until is null or s.until > now())
       -- A warning from a report case is appealed through the case.
       and not (s.kind = 'warn' and s.case_id is not null);
  elsif p_type = 'report_case' then
    return query
    select c.owner_id, null::uuid, c.resolved_by, c.resolved_at, 'moderator'::public.staff_role,
           jsonb_build_object('status', c.status, 'target_type', c.target_type, 'reason', c.resolution_reason,
                              'excerpt', left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 200))
      from public.report_cases c
     where c.id = p_id and c.status in ('removed', 'warned') and c.owner_id is not null and c.resolved_by is not null;
  elsif p_type = 'cv_revocation' then
    return query
    select r.user_id, null::uuid, r.revoked_by, r.revoked_at, 'trust_reviewer'::public.staff_role,
           jsonb_build_object('code', r.code, 'version', r.version)
      from public.cv_records r
     where r.id = p_id and r.revoked_reason = 'staff' and r.revoked_by is not null and r.user_id is not null;
  elsif p_type = 'credential' then
    return query
    select c.user_id, null::uuid, c.reviewer_id, c.reviewed_at, 'trust_reviewer'::public.staff_role,
           jsonb_build_object('title', c.title, 'issuer', c.issuer, 'reason', c.review_reason)
      from public.credentials c
     where c.id = p_id and c.status = 'rejected' and c.reviewer_id is not null;
  elsif p_type = 'code_check' then
    return query
    select c.user_id, null::uuid, c.grader_id, c.graded_at, 'trust_reviewer'::public.staff_role,
           jsonb_build_object('skill', (select k.name from public.skills k where k.id = c.skill_id), 'feedback', c.feedback)
      from public.code_checks c
     where c.id = p_id and c.status = 'failed' and c.grader_id is not null;
  end if;
end;
$$;
revoke all on function private.appeal_subject(public.appeal_decision_type, uuid) from public;

-- Decisions the signed-in account (or an organisation it administers) can still appeal: 30 days.
create function private.my_appealable()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  candidates as (
    select 'sanction'::public.appeal_decision_type as t, s.id from public.sanctions s, me
     where s.user_id = me.id or s.org_id in (select om.org_id from public.org_members om where om.user_id = me.id and om.role = 'admin' and om.status = 'active')
    union all select 'report_case', c.id from public.report_cases c, me where c.owner_id = me.id
    union all select 'cv_revocation', r.id from public.cv_records r, me where r.user_id = me.id and r.revoked_reason = 'staff'
    union all select 'credential', c.id from public.credentials c, me where c.user_id = me.id and c.status = 'rejected'
    union all select 'code_check', c.id from public.code_checks c, me where c.user_id = me.id and c.status = 'failed'
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', c.t, 'id', c.id, 'decided_at', x.decided_at, 'summary', x.summary,
                                               'deadline', x.decided_at + interval '30 days')
                            order by x.decided_at desc), '[]'::jsonb)
    from candidates c
    cross join lateral private.appeal_subject(c.t, c.id) x
   where x.decided_at > now() - interval '30 days'
     and not exists (select 1 from public.appeals a where a.decision_type = c.t and a.decision_id = c.id);
$$;

create function private.my_appeals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'type', a.decision_type, 'summary', a.summary, 'body', a.body,
                                               'status', a.status, 'created_at', a.created_at, 'decided_at', a.decided_at,
                                               'decision_reason', a.decision_reason)
                            order by a.created_at desc), '[]'::jsonb)
    from public.appeals a
   where a.appellant_id = (select auth.uid());
$$;

-- Internal: file an appeal for p_appellant (checked by the caller).
create function private.file_appeal(p_type public.appeal_decision_type, p_id uuid, p_body text, p_appellant uuid, p_filed_by uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  x record;
  v_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 10 and 2000 then
    raise exception 'explain your appeal in 10 to 2,000 characters' using errcode = '22023';
  end if;
  select * into x from private.appeal_subject(p_type, p_id);
  if x.decided_at is null then
    raise exception 'this decision can''t be appealed' using errcode = 'P0002';
  end if;
  if not (x.owner_id = p_appellant
          or (x.org_id is not null and exists (select 1 from public.org_members om where om.org_id = x.org_id and om.user_id = p_appellant
                                                 and om.role = 'admin' and om.status = 'active'))) then
    raise exception 'this decision can''t be appealed' using errcode = 'P0002';
  end if;
  if x.decided_at <= now() - interval '30 days' then
    raise exception 'appeals close 30 days after the decision' using errcode = '55000';
  end if;
  if exists (select 1 from public.appeals a where a.decision_type = p_type and a.decision_id = p_id) then
    raise exception 'this decision has already been appealed' using errcode = '23505';
  end if;
  insert into public.appeals (decision_type, decision_id, appellant_id, org_id, body, original_staff_id, decider_role, summary, filed_by)
  values (p_type, p_id, p_appellant, x.org_id, v_body, x.staff_id, x.decider_role, x.summary, p_filed_by)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.file_appeal(public.appeal_decision_type, uuid, text, uuid, uuid) from public;

create function private.submit_appeal(p_type text, p_id uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_type not in ('sanction', 'report_case', 'cv_revocation', 'credential', 'code_check') then
    raise exception 'this decision can''t be appealed' using errcode = '22023';
  end if;
  return private.file_appeal(p_type::public.appeal_decision_type, p_id, p_body, v_me, null);
end;
$$;

-- A banned account can't sign in: its appeal arrives by email and a staff member files it.
create function private.ops_file_appeal(p_type text, p_id uuid, p_body text, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  x record;
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_type not in ('sanction', 'report_case', 'cv_revocation', 'credential', 'code_check') then
    raise exception 'this decision can''t be appealed' using errcode = '22023';
  end if;
  select * into x from private.appeal_subject(p_type::public.appeal_decision_type, p_id);
  if x.decided_at is null or x.owner_id is null then
    raise exception 'this decision can''t be appealed' using errcode = 'P0002';
  end if;
  v_id := private.file_appeal(p_type::public.appeal_decision_type, p_id, p_body, x.owner_id, v_me);
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'appeal.file_for_user', 'appeal', v_id::text, btrim(p_reason), null,
          jsonb_build_object('decision_type', p_type, 'decision_id', p_id, 'appellant_id', x.owner_id));
  return v_id;
end;
$$;

create function private.require_appeal_decider(a public.appeals)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  if not private.is_staff(a.decider_role) then
    raise exception 'your role can''t decide this appeal' using errcode = '42501';
  end if;
  if a.original_staff_id = v_me then
    raise exception 'you made the original decision, so another staff member must decide this appeal' using errcode = '42501';
  end if;
  return v_me;
end;
$$;
revoke all on function private.require_appeal_decider(public.appeals) from public;

create function private.ops_appeals(p_open boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'type', a.decision_type, 'summary', a.summary, 'status', a.status, 'created_at', a.created_at,
             'decided_at', a.decided_at, 'appellant_name', p.full_name, 'decider_role', a.decider_role,
             'claimed_by_name', cb.full_name, 'claimed_by_me', a.claimed_by = v_me, 'mine_originally', a.original_staff_id = v_me,
             -- Only the original decider holds the deciding role: nobody can decide it yet.
             'stuck', a.status = 'pending' and not exists (
                 select 1 from public.staff_roles r where r.user_id <> a.original_staff_id and (r.role = a.decider_role or r.role = 'super_admin')))
             order by a.created_at)
      from public.appeals a
      left join public.profiles p on p.user_id = a.appellant_id
      left join public.profiles cb on cb.user_id = a.claimed_by
     where private.is_staff(a.decider_role)
       and case when p_open then a.status = 'pending' else a.status <> 'pending' and a.decided_at > now() - interval '90 days' end
     limit 500), '[]'::jsonb);
end;
$$;

create function private.ops_appeal_case(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  a public.appeals;
begin
  select * into a from public.appeals where id = p_id;
  if a.id is null or not private.is_staff(a.decider_role) then
    raise exception 'appeal not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', a.id, 'type', a.decision_type, 'decision_id', a.decision_id, 'summary', a.summary, 'body', a.body,
    'status', a.status, 'created_at', a.created_at, 'decided_at', a.decided_at, 'decision_reason', a.decision_reason,
    'outcome', a.outcome, 'decider_role', a.decider_role,
    'appellant_id', a.appellant_id, 'appellant_name', (select p.full_name from public.profiles p where p.user_id = a.appellant_id),
    'org_name', (select o.name from public.organizations o where o.id = a.org_id),
    'original_staff_name', (select p.full_name from public.profiles p where p.user_id = a.original_staff_id),
    'mine_originally', a.original_staff_id = v_me,
    'claimed_by_name', (select p.full_name from public.profiles p where p.user_id = a.claimed_by),
    'claimed_by_me', a.claimed_by = v_me,
    'decided_by_name', (select p.full_name from public.profiles p where p.user_id = a.decided_by),
    'filed_by_staff', a.filed_by is not null);
end;
$$;

create function private.claim_appeal(p_id uuid, p_claim boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.appeals;
  v_me uuid;
begin
  select * into a from public.appeals where id = p_id for update;
  if a.id is null then
    raise exception 'appeal not found' using errcode = 'P0002';
  end if;
  v_me := private.require_appeal_decider(a);
  if a.status <> 'pending' then
    raise exception 'this appeal was decided; the decision is final' using errcode = '55000';
  end if;
  if p_claim then
    if a.claimed_by is not null and a.claimed_by <> v_me then
      raise exception 'someone else is deciding this appeal' using errcode = '55000';
    end if;
    update public.appeals set claimed_by = v_me, claimed_at = now() where id = p_id;
  else
    if a.claimed_by is distinct from v_me then
      raise exception 'you haven''t claimed this appeal' using errcode = '55000';
    end if;
    update public.appeals set claimed_by = null, claimed_at = null where id = p_id;
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_claim then 'appeal.claim' else 'appeal.release' end, 'appeal', p_id::text,
          case when p_claim then 'claimed to decide' else 'released' end,
          jsonb_build_object('claimed_by', a.claimed_by), jsonb_build_object('claimed_by', case when p_claim then v_me end));
end;
$$;

-- Internal: undo what an overturned decision did, where it can be undone. Returns what changed.
create function private.overturn_decision(a public.appeals, p_staff uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.report_cases;
  v_visibility text;
  v_out jsonb := '{}'::jsonb;
  v_n integer;
  v_user uuid;
  s record;
begin
  if a.decision_type = 'sanction' then
    perform private.lift_sanction_row(a.decision_id, p_staff, 'Appeal overturned: ' || p_reason);
    v_out := jsonb_build_object('sanction_lifted', a.decision_id);
  elsif a.decision_type = 'report_case' then
    select * into c from public.report_cases where id = a.decision_id;
    if c.status = 'removed' and c.target_type = 'post' then
      update public.posts set removed_at = null, removed_by = null where id = c.target_id and removed_at is not null;
      v_out := v_out || jsonb_build_object('post_restored', found);
    elsif c.status = 'removed' and c.target_type = 'venture' then
      select l.before ->> 'visibility' into v_visibility from public.ops_audit_log l
       where l.target_type = 'report_case' and l.target_id = c.id::text and l.action = 'report.unlist'
       order by l.created_at desc limit 1;
      if v_visibility is not null then
        update public.ventures set visibility = v_visibility::public.venture_visibility where id = c.target_id and visibility = 'unlisted';
        v_out := v_out || jsonb_build_object('venture_visibility', v_visibility);
      end if;
    elsif c.status = 'removed' then
      -- Removed comments and messages are blanked and cleared profile photos deleted: nothing to restore.
      v_out := v_out || jsonb_build_object('content_restored', false);
    end if;
    for s in select id from public.sanctions where case_id = c.id and lifted_at is null loop
      perform private.lift_sanction_row(s.id, p_staff, 'Appeal overturned: ' || p_reason);
    end loop;
    delete from public.ranking_adjustments where case_id = c.id;
    get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('penalties_removed', v_n);
  elsif a.decision_type = 'credential' then
    update public.credentials set status = 'approved', reviewer_id = p_staff, reviewed_at = now(),
           review_reason = 'Approved on appeal: ' || p_reason
     where id = a.decision_id and status = 'rejected'
    returning user_id into v_user;
    v_out := jsonb_build_object('credential_approved', v_user is not null);
  elsif a.decision_type = 'code_check' then
    update public.code_checks set status = 'passed', feedback = left(coalesce(feedback || E'\n\n', '') || 'Passed on appeal: ' || p_reason, 2000)
     where id = a.decision_id and status = 'failed'
    returning user_id into v_user;
    if v_user is not null then
      perform private.recompute_user_skills(v_user);
    end if;
    v_out := jsonb_build_object('code_check_passed', v_user is not null);
  elsif a.decision_type = 'cv_revocation' then
    -- A signed revocation stands; the student issues a new CV from /me/cv.
    v_out := jsonb_build_object('reissue_allowed', true);
  end if;
  return v_out;
end;
$$;
revoke all on function private.overturn_decision(public.appeals, uuid, text) from public;

-- p_outcome: upheld (the decision stands) | overturned (it is reversed where it can be). Final.
create function private.decide_appeal(p_id uuid, p_outcome text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.appeals;
  v_me uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_out jsonb := '{}'::jsonb;
begin
  select * into a from public.appeals where id = p_id for update;
  if a.id is null then
    raise exception 'appeal not found' using errcode = 'P0002';
  end if;
  v_me := private.require_appeal_decider(a);
  if a.status <> 'pending' then
    raise exception 'this appeal was decided; the decision is final' using errcode = '55000';
  end if;
  if a.claimed_by is distinct from v_me then
    raise exception 'claim the appeal first' using errcode = '55000';
  end if;
  if p_outcome not in ('upheld', 'overturned') then
    raise exception 'choose upheld or overturned' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_outcome = 'overturned' then
    v_out := private.overturn_decision(a, v_me, v_reason);
  end if;
  update public.appeals
     set status = p_outcome::public.appeal_status, decided_by = v_me, decided_at = now(), decision_reason = v_reason, outcome = v_out
   where id = p_id;
  perform private.notify(a.appellant_id, null, 'appeal_decided', 'appeal', a.id,
                         jsonb_build_object('outcome', p_outcome, 'decision_type', a.decision_type));
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'appeal.' || p_outcome, 'appeal', p_id::text, v_reason,
          jsonb_build_object('status', a.status, 'decision_type', a.decision_type, 'decision_id', a.decision_id),
          jsonb_build_object('status', p_outcome, 'outcome', v_out));
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbox: appeals join the queues
-- ---------------------------------------------------------------------------
create or replace function private.ops_inbox(p_queue text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  v_mod boolean := private.is_staff('moderator');
  v_trust boolean := private.is_staff('trust_reviewer');
  v_acc boolean := private.is_staff('accounts');
  v_items jsonb;
  v_queues jsonb;
begin
  with items as (
    select 'reports'::text as queue, c.id::text as id, c.target_type::text as title,
           left(coalesce(c.snapshot->>'body', c.snapshot->>'bio', c.snapshot->>'title', ''), 120) as detail,
           c.opened_at as waiting_since, c.claimed_by, '/ops/reports/' || c.id as href
      from public.report_cases c
     where v_mod and c.status = 'open'
    union all
    select 'credentials', c.id::text, c.title, c.issuer, c.created_at, c.claimed_by, '/ops/evidence/credentials/' || c.id
      from public.credentials c
     where v_trust and c.status = 'pending'
    union all
    select 'github_flags', f.id::text, f.kind::text, null, f.created_at, f.claimed_by, '/ops/evidence/flags/' || f.id
      from public.review_flags f
     where v_trust and f.status = 'open'
    union all
    select 'code_checks', c.id::text, c.skill_id, null, coalesce(c.routed_to_staff_at, c.submitted_at), c.claimed_by,
           '/ops/evidence/code-checks/' || c.id
      from public.code_checks c
     where v_trust and c.status = 'submitted' and c.routed_to_staff_at is not null
    union all
    select 'ranking_flags', f.id::text, f.kind::text, null, f.created_at, f.claimed_by, '/ops/evidence/ranking/' || f.id
      from public.anti_gaming_flags f
     where v_trust and f.status = 'open'
    union all
    select 'teachers', t.user_id::text, t.title, t.department, t.requested_at, null::uuid, '/ops/teachers'
      from public.teacher_profiles t
     where (v_acc or v_trust) and t.status = 'pending'
    union all
    select 'orgs', o.id::text, o.name, o.domain, o.created_at, null::uuid, '/ops/orgs/' || o.id
      from public.organizations o
     where v_acc and o.status = 'pending'
    union all
    select 'uni_claims', c.id::text, u.name, c.title, c.created_at, null::uuid, '/ops/universities/claims/' || c.id
      from public.university_claims c
      join public.universities u on u.id = c.university_id
     where v_acc and c.status = 'pending'
    union all
    select 'uni_domains', d.id::text, u.name, d.domain, d.created_at, null::uuid, '/ops/universities'
      from public.university_domain_requests d
      join public.universities u on u.id = d.university_id
     where v_acc and d.status = 'pending'
    union all
    select 'billing_tasks', b.id::text, b.kind, b.subject_type::text, b.created_at, null::uuid, '/ops/billing#tasks-h'
      from public.billing_tasks b
     where v_acc and b.done_at is null
    union all
    select 'feedback', f.id::text, f.type::text, left(f.body, 120), f.created_at, f.claimed_by, '/ops/feedback/' || f.id
      from public.feedback f
     where f.status in ('received', 'reviewing')
    union all
    select 'appeals', a.id::text, a.decision_type::text, left(a.body, 120), a.created_at, a.claimed_by, '/ops/appeals/' || a.id
      from public.appeals a
     where a.status = 'pending' and private.is_staff(a.decider_role)
  ),
  sla(queue, hours, claimable) as (
    values ('reports', 24, true), ('credentials', 72, true), ('github_flags', 72, true), ('code_checks', 48, true),
           ('ranking_flags', 72, true), ('teachers', 72, false), ('orgs', 48, false), ('uni_claims', 72, false),
           ('uni_domains', 72, false), ('billing_tasks', 72, false), ('feedback', 168, true),
           ('appeals', 72, true)
  ),
  agg as (
    select i.queue, count(*)::integer as total,
           count(*) filter (where i.claimed_by is null)::integer as unclaimed,
           count(*) filter (where i.claimed_by = v_me)::integer as mine,
           count(*) filter (where i.waiting_since < now() - make_interval(hours => s.hours))::integer as overdue,
           min(i.waiting_since) as oldest
      from items i join sla s using (queue)
     group by i.queue
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
        'queue', a.queue, 'total', a.total, 'unclaimed', a.unclaimed, 'mine', a.mine,
        'overdue', a.overdue, 'oldest', a.oldest, 'sla_hours', s.hours, 'claimable', s.claimable)
        order by a.oldest)
      from agg a join sla s using (queue)), '[]'::jsonb),
    coalesce((select jsonb_agg(x.item order by x.waiting_since) from (
      select i.waiting_since, jsonb_build_object(
               'queue', i.queue, 'id', i.id, 'title', i.title, 'detail', i.detail,
               'waiting_since', i.waiting_since, 'href', i.href, 'claimable', s.claimable,
               'overdue', i.waiting_since < now() - make_interval(hours => s.hours),
               'claimed_by_name', p.full_name, 'claimed_by_me', i.claimed_by = v_me) as item
        from items i
        join sla s using (queue)
        left join public.profiles p on p.user_id = i.claimed_by
       where p_queue is null or i.queue = p_queue
       order by i.waiting_since
       limit 200) x), '[]'::jsonb)
    into v_queues, v_items;
  return jsonb_build_object('queues', v_queues, 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (security invoker)
-- ---------------------------------------------------------------------------
create function pg_temp.expose(p_names text[])
returns void
language plpgsql
as $$
declare
  n text;
  r record;
  v_names text;
begin
  foreach n in array p_names loop
    select p.oid, p.proname, p.provolatile, p.proargnames,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident,
           pg_get_function_result(p.oid) as result
      into r
      from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = n;
    if r.oid is null then
      raise exception 'no private function %', n;
    end if;
    select coalesce(string_agg(a, ', ' order by ord), '') into v_names
      from unnest(coalesce(r.proargnames, '{}'::text[])) with ordinality as t(a, ord);
    execute format('revoke all on function private.%I(%s) from public', n, r.ident);
    execute format('grant execute on function private.%I(%s) to authenticated', n, r.ident);
    execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path = %L as $f$ select private.%I(%s) $f$',
                   n, r.args, r.result, case r.provolatile when 'v' then 'volatile' else 'stable' end, '', n, v_names);
    execute format('revoke all on function public.%I(%s) from public, anon', n, r.ident);
    execute format('grant execute on function public.%I(%s) to authenticated', n, r.ident);
  end loop;
end;
$$;

select pg_temp.expose(array[
  'sanction_user', 'sanction_org', 'lift_sanction', 'ops_sanctions', 'ops_find_account', 'ops_case_owner', 'my_restriction',
  'my_appealable', 'my_appeals', 'submit_appeal', 'ops_file_appeal', 'ops_appeals', 'ops_appeal_case', 'claim_appeal', 'decide_appeal'
]);
drop function pg_temp.expose(text[]);
