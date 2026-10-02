-- Phase 11, slice 1 (PRD 5.26): one ops inbox across every staff queue, staff roles
-- management and the audit log viewer. No new tables: the inbox reads the queues built in
-- phases 3-10, roles live in staff_roles (phase 1) and history in ops_audit_log (phase 3).
-- Staff two-factor is enforced by private.is_staff() (aal2 only) and proxy.ts.

-- ---------------------------------------------------------------------------
-- Super admin guard
-- ---------------------------------------------------------------------------
create function private.require_super_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('super_admin') then
    raise exception 'super admins only, with two-factor on' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_super_admin() from public;

-- ---------------------------------------------------------------------------
-- Inbox: counts, age and claim state for every queue the caller's roles open
-- ---------------------------------------------------------------------------
-- Each item names its queue; the app maps claimable queues to their existing claim
-- function (claim_case, claim_credential, claim_review_flag, claim_code_check,
-- claim_ranking_flag, claim_feedback). sla_hours is the age after which an item is overdue.
create function private.ops_inbox(p_queue text default null)
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
  ),
  sla(queue, hours, claimable) as (
    values ('reports', 24, true), ('credentials', 72, true), ('github_flags', 72, true), ('code_checks', 48, true),
           ('ranking_flags', 72, true), ('teachers', 72, false), ('orgs', 48, false), ('uni_claims', 72, false),
           ('uni_domains', 72, false), ('billing_tasks', 72, false), ('feedback', 168, true)
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
-- Staff roles (super admin): grant and revoke with a reason, audited
-- ---------------------------------------------------------------------------
create function private.staff_roles_of(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(s.role order by s.role), '[]'::jsonb) from public.staff_roles s where s.user_id = p_user;
$$;
revoke all on function private.staff_roles_of(uuid) from public;

create function private.ops_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', x.user_id, 'name', p.full_name, 'email', u.email,
             'roles', x.roles, 'since', x.since, 'is_me', x.user_id = v_me,
             'two_factor', exists (select 1 from auth.mfa_factors f where f.user_id = x.user_id and f.status = 'verified'))
             order by p.full_name)
      from (select s.user_id, jsonb_agg(s.role order by s.role) as roles, min(s.granted_at) as since
              from public.staff_roles s group by s.user_id) x
      join auth.users u on u.id = x.user_id
      left join public.profiles p on p.user_id = x.user_id), '[]'::jsonb);
end;
$$;

-- p_email: the account's sign-in email. Only accounts with a verified authenticator can
-- hold a role (the role counts only on aal2 anyway; this stops granting a dead role).
create function private.grant_staff_role(p_email text, p_role public.staff_role, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
  v_user uuid;
  v_before jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where u.email = lower(btrim(coalesce(p_email, '')));
  if v_user is null then
    raise exception 'no account with that email' using errcode = 'P0002';
  end if;
  if not exists (select 1 from auth.mfa_factors f where f.user_id = v_user and f.status = 'verified') then
    raise exception 'that account has no two-factor set up' using errcode = '55000';
  end if;
  perform 1 from public.staff_roles s where s.user_id = v_user for update;
  v_before := private.staff_roles_of(v_user);
  if v_before ? p_role::text then
    raise exception 'that account already has this role' using errcode = '23505';
  end if;
  insert into public.staff_roles (user_id, role, granted_by) values (v_user, p_role, v_me);
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'staff.grant', 'user', v_user::text, v_reason,
          jsonb_build_object('roles', v_before), jsonb_build_object('roles', private.staff_roles_of(v_user)));
  return v_user;
end;
$$;

create function private.revoke_staff_role(p_user uuid, p_role public.staff_role, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
  v_before jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_role = 'super_admin' then
    if p_user = v_me then
      raise exception 'you can''t remove your own super admin role' using errcode = '42501';
    end if;
    -- Serialise super admin changes so two revocations can't both pass the count.
    perform 1 from public.staff_roles s where s.role = 'super_admin' for update;
    if (select count(*) from public.staff_roles s where s.role = 'super_admin' and s.user_id <> p_user) = 0 then
      raise exception 'the last super admin can''t be removed' using errcode = '55000';
    end if;
  end if;
  v_before := private.staff_roles_of(p_user);
  delete from public.staff_roles s where s.user_id = p_user and s.role = p_role;
  if not found then
    raise exception 'that account doesn''t have this role' using errcode = 'P0002';
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'staff.revoke', 'user', p_user::text, v_reason,
          jsonb_build_object('roles', v_before), jsonb_build_object('roles', private.staff_roles_of(p_user)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log viewer (any staff) and export (super admin, itself audited)
-- ---------------------------------------------------------------------------
create function private.ops_audit_search(
  p_staff uuid default null,
  p_action text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'staff_id', a.staff_id, 'staff_name', p.full_name, 'action', a.action,
             'target_type', a.target_type, 'target_id', a.target_id, 'reason', a.reason,
             'before', a.before, 'after', a.after, 'created_at', a.created_at)
             order by a.created_at desc, a.id)
      from (select * from public.ops_audit_log l
             where (p_staff is null or l.staff_id = p_staff)
               and (p_action is null or l.action = p_action)
               and (p_target_type is null or l.target_type = p_target_type)
               and (p_target_id is null or l.target_id = p_target_id)
               and (p_from is null or l.created_at >= p_from)
               and (p_to is null or l.created_at < p_to)
               and (p_before is null or l.created_at < p_before)
             order by l.created_at desc, l.id
             limit v_limit) a
      left join public.profiles p on p.user_id = a.staff_id), '[]'::jsonb);
end;
$$;

create function private.ops_audit_filters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  return jsonb_build_object(
    'actions', coalesce((select jsonb_agg(x.action order by x.action) from (select distinct l.action from public.ops_audit_log l) x), '[]'::jsonb),
    'target_types', coalesce((select jsonb_agg(x.target_type order by x.target_type) from (select distinct l.target_type from public.ops_audit_log l) x), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', x.staff_id, 'name', coalesce(p.full_name, 'Former staff')) order by p.full_name)
                         from (select distinct l.staff_id from public.ops_audit_log l) x
                         left join public.profiles p on p.user_id = x.staff_id), '[]'::jsonb));
end;
$$;

-- Up to 10,000 rows matching the filters, newest first. The export is recorded first, so
-- even a failed download leaves a trace.
create function private.ops_audit_export(
  p_reason text,
  p_staff uuid default null,
  p_action text default null,
  p_target_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_filters jsonb := jsonb_strip_nulls(jsonb_build_object('staff', p_staff, 'action', p_action, 'target_type', p_target_type,
                                                          'from', p_from, 'to', p_to));
  v_rows jsonb;
begin
  if char_length(v_reason) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'created_at', a.created_at, 'staff_id', a.staff_id, 'staff_name', p.full_name, 'action', a.action,
           'target_type', a.target_type, 'target_id', a.target_id, 'reason', a.reason, 'before', a.before, 'after', a.after)
           order by a.created_at desc, a.id), '[]'::jsonb)
    into v_rows
    from (select * from public.ops_audit_log l
           where (p_staff is null or l.staff_id = p_staff)
             and (p_action is null or l.action = p_action)
             and (p_target_type is null or l.target_type = p_target_type)
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at < p_to)
           order by l.created_at desc, l.id
           limit 10000) a
    left join public.profiles p on p.user_id = a.staff_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'audit.export', 'audit_log', 'export', v_reason, v_filters, jsonb_build_object('rows', jsonb_array_length(v_rows)));
  return v_rows;
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
  'ops_inbox', 'ops_staff', 'grant_staff_role', 'revoke_staff_role', 'ops_audit_search', 'ops_audit_filters', 'ops_audit_export'
]);
drop function pg_temp.expose(text[]);
