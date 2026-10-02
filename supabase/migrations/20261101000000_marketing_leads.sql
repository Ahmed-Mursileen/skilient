-- Phase 12, slice 3 (PRD 5.1): "Talk to us" from /universities as sales leads in /ops/leads, and the
-- pricing page's add-ons, hiring fees and trial length, readable signed out.

-- ---------------------------------------------------------------------------
-- Sales leads
-- ---------------------------------------------------------------------------
create type public.sales_lead_status as enum ('new', 'contacted', 'won', 'lost');

create table public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'university' check (kind in ('university')),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  role text not null check (char_length(btrim(role)) between 2 and 80),
  organisation text not null check (char_length(btrim(organisation)) between 2 and 200),
  -- The HEC university the email's domain belongs to, when it does.
  university_id uuid references public.universities (id) on delete set null,
  email text not null check (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[^\s@]+@[^\s@]+$'),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  status public.sales_lead_status not null default 'new',
  claimed_by uuid references auth.users (id) on delete set null,
  staff_note text check (staff_note is null or char_length(staff_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sales_leads is
  'University "Talk to us" requests from /universities (PRD 5.1), worked by accounts staff in /ops/leads. Never read by the app outside /ops.';
create index sales_leads_queue_idx on public.sales_leads (status, created_at desc);
create index sales_leads_university_idx on public.sales_leads (university_id) where university_id is not null;
create index sales_leads_claimed_by_idx on public.sales_leads (claimed_by) where claimed_by is not null;
create trigger sales_leads_set_updated_at before update on public.sales_leads
  for each row execute function private.set_updated_at();
alter table public.sales_leads enable row level security;
revoke all on table public.sales_leads from anon, authenticated;

-- Signed out, from the Talk to us form (the action checks Turnstile, the honeypot and the per-IP limit).
create function private.submit_sales_lead(p_name text, p_role text, p_organisation text, p_email text, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_domain text := private.email_domain(p_email);
  v_id uuid;
begin
  if v_domain is null or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Enter your name.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_role, ''))) not between 2 and 80 then
    raise exception 'Enter your role.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_organisation, ''))) not between 2 and 200 then
    raise exception 'Enter your university.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 10 and 2000 then
    raise exception 'Tell us a little about what you need (10 to 2,000 characters).' using errcode = '22023';
  end if;
  -- The same address can't flood the queue: one open lead per email.
  if exists (select 1 from public.sales_leads l where l.email = v_email and l.status in ('new', 'contacted')) then
    raise exception 'We already have your message and will reply soon.' using errcode = '23505';
  end if;
  insert into public.sales_leads (name, role, organisation, university_id, email, message)
  values (btrim(p_name), btrim(p_role), btrim(p_organisation),
          (select d.university_id from public.university_domains d where d.domain = v_domain order by d.university_id limit 1),
          v_email, btrim(p_message))
  returning id into v_id;
  return v_id;
end;
$$;

-- /ops/leads: newest first, open ones on top (accounts staff).
create function private.ops_sales_leads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'name', l.name, 'role', l.role, 'organisation', l.organisation, 'email', l.email,
             'university_id', l.university_id, 'university', u.name, 'message', l.message, 'status', l.status,
             'claimed_by', p.full_name, 'mine', l.claimed_by = v_me, 'staff_note', l.staff_note, 'created_at', l.created_at)
             order by l.status in ('won', 'lost'), l.created_at desc)
      from (select * from public.sales_leads order by status in ('won', 'lost'), created_at desc limit 200) l
      left join public.universities u on u.id = l.university_id
      left join public.profiles p on p.user_id = l.claimed_by), '[]'::jsonb);
end;
$$;

-- Claim a lead, move it along and leave a note. Audited before and after.
create function private.ops_update_sales_lead(p_id uuid, p_status public.sales_lead_status, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  l public.sales_leads;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into l from public.sales_leads where id = p_id for update;
  if l.id is null then
    raise exception 'lead not found' using errcode = 'P0002';
  end if;
  if l.claimed_by is not null and l.claimed_by <> v_me and p_status <> l.status then
    raise exception 'another staff member is working on this lead' using errcode = '55000';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'keep the note under 2,000 characters' using errcode = '22023';
  end if;
  update public.sales_leads
     set status = p_status, claimed_by = coalesce(claimed_by, v_me), staff_note = coalesce(v_note, staff_note)
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'lead.update', 'sales_lead', p_id::text, coalesce(v_note, 'status ' || p_status::text),
          jsonb_build_object('status', l.status, 'claimed_by', l.claimed_by),
          jsonb_build_object('status', p_status, 'claimed_by', coalesce(l.claimed_by, v_me)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Pricing extras for /pricing (signed out): add-ons, hiring fees and the trial length
-- ---------------------------------------------------------------------------
create function private.public_pricing_extras()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'add_ons', private.config('billing.add_ons'),
    'hire_fees', private.config('billing.hire_fees'),
    'trial_days', private.config('billing.lifecycle') -> 'trial_days')
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (security invoker)
-- ---------------------------------------------------------------------------
create function pg_temp.expose(p_names text[], p_anon boolean)
returns void
language plpgsql
as $$
declare
  n text;
  r record;
  v_names text;
  v_roles text := case when p_anon then 'anon, authenticated' else 'authenticated' end;
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
    execute format('grant execute on function private.%I(%s) to %s', n, r.ident, v_roles);
    execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path = %L as $f$ select private.%I(%s) $f$',
                   n, r.args, r.result, case r.provolatile when 'v' then 'volatile' else 'stable' end, '', n, v_names);
    execute format('revoke all on function public.%I(%s) from public, anon', n, r.ident);
    execute format('grant execute on function public.%I(%s) to %s', n, r.ident, v_roles);
  end loop;
end;
$$;

select pg_temp.expose(array['submit_sales_lead', 'public_pricing_extras'], true);
select pg_temp.expose(array['ops_sales_leads', 'ops_update_sales_lead'], false);
drop function pg_temp.expose(text[], boolean);
