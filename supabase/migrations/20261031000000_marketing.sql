-- Phase 12, slice 1 (PRD 5.1): the marketing site's data.
--   * universities.live_at: students and faculty sign up only at live universities (the NUTECH closed beta);
--     staff open universities from /ops (decisions 2026-10-02).
--   * university_requests: "Request it" from the landing email field, confirmed by email, counted per domain in /ops.
--   * landing_stats(): "Live at" names and live numbers; every number is null below marketing.stats_min (200),
--     so small counts never reach the page.
--   * public_plans(): plan labels, prices and entitlement templates for /pricing, readable signed out.

-- ---------------------------------------------------------------------------
-- Live universities
-- ---------------------------------------------------------------------------
-- New rows default to live (staff-added universities and test fixtures open at once); this migration then
-- closes every university except NUTECH for the closed beta. Local and CI databases reopen all of them in seed.sql.
alter table public.universities add column live_at timestamptz default now();
comment on column public.universities.live_at is
  'When students and faculty could start signing up here (null: not yet, "Request it" on the landing page).';
update public.universities u set live_at = null
 where not exists (select 1 from public.university_domains d where d.university_id = u.id and d.domain = 'nutech.edu.pk');

create function private.university_live(p_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.universities u where u.id = p_university and u.live_at is not null and u.live_at <= now())
$$;
revoke all on function private.university_live(uuid) from public;


-- Signup: as phase 9, plus students and faculty need a live university behind their domain.
-- University officials can sign up anywhere so a portal can be claimed before the university opens.
create or replace function private.validate_signup(p_email text, p_role public.account_role, p_university_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_domain text := private.email_domain(p_email);
  v_kinds public.domain_kind[];
begin
  if v_domain is null then
    return 'Enter a valid email address.';
  end if;
  if p_role = 'recruiter' then
    if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
      return 'Use your work email.';
    end if;
    if exists (select 1 from public.university_domains d where d.domain = v_domain) then
      return 'Use your company email, not a university one.';
    end if;
    return null;
  end if;
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    return 'Use your university email.';
  end if;
  if p_role in ('faculty', 'university_admin') then
    if not private.domain_admits_faculty(v_domain, null) then
      return 'Your university isn''t on Skilient yet.';
    end if;
    if p_university_id is not null and not private.domain_admits_faculty(v_domain, p_university_id) then
      return 'That university doesn''t use this email domain.';
    end if;
    v_kinds := array['faculty', 'both']::public.domain_kind[];
  elsif p_role = 'student' then
    if not private.domain_admits_students(v_domain, null) then
      return 'Your university isn''t on Skilient yet.';
    end if;
    if p_university_id is not null and not private.domain_admits_students(v_domain, p_university_id) then
      return 'That university doesn''t use this email domain.';
    end if;
    v_kinds := array['student', 'both']::public.domain_kind[];
  else
    return 'This kind of account can''t sign up here yet.';
  end if;
  if p_role <> 'university_admin' and not exists (
       select 1 from public.university_domains d
        where d.domain = v_domain and d.kind = any (v_kinds)
          and (p_university_id is null or d.university_id = p_university_id)
          and private.university_live(d.university_id)) then
    return 'Your university isn''t on Skilient yet.';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- University requests
-- ---------------------------------------------------------------------------
create table public.university_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[^\s@]+@[^\s@]+$'),
  domain text not null check (char_length(domain) between 3 and 253),
  -- A known university that isn't live yet; null for a domain we don't recognise.
  university_id uuid references public.universities (id) on delete set null,
  -- What the visitor typed for an unknown domain.
  university_name text check (university_name is null or char_length(btrim(university_name)) between 2 and 200),
  consent boolean not null,
  -- sha256 of the token in the confirmation email (it also unsubscribes); the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  confirmed_at timestamptz,
  notified_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  check (university_id is not null or university_name is not null)
);
comment on table public.university_requests is
  'Requests for a university to join (PRD 5.1). Counted per domain in /ops as sales leads; confirmed requesters are emailed once at launch.';
create index university_requests_domain_idx on public.university_requests (domain, created_at desc);
create index university_requests_university_idx on public.university_requests (university_id) where university_id is not null;
alter table public.university_requests enable row level security;
revoke all on table public.university_requests from anon, authenticated;

-- Records a request. Refuses personal and live domains; a second request from the same address
-- changes nothing and says so. Called signed out by the requestUniversity action, which checks
-- Turnstile, the honeypot and the per-IP limit first.
create function private.request_university(p_email text, p_university_name text, p_consent boolean, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_domain text := private.email_domain(p_email);
  v_name text := nullif(btrim(coalesce(p_university_name, '')), '');
  v_university uuid;
  v_university_name text;
begin
  if v_domain is null or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if coalesce(p_consent, false) is not true then
    raise exception 'Tick the box so we can email you when your university joins.' using errcode = '22023';
  end if;
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'missing token' using errcode = '22023';
  end if;
  if exists (select 1 from public.personal_email_domains d where d.domain = v_domain) then
    raise exception 'Use your university email.' using errcode = '22023';
  end if;
  if exists (select 1 from public.university_domains d where d.domain = v_domain and private.university_live(d.university_id)) then
    raise exception 'Your university is already on Skilient. Join now.' using errcode = '55000';
  end if;
  select d.university_id, u.name into v_university, v_university_name
    from public.university_domains d join public.universities u on u.id = d.university_id
   where d.domain = v_domain
   order by u.name
   limit 1;
  if v_university is null and (v_name is null or char_length(v_name) not between 2 and 200) then
    raise exception 'Enter your university''s name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.university_requests r where r.email = v_email) then
    return jsonb_build_object('status', 'exists', 'university', coalesce(v_university_name, v_name));
  end if;
  insert into public.university_requests (email, domain, university_id, university_name, consent, token_hash)
  values (v_email, v_domain, v_university, case when v_university is null then v_name end, true,
          encode(extensions.digest(p_token, 'sha256'), 'hex'));
  return jsonb_build_object('status', 'created', 'university', coalesce(v_university_name, v_name));
end;
$$;

-- The link in the confirmation email. Confirming twice is fine.
create function private.confirm_university_request(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.university_requests;
begin
  update public.university_requests q set confirmed_at = coalesce(q.confirmed_at, now())
   where q.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and q.unsubscribed_at is null
  returning * into r;
  if r.id is null then
    raise exception 'That link has expired or was already used to unsubscribe.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('university', coalesce((select u.name from public.universities u where u.id = r.university_id), r.university_name));
end;
$$;

-- The unsubscribe link: no launch email will be sent. The row stays as a lead count.
create function private.unsubscribe_university_request(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.university_requests q set unsubscribed_at = coalesce(q.unsubscribed_at, now())
   where q.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return found;
end;
$$;

-- /ops/leads: requests per domain (accounts staff). Emails never leave the database here.
create function private.ops_university_requests()
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
             'domain', g.domain, 'university_id', g.university_id, 'university', g.university,
             'live', g.university_id is not null and private.university_live(g.university_id),
             'requests', g.requests, 'confirmed', g.confirmed, 'notified', g.notified, 'latest', g.latest)
             order by g.requests desc, g.latest desc)
      from (select r.domain, max(r.university_id::text)::uuid as university_id,
                   coalesce(max(u.name), mode() within group (order by r.university_name)) as university,
                   count(*) as requests,
                   count(*) filter (where r.confirmed_at is not null and r.unsubscribed_at is null) as confirmed,
                   count(*) filter (where r.notified_at is not null) as notified,
                   max(r.created_at) as latest
              from public.university_requests r
              left join public.universities u on u.id = r.university_id
             group by r.domain) g), '[]'::jsonb);
end;
$$;

-- Staff open (or close) signup at one university. Opening is what the university-launch email follows.
create function private.ops_set_university_live(p_university uuid, p_live boolean, p_reason text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_before timestamptz;
  v_after timestamptz;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select u.live_at into v_before from public.universities u where u.id = p_university for update;
  if not found then
    raise exception 'university not found' using errcode = 'P0002';
  end if;
  v_after := case when p_live then coalesce(v_before, now()) end;
  update public.universities set live_at = v_after where id = p_university;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, case when p_live then 'uni.open' else 'uni.close' end, 'university', p_university::text, btrim(p_reason),
          jsonb_build_object('live_at', v_before), jsonb_build_object('live_at', v_after));
  return v_after;
end;
$$;

-- Public launch: open every university that has a domain, in one audited step.
create function private.ops_open_all_universities(p_reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_ids uuid[];
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  with opened as (
    update public.universities u set live_at = now()
     where u.live_at is null and exists (select 1 from public.university_domains d where d.university_id = u.id)
    returning u.id)
  select coalesce(array_agg(id), '{}') into v_ids from opened;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'uni.open_all', 'university', 'all', btrim(p_reason),
          jsonb_build_object('closed', cardinality(v_ids)), jsonb_build_object('opened', to_jsonb(v_ids)));
  return cardinality(v_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Landing numbers (refreshed hourly)
-- ---------------------------------------------------------------------------
create materialized view private.landing_universities_mv as
select u.id as university_id, u.name,
       (select count(*) from public.profiles p join auth.users au on au.id = p.user_id
         where p.university_id = u.id and p.role = 'student' and p.status in ('active', 'graduate')
           and au.email_confirmed_at is not null) as students
  from public.universities u
 where u.live_at is not null and u.live_at <= now();
comment on materialized view private.landing_universities_mv is 'Live universities and their verified students, for "Live at" (PRD 5.1).';
create unique index landing_universities_mv_id_idx on private.landing_universities_mv (university_id);

create materialized view private.landing_stats_mv as
select (select count(*) from public.profiles p join auth.users au on au.id = p.user_id
         where p.role = 'student' and p.status in ('active', 'graduate') and au.email_confirmed_at is not null) as verified_students,
       (select count(*) from public.ventures v where v.status <> 'abandoned') as ventures,
       (select count(*) from public.ventures v where v.status = 'completed') as shipped_ventures,
       (select count(*) from public.universities u where u.live_at is not null and u.live_at <= now()) as live_universities,
       now() as refreshed_at;
comment on materialized view private.landing_stats_mv is 'Platform totals for the landing page (PRD 5.1), refreshed hourly by marketing-stats.';
revoke all on private.landing_universities_mv, private.landing_stats_mv from public, anon, authenticated;

create function private.refresh_landing_stats()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently private.landing_universities_mv;
  refresh materialized view private.landing_stats_mv;
end;
$$;
revoke all on function private.refresh_landing_stats() from public;
select cron.schedule('marketing-stats', '17 * * * *', $$select private.refresh_landing_stats()$$);

-- Names of live universities with enough verified students, and each total only once it reaches
-- marketing.stats_min. Below the threshold the number is null, so the page can't show it.
create function private.landing_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_min bigint := coalesce((private.config('marketing.stats_min'))::bigint, 200);
  v_uni_min bigint := coalesce((private.config('marketing.live_at_min'))::bigint, 10);
  s private.landing_stats_mv;
begin
  select * into s from private.landing_stats_mv limit 1;
  return jsonb_build_object(
    'universities', coalesce((select jsonb_agg(l.name order by l.students desc, l.name)
                                from private.landing_universities_mv l
                               where l.students >= v_uni_min), '[]'::jsonb),
    'verified_students', case when s.verified_students >= v_min then s.verified_students end,
    'ventures', case when s.ventures >= v_min then s.ventures end,
    'shipped_ventures', case when s.shipped_ventures >= v_min then s.shipped_ventures end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans for /pricing (signed out)
-- ---------------------------------------------------------------------------
create function private.public_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'audience', p.audience, 'tier', p.tier, 'label', p.label, 'interval', p.interval,
           'price_pkr', p.price_pkr, 'self_serve', p.self_serve, 'position', p.position, 'grants', p.grants)
           order by p.audience, p.position, p.interval), '[]'::jsonb)
    from public.plans p
   where p.active
$$;

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------
insert into public.platform_config (key, version, value, reason) values
  ('marketing.stats_min', 1, '200', 'PRD 5.1: a live number shows only once it reaches 200.'),
  ('marketing.live_at_min', 1, '10', 'Decisions 2026-10-02: "Live at" lists a live university once it has 10 verified students.');
insert into public.config_keys (key, area, description, applies, schema) values
  ('marketing.stats_min', 'marketing', 'The smallest landing-page total that is shown (verified students, ventures, shipped ventures).', 'now',
   '{"type": "integer", "minimum": 1}'),
  ('marketing.live_at_min', 'marketing', 'Verified students a live university needs before "Live at" lists it.', 'now',
   '{"type": "integer", "minimum": 1}');

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

select pg_temp.expose(array['request_university', 'confirm_university_request', 'unsubscribe_university_request',
                            'landing_stats', 'public_plans'], true);
select pg_temp.expose(array['ops_university_requests', 'ops_set_university_live', 'ops_open_all_universities'], false);
drop function pg_temp.expose(text[], boolean);
