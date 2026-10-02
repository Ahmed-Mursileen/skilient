-- Phase 10 (billing), part 1 — B1: the entitlement registry (PRD 4b.2–4b.4; decisions.md 2026-10-05 "phase 10").
--
-- Every paid feature runs through one system: plans, add-ons, trials, university sponsorship and staff grants
-- all become rows in `entitlement_grants`; `private.effective_entitlements(subject_type, subject_id)` merges the
-- grants active now (bool = any true; int and limit = maximum; enum = highest level); metered keys are spent
-- with `private.consume_quota(subject_type, subject_id, key, n)` under a row lock. A key that isn't in
-- `entitlement_keys` (or its alias table) is denied. Nothing here reads a price or a value from the client.
--
-- This migration also replaces the phase 5/8/9 fail-closed stubs (`has_entitlement`, `org_entitled`,
-- `org_limit`, `consume_quota`, `uni_plan`, `uni_entitled`, `uni_limit`) with thin wrappers over the registry,
-- moves the test-only grants in `entitlements.test_grants` and `uni.test_plans` into `entitlement_grants`
-- (source admin, 30 days), and retires both config keys and `org.trial_limits`.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.billing_subject as enum ('user', 'org', 'university');
create type public.grant_source as enum ('plan', 'add_on', 'sponsorship', 'trial', 'admin');
create type public.entitlement_kind as enum ('bool', 'int', 'limit', 'enum');

-- Small helper used while this file runs: rewrite one piece of an existing function body (the phase 8/9
-- functions keep their behaviour; only the named fragment changes). Fails loudly if the fragment is gone.
create function pg_temp.patch(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  v text := pg_get_functiondef(p_fn);
begin
  if position(p_old in v) = 0 then
    raise exception 'patch: fragment not found in %: %', p_fn, p_old;
  end if;
  execute replace(v, p_old, p_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- The registry: every entitlement key, what kind it is and its free value
-- ---------------------------------------------------------------------------
create table public.entitlement_keys (
  key text primary key check (key ~ '^[a-z][a-z_]*(\.[a-z_]+)+$'),
  subject public.billing_subject not null,
  kind public.entitlement_kind not null,
  -- How a limit's counter period is chosen (limit keys only).
  period text not null default 'none' check (period in ('none', 'billing_period', 'month', 'quarter', 'licence_year')),
  free_value jsonb not null,
  -- Enum keys: levels from lowest to highest; the first is the free level.
  levels text[],
  label text not null check (char_length(label) between 2 and 80),
  check ((kind = 'enum') = (levels is not null)),
  check ((kind = 'limit') = (period <> 'none'))
);
comment on table public.entitlement_keys is
  'The entitlement registry (PRD 4b.3). A key that is not here is denied everywhere.';

-- Names the phase 5/8 code already used, mapped to the PRD 4b.3 keys (decisions.md 2026-10-05).
create table public.entitlement_key_aliases (
  alias text primary key,
  key text not null references public.entitlement_keys (key)
);
create index entitlement_key_aliases_key_idx on public.entitlement_key_aliases (key);

insert into public.entitlement_keys (key, subject, kind, period, free_value, levels, label) values
  -- Students
  ('student.plan', 'user', 'enum', 'none', '"free"', array['free', 'pro'], 'Student plan'),
  ('cv.pdf_export', 'user', 'bool', 'none', 'false', null, 'ATS PDF export'),
  ('cv.refresh_on_demand', 'user', 'bool', 'none', 'false', null, 'Refresh your CV anytime'),
  ('cv.templates', 'user', 'int', 'none', '1', null, 'CV layouts'),
  ('cv.insights', 'user', 'bool', 'none', 'false', null, 'CV insights'),
  ('cv.viewer_names', 'user', 'bool', 'none', 'false', null, 'Company names on CV views'),
  ('privacy.record_viewers', 'user', 'bool', 'none', 'false', null, 'Who at your university viewed your record'),
  ('insights.post_survey', 'user', 'bool', 'none', 'false', null, 'Full survey breakdown on your posts'),
  -- Organisations
  ('org.plan', 'org', 'enum', 'none', '"explore"', array['explore', 'starter', 'growth', 'enterprise'], 'Recruiter plan'),
  ('talent.full_profile', 'org', 'bool', 'none', 'false', null, 'Full profiles, CVs and evidence'),
  ('contact.credits', 'org', 'limit', 'billing_period', '0', null, 'Contact requests'),
  ('org.seats', 'org', 'int', 'none', '1', null, 'Seats'),
  ('recruit.shortlists', 'org', 'bool', 'none', 'false', null, 'Shortlists and private notes'),
  ('recruit.saved_searches', 'org', 'bool', 'none', 'false', null, 'Saved searches'),
  ('recruit.analytics', 'org', 'bool', 'none', 'false', null, 'Hiring analytics'),
  ('jobs.active_posts', 'org', 'int', 'none', '1', null, 'Live job posts'),
  ('competitions.run', 'org', 'limit', 'quarter', '0', null, 'Skill competitions'),
  ('api.access', 'org', 'bool', 'none', 'false', null, 'API and ATS export'),
  ('hire_fee.waived', 'org', 'bool', 'none', 'false', null, 'Hiring fee waived'),
  ('org.sso', 'org', 'bool', 'none', 'false', null, 'Single sign-on'),
  -- Universities
  ('uni.plan', 'university', 'enum', 'none', '"free"', array['free', 'basic', 'growth', 'campus'], 'University licence'),
  ('uni.dashboard', 'university', 'enum', 'none', '"none"', array['none', 'summary', 'full', 'accreditation'], 'Analytics dashboard'),
  ('uni.exports', 'university', 'bool', 'none', 'false', null, 'CSV and PDF exports'),
  ('uni.student_records', 'university', 'bool', 'none', 'false', null, 'Individual student records'),
  ('uni.skills_gap', 'university', 'bool', 'none', 'false', null, 'Skills gap'),
  ('uni.outcomes', 'university', 'bool', 'none', 'false', null, 'Placement outcomes'),
  ('uni.faculty_panel', 'university', 'bool', 'none', 'false', null, 'Faculty panel'),
  ('uni.benchmark', 'university', 'bool', 'none', 'false', null, 'Benchmarks'),
  ('uni.accreditation', 'university', 'bool', 'none', 'false', null, 'Accreditation reports'),
  ('uni.sponsored_pro', 'university', 'enum', 'none', '"none"', array['none', 'final_year', 'all'], 'Sponsored Student Pro'),
  ('uni.job_fairs', 'university', 'limit', 'licence_year', '0', null, 'Digital job fairs'),
  ('uni.hackathons', 'university', 'limit', 'licence_year', '0', null, 'University hackathons'),
  ('uni.admin_seats', 'university', 'int', 'none', '1', null, 'Admin seats');

insert into public.entitlement_key_aliases (alias, key) values
  ('privacy.viewer_names', 'cv.viewer_names'),
  ('seats', 'org.seats'),
  ('saved_searches', 'recruit.saved_searches'),
  ('analytics', 'recruit.analytics'),
  ('competitions.create', 'competitions.run');

-- ---------------------------------------------------------------------------
-- Plans (prices are placeholders, PRD 4a; changed only by a migration)
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{2,60}$'),
  audience public.billing_subject not null,
  tier text not null check (tier ~ '^[a-z]{3,20}$'),
  label text not null check (char_length(label) between 2 and 60),
  interval text not null check (interval in ('month', 'year')),
  price_pkr numeric(12, 2) check (price_pkr is null or price_pkr > 0),
  price_usd numeric(12, 2) check (price_usd is null or price_usd > 0),
  -- The entitlement template: {key: value}; every key must be in the registry (checked below).
  grants jsonb not null check (jsonb_typeof(grants) = 'object'),
  -- Self-serve plans can be bought at checkout; the rest are applied by staff (Enterprise, licences).
  self_serve boolean not null default false,
  active boolean not null default true,
  position smallint not null default 0
);
comment on table public.plans is 'Plans and their entitlement templates (PRD 4a, 4b.2). Prices come only from here.';

insert into public.plans (id, audience, tier, label, interval, price_pkr, price_usd, self_serve, position, grants) values
  ('student_pro_monthly', 'user', 'pro', 'Student Pro', 'month', 399, null, true, 1,
   '{"student.plan": "pro", "cv.pdf_export": true, "cv.refresh_on_demand": true, "cv.templates": 5, "cv.insights": true,
     "cv.viewer_names": true, "privacy.record_viewers": true, "insights.post_survey": true}'),
  ('student_pro_yearly', 'user', 'pro', 'Student Pro', 'year', 3499, null, true, 2,
   '{"student.plan": "pro", "cv.pdf_export": true, "cv.refresh_on_demand": true, "cv.templates": 5, "cv.insights": true,
     "cv.viewer_names": true, "privacy.record_viewers": true, "insights.post_survey": true}'),
  ('recruiter_starter_monthly', 'org', 'starter', 'Starter', 'month', 15000, 55, true, 1,
   '{"org.plan": "starter", "talent.full_profile": true, "contact.credits": 25, "org.seats": 1, "recruit.shortlists": true,
     "recruit.saved_searches": true, "jobs.active_posts": 3}'),
  ('recruiter_starter_yearly', 'org', 'starter', 'Starter', 'year', 150000, 550, true, 2,
   '{"org.plan": "starter", "talent.full_profile": true, "contact.credits": 25, "org.seats": 1, "recruit.shortlists": true,
     "recruit.saved_searches": true, "jobs.active_posts": 3}'),
  ('recruiter_growth_monthly', 'org', 'growth', 'Growth', 'month', 45000, 160, true, 3,
   '{"org.plan": "growth", "talent.full_profile": true, "contact.credits": 100, "org.seats": 5, "recruit.shortlists": true,
     "recruit.saved_searches": true, "recruit.analytics": true, "jobs.active_posts": 10, "competitions.run": 1,
     "api.access": true, "hire_fee.waived": true}'),
  ('recruiter_growth_yearly', 'org', 'growth', 'Growth', 'year', 450000, 1600, true, 4,
   '{"org.plan": "growth", "talent.full_profile": true, "contact.credits": 100, "org.seats": 5, "recruit.shortlists": true,
     "recruit.saved_searches": true, "recruit.analytics": true, "jobs.active_posts": 10, "competitions.run": 1,
     "api.access": true, "hire_fee.waived": true}'),
  -- Enterprise is a contract: staff apply it and may raise any value with an admin grant.
  ('recruiter_enterprise_yearly', 'org', 'enterprise', 'Enterprise', 'year', null, null, false, 5,
   '{"org.plan": "enterprise", "talent.full_profile": true, "contact.credits": 500, "org.seats": 25, "recruit.shortlists": true,
     "recruit.saved_searches": true, "recruit.analytics": true, "jobs.active_posts": 100000, "competitions.run": 4,
     "api.access": true, "hire_fee.waived": true, "org.sso": true}'),
  ('uni_basic_yearly', 'university', 'basic', 'Basic', 'year', 300000, null, false, 1,
   '{"uni.plan": "basic", "uni.dashboard": "summary", "uni.admin_seats": 2}'),
  ('uni_growth_yearly', 'university', 'growth', 'Growth', 'year', 900000, null, false, 2,
   '{"uni.plan": "growth", "uni.dashboard": "full", "uni.exports": true, "uni.student_records": true, "uni.skills_gap": true,
     "uni.outcomes": true, "uni.faculty_panel": true, "uni.benchmark": true, "uni.sponsored_pro": "final_year",
     "uni.job_fairs": 1, "uni.hackathons": 2, "uni.admin_seats": 5}'),
  ('uni_campus_yearly', 'university', 'campus', 'Campus', 'year', 2000000, null, false, 3,
   '{"uni.plan": "campus", "uni.dashboard": "accreditation", "uni.exports": true, "uni.student_records": true, "uni.skills_gap": true,
     "uni.outcomes": true, "uni.faculty_panel": true, "uni.benchmark": true, "uni.accreditation": true, "uni.sponsored_pro": "all",
     "uni.job_fairs": 2, "uni.hackathons": 4, "uni.admin_seats": 10}');

-- Every template key is a registry key of the plan's audience, with a value of the right shape.
do $$
declare
  r record;
begin
  for r in
    select p.id, g.key, g.value, k.subject, k.kind, k.levels, p.audience
      from public.plans p
      cross join lateral jsonb_each(p.grants) g
      left join public.entitlement_keys k on k.key = g.key
  loop
    if r.kind is null or r.subject <> r.audience
       or (r.kind = 'bool' and jsonb_typeof(r.value) <> 'boolean')
       or (r.kind in ('int', 'limit') and jsonb_typeof(r.value) <> 'number')
       or (r.kind = 'enum' and not (r.value #>> '{}' = any (r.levels))) then
      raise exception 'plan % has a bad grant %', r.id, r.key;
    end if;
  end loop;
end;
$$;

insert into public.platform_config (key, version, value, reason) values
  ('billing.add_ons', 1,
   '{"contact_credits": {"pkr": 300, "usd": 1.10, "min": 5, "max": 100, "days": 90},
     "sponsored_post": {"pkr": 5000, "usd": 18, "days": 14}}',
   'PRD 4a add-on prices (placeholders) and their validity'),
  ('billing.lifecycle', 1,
   '{"trial_days": 7, "grace_days": 7, "retry_days": [1, 3, 6], "reminder_days": [7, 3, 1], "licence_terms_days": 30,
     "licence_grace_days": 14, "sponsorship_notice_days": 30, "hire_fee_due_days": 30, "hire_fee_dispute_days": 14,
     "offer_follow_up_days": 45, "checkout_minutes": 60, "migrated_grant_days": 30}',
   'PRD 4b.5–4b.9 lifecycle timings'),
  ('billing.hire_fees', 1, '{"intern": 10000, "full_time": 30000}', 'PRD 4a hiring fee per recorded hire, PKR (placeholder)');

-- ---------------------------------------------------------------------------
-- Grants and counters
-- ---------------------------------------------------------------------------
create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  key text not null references public.entitlement_keys (key),
  value jsonb not null,
  source public.grant_source not null,
  -- The subscription, add-on order, licence or staff action behind the grant.
  source_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 500),
  -- Add-on limits only: how much of the grant has been spent (they last 90 days, not one period).
  consumed integer not null default 0 check (consumed >= 0),
  -- Sponsorship only: when the student was told it ends.
  notice_sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or char_length(btrim(revoked_reason)) between 3 and 500),
  check (ends_at is null or ends_at > starts_at),
  check (source <> 'admin' or reason is not null),
  check ((revoked_at is null) = (revoked_reason is null))
);
comment on table public.entitlement_grants is
  'Every entitlement a subject holds and why (PRD 4b.2). Written only by billing functions; never by the client.';
create index entitlement_grants_subject_idx on public.entitlement_grants (subject_type, subject_id, key) where revoked_at is null;
create index entitlement_grants_source_idx on public.entitlement_grants (source, source_id);
create index entitlement_grants_key_idx on public.entitlement_grants (key);
create index entitlement_grants_created_by_idx on public.entitlement_grants (created_by);

create function private.check_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys;
begin
  select * into k from public.entitlement_keys where key = new.key;
  if k.subject <> new.subject_type then
    raise exception 'entitlement % belongs to a % subject', new.key, k.subject using errcode = '22023';
  end if;
  if (k.kind = 'bool' and jsonb_typeof(new.value) <> 'boolean')
     or (k.kind in ('int', 'limit') and (jsonb_typeof(new.value) <> 'number' or (new.value #>> '{}')::numeric < 0
                                         or (new.value #>> '{}')::numeric <> trunc((new.value #>> '{}')::numeric)))
     or (k.kind = 'enum' and (jsonb_typeof(new.value) <> 'string' or not (new.value #>> '{}' = any (k.levels)))) then
    raise exception 'that value doesn''t fit entitlement %', new.key using errcode = '22023';
  end if;
  if new.source = 'add_on' and k.kind <> 'limit' then
    raise exception 'add-ons only top up limits' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_grant() from public;
create trigger entitlement_grants_check before insert or update of key, value, subject_type, source on public.entitlement_grants
  for each row execute function private.check_grant();

create table public.usage_counters (
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  key text not null references public.entitlement_keys (key),
  period_start timestamptz not null,
  used integer not null default 0 check (used >= 0),
  primary key (subject_type, subject_id, key, period_start)
);
comment on table public.usage_counters is
  'Metered use per period (PRD 4b.4). A new period starts a new row; old rows are kept.';
create index usage_counters_key_idx on public.usage_counters (key);

create table public.trial_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);
comment on table public.trial_claims is 'One 7-day Student Pro trial per verified student (PRD 4b.5).';

alter table public.entitlement_keys enable row level security;
alter table public.entitlement_key_aliases enable row level security;
alter table public.plans enable row level security;
alter table public.entitlement_grants enable row level security;
alter table public.usage_counters enable row level security;
alter table public.trial_claims enable row level security;
revoke all on table public.entitlement_keys, public.entitlement_key_aliases, public.plans, public.entitlement_grants,
  public.usage_counters, public.trial_claims from anon, authenticated;
-- Plans and the registry are public facts (prices are on the pricing page); everything else is read
-- through the functions below, which check who is asking.
grant select on table public.entitlement_keys, public.entitlement_key_aliases, public.plans to authenticated;
create policy entitlement_keys_read on public.entitlement_keys for select to authenticated using (true);
create policy entitlement_key_aliases_read on public.entitlement_key_aliases for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (active);

-- Deleting an account or an organisation removes its grants and counters (payments and invoices
-- stay for the accounts, keyed by an id that no longer leads anywhere).
create function private.billing_forget_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.billing_subject := case tg_table_name when 'users' then 'user' else 'org' end;
begin
  delete from public.entitlement_grants where subject_type = v_type and subject_id = old.id;
  delete from public.usage_counters where subject_type = v_type and subject_id = old.id;
  return old;
end;
$$;
revoke all on function private.billing_forget_subject() from public;
create trigger billing_forget_user after delete on auth.users
  for each row execute function private.billing_forget_subject();
create trigger billing_forget_org after delete on public.organizations
  for each row execute function private.billing_forget_subject();

-- ---------------------------------------------------------------------------
-- Reading entitlements
-- ---------------------------------------------------------------------------
create function private.entitlement_key(p_key text)
returns public.entitlement_keys
language sql
stable
security definer
set search_path = ''
as $$
  select k.* from public.entitlement_keys k
   where k.key = coalesce((select a.key from public.entitlement_key_aliases a where a.alias = p_key), p_key);
$$;
revoke all on function private.entitlement_key(text) from public;

-- Grants active now for one subject and key (add-on top-ups are counted separately).
create function private.active_grants(p_type public.billing_subject, p_id uuid, p_key text)
returns setof public.entitlement_grants
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.entitlement_grants g
   where g.subject_type = p_type and g.subject_id = p_id and g.key = p_key
     and g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now());
$$;
revoke all on function private.active_grants(public.billing_subject, uuid, text) from public;

-- Faculty at a Growth or Campus university get the full post survey (PRD 4b.3, 2026-09-25): derived,
-- not stored, so it follows the licence without a sync.
create function private.derived_user_values(p_user uuid, p_key text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select 'true'::jsonb
   where p_key = 'insights.post_survey'
     and exists (select 1 from public.teacher_profiles t
                  where t.user_id = p_user and t.status = 'approved'
                    and exists (select 1 from public.entitlement_grants g
                                 where g.subject_type = 'university' and g.subject_id = t.university_id and g.key = 'uni.plan'
                                   and g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
                                   and g.value #>> '{}' in ('growth', 'campus')));
$$;
revoke all on function private.derived_user_values(uuid, text) from public;

-- The merged value of one key for one subject: free value plus every active grant
-- (bool = any true, int/limit = maximum, enum = highest level). Add-on top-ups are not included
-- here: `quota_status` adds what is left of them. Unknown keys return null.
create function private.entitlement_value(p_type public.billing_subject, p_id uuid, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_values jsonb[];
begin
  if k.key is null or k.subject <> p_type or p_id is null then
    return null;
  end if;
  select array_agg(g.value) into v_values
    from (select a.value from private.active_grants(p_type, p_id, k.key) a where a.source <> 'add_on'
          union all
          select d from private.derived_user_values(p_id, k.key) d where p_type = 'user') g;
  v_values := coalesce(v_values, '{}') || k.free_value;
  return case k.kind
    when 'bool' then to_jsonb(coalesce((select bool_or((x #>> '{}')::boolean) from unnest(v_values) x), false))
    when 'enum' then (select x from unnest(v_values) x order by array_position(k.levels, x #>> '{}') desc nulls last limit 1)
    else to_jsonb((select max((x #>> '{}')::numeric)::bigint from unnest(v_values) x))
  end;
end;
$$;
revoke all on function private.entitlement_value(public.billing_subject, uuid, text) from public;

-- True when the subject has more than the free value: bool true, a number above free, an enum above
-- the lowest level. Unknown keys are false.
create function private.entitled(p_type public.billing_subject, p_id uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v jsonb;
begin
  if k.key is null or k.subject <> p_type or p_id is null then
    return false;
  end if;
  v := private.entitlement_value(p_type, p_id, k.key);
  return case k.kind
    when 'bool' then coalesce((v #>> '{}')::boolean, false)
    when 'enum' then coalesce(array_position(k.levels, v #>> '{}'), 1) > 1
    else coalesce((v #>> '{}')::numeric, 0) > (k.free_value #>> '{}')::numeric
           or (k.kind = 'limit' and private.quota_extras(p_type, p_id, k.key) > 0)
  end;
end;
$$;
revoke all on function private.entitled(public.billing_subject, uuid, text) from public;

-- What is left of purchased top-ups for a limit key (each lasts its own 90 days).
create function private.quota_extras(p_type public.billing_subject, p_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((g.value #>> '{}')::integer - g.consumed), 0)::integer
    from private.active_grants(p_type, p_id, p_key) g
   where g.source = 'add_on' and (g.value #>> '{}')::integer > g.consumed;
$$;
revoke all on function private.quota_extras(public.billing_subject, uuid, text) from public;

-- The current subscription for a subject: the one that is trialing, active or past due (at most one).
-- Defined here as a stub so the period helper compiles; the lifecycle migration fills it in.
create function private.current_subscription_period(p_type public.billing_subject, p_id uuid)
returns tstzrange
language sql
stable
security definer
set search_path = ''
as $$
  select null::tstzrange where p_type is not null and p_id is not null;
$$;
revoke all on function private.current_subscription_period(public.billing_subject, uuid) from public;

-- Where the current counter period of a limit key starts (PRD 4b.4 "Counter periods"): contact credits
-- reset at each renewal (calendar month in Pakistan time without a subscription); competitions per
-- calendar quarter; university fairs and hackathons per licence year.
create function private.quota_period_start(p_type public.billing_subject, p_id uuid, p_key text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_local timestamp := now() at time zone 'Asia/Karachi';
  v_sub tstzrange := private.current_subscription_period(p_type, p_id);
  v_anchor timestamptz;
  v_years integer;
begin
  if k.period = 'quarter' then
    return date_trunc('quarter', v_local) at time zone 'Asia/Karachi';
  elsif k.period = 'month' then
    return date_trunc('month', v_local) at time zone 'Asia/Karachi';
  elsif k.period = 'billing_period' then
    return coalesce(lower(v_sub), date_trunc('month', v_local) at time zone 'Asia/Karachi');
  elsif k.period = 'licence_year' then
    v_anchor := coalesce(lower(v_sub),
                         (select min(g.starts_at) from private.active_grants(p_type, p_id, 'uni.plan') g where g.source in ('plan', 'admin')));
    if v_anchor is null then
      return date_trunc('year', v_local) at time zone 'Asia/Karachi';
    end if;
    v_years := greatest(0, extract(year from age(now(), v_anchor))::integer);
    return v_anchor + make_interval(years => v_years);
  end if;
  return null;
end;
$$;
revoke all on function private.quota_period_start(public.billing_subject, uuid, text) from public;

-- Limit, top-ups, use and what's left of one metered key this period.
create function private.quota_status(p_type public.billing_subject, p_id uuid, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_period timestamptz;
  v_limit integer;
  v_used integer;
  v_extras integer;
begin
  if k.key is null or k.kind <> 'limit' or k.subject <> p_type then
    return null;
  end if;
  v_period := private.quota_period_start(p_type, p_id, k.key);
  v_limit := (private.entitlement_value(p_type, p_id, k.key) #>> '{}')::integer;
  select c.used into v_used from public.usage_counters c
   where c.subject_type = p_type and c.subject_id = p_id and c.key = k.key and c.period_start = v_period;
  v_extras := private.quota_extras(p_type, p_id, k.key);
  return jsonb_build_object('key', k.key, 'limit', v_limit, 'used', coalesce(v_used, 0), 'extras', v_extras,
                            'remaining', greatest(v_limit - coalesce(v_used, 0), 0) + v_extras, 'period_start', v_period);
end;
$$;
revoke all on function private.quota_status(public.billing_subject, uuid, text) from public;

-- Every registry key for a subject, merged (PRD 4b.3 `effective_entitlements`), plus metered status.
create function private.effective_entitlements(p_type public.billing_subject, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'values', coalesce(jsonb_object_agg(k.key, private.entitlement_value(p_type, p_id, k.key)), '{}'::jsonb),
    'quotas', coalesce(jsonb_object_agg(k.key, private.quota_status(p_type, p_id, k.key)) filter (where k.kind = 'limit'), '{}'::jsonb))
    from public.entitlement_keys k
   where k.subject = p_type and p_id is not null;
$$;
revoke all on function private.effective_entitlements(public.billing_subject, uuid) from public;

-- ---------------------------------------------------------------------------
-- Spending metered keys (PRD 4b.4): one transaction, the period's counter row locked, top-ups spent
-- oldest-expiring first; two parallel requests can never both spend the last credit.
-- ---------------------------------------------------------------------------
create function private.consume_quota(p_type public.billing_subject, p_id uuid, p_key text, p_n integer default 1)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_period timestamptz;
  v_limit integer;
  v_used integer;
  v_base integer;
  v_rest integer;
  v_take integer;
  g record;
begin
  if k.key is null or k.kind <> 'limit' or k.subject <> p_type or p_id is null then
    raise exception 'this isn''t included in your plan' using errcode = 'PT402';
  end if;
  if p_n is null or p_n < 1 or p_n > 1000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  v_period := private.quota_period_start(p_type, p_id, k.key);
  insert into public.usage_counters (subject_type, subject_id, key, period_start, used)
  values (p_type, p_id, k.key, v_period, 0)
  on conflict do nothing;
  select c.used into v_used from public.usage_counters c
   where c.subject_type = p_type and c.subject_id = p_id and c.key = k.key and c.period_start = v_period
   for update;
  v_limit := (private.entitlement_value(p_type, p_id, k.key) #>> '{}')::integer;
  v_base := least(p_n, greatest(v_limit - v_used, 0));
  v_rest := p_n - v_base;
  if v_rest > 0 then
    for g in
      select x.id, (x.value #>> '{}')::integer - x.consumed as left_over
        from public.entitlement_grants x
       where x.subject_type = p_type and x.subject_id = p_id and x.key = k.key and x.source = 'add_on'
         and x.revoked_at is null and x.starts_at <= now() and (x.ends_at is null or x.ends_at > now())
         and (x.value #>> '{}')::integer > x.consumed
       order by x.ends_at nulls last, x.created_at
       for update
    loop
      exit when v_rest = 0;
      v_take := least(v_rest, g.left_over);
      update public.entitlement_grants set consumed = consumed + v_take where id = g.id;
      v_rest := v_rest - v_take;
    end loop;
    if v_rest > 0 then
      raise exception 'you''ve used this period''s allowance' using errcode = 'PT402';
    end if;
  end if;
  update public.usage_counters set used = used + v_base
   where subject_type = p_type and subject_id = p_id and key = k.key and period_start = v_period;
  return greatest(v_limit - v_used - v_base, 0) + private.quota_extras(p_type, p_id, k.key);
end;
$$;
revoke all on function private.consume_quota(public.billing_subject, uuid, text, integer) from public;

-- Gives back what a failed downstream write spent (the period's counter first, then the newest top-up).
create function private.release_quota(p_type public.billing_subject, p_id uuid, p_key text, p_n integer default 1)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_period timestamptz := private.quota_period_start(p_type, p_id, p_key);
  v_used integer;
  v_back integer;
  v_rest integer := p_n;
  g record;
begin
  if k.key is null or k.kind <> 'limit' or p_n is null or p_n < 1 then
    return;
  end if;
  select c.used into v_used from public.usage_counters c
   where c.subject_type = p_type and c.subject_id = p_id and c.key = k.key and c.period_start = v_period
   for update;
  v_back := least(coalesce(v_used, 0), v_rest);
  if v_back > 0 then
    update public.usage_counters set used = used - v_back
     where subject_type = p_type and subject_id = p_id and key = k.key and period_start = v_period;
    v_rest := v_rest - v_back;
  end if;
  for g in
    select x.id, x.consumed from public.entitlement_grants x
     where x.subject_type = p_type and x.subject_id = p_id and x.key = k.key and x.source = 'add_on' and x.consumed > 0
     order by x.ends_at desc nulls first
     for update
  loop
    exit when v_rest = 0;
    v_back := least(v_rest, g.consumed);
    update public.entitlement_grants set consumed = consumed - v_back where id = g.id;
    v_rest := v_rest - v_back;
  end loop;
end;
$$;
revoke all on function private.release_quota(public.billing_subject, uuid, text, integer) from public;

-- ---------------------------------------------------------------------------
-- The phase 5/8/9 stubs, now wrappers over the registry (callers are unchanged)
-- ---------------------------------------------------------------------------
create or replace function private.has_entitlement(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.entitled('user', p_user, p_key);
$$;

create or replace function private.org_entitled(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org is not null
     and exists (select 1 from public.organizations o where o.id = p_org and o.status = 'verified')
     and private.entitled('org', p_org, p_key);
$$;

-- An organisation's numeric limit (seats, live posts, a limit key's base): null for an unknown key.
create function private.org_limit(p_org uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when (private.entitlement_key(p_key)).kind in ('int', 'limit')
              then (private.entitlement_value('org', p_org, p_key) #>> '{}')::integer end;
$$;
revoke all on function private.org_limit(uuid, text) from public;

-- The phase 8 one-argument form answers for the caller's own organisation.
create or replace function private.org_limit(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.org_limit((select m.org_id from public.org_members m where m.user_id = (select auth.uid()) and m.status = 'active'), p_key);
$$;

create or replace function private.consume_quota(p_org uuid, p_key text, p_amount integer default 1)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.consume_quota('org'::public.billing_subject, p_org, p_key, p_amount);
end;
$$;

-- A university's licence level: free unless it is claimed (has an owner) and holds a grant.
create or replace function private.uni_plan(p_university uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.universities u where u.id = p_university and u.owner_id is not null)
              then coalesce(private.entitlement_value('university', p_university, 'uni.plan') #>> '{}', 'free')
              else 'free' end;
$$;

create or replace function private.uni_entitled(p_university uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level integer;
begin
  if p_university is null or not exists (select 1 from public.universities u where u.id = p_university and u.owner_id is not null) then
    return false;
  end if;
  if p_key in ('uni.dashboard', 'uni.dashboard_full') then
    v_level := array_position(array['none', 'summary', 'full', 'accreditation'],
                              private.entitlement_value('university', p_university, 'uni.dashboard') #>> '{}');
    return coalesce(v_level, 1) >= case p_key when 'uni.dashboard' then 2 else 3 end;
  end if;
  return private.entitled('university', p_university, p_key);
end;
$$;

create or replace function private.uni_limit(p_university uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when (private.entitlement_key(p_key)).kind in ('int', 'limit') and (private.entitlement_key(p_key)).subject = 'university'
              then case when private.uni_plan(p_university) = 'free' then ((private.entitlement_key(p_key)).free_value #>> '{}')::integer
                        else (private.entitlement_value('university', p_university, p_key) #>> '{}')::integer end end;
$$;

-- When the university's current licence year began (fairs and hackathons count from here).
create function private.uni_licence_start(p_university uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select private.quota_period_start('university', p_university, 'uni.job_fairs');
$$;
revoke all on function private.uni_licence_start(uuid) from public;
grant execute on function private.uni_licence_start(uuid) to authenticated, service_role;

-- Fairs and hackathons now count per licence year, not a rolling 365 days (decisions.md 2026-10-04).
select pg_temp.patch('private.save_hackathon(uuid, jsonb)'::regprocedure,
  'c.created_at > now() - interval ''365 days''', 'c.created_at >= private.uni_licence_start(a.university_id)');
select pg_temp.patch('private.uni_hackathons()'::regprocedure,
  'c.created_at > now() - interval ''365 days''', 'c.created_at >= private.uni_licence_start(a.university_id)');
select pg_temp.patch('private.save_job_fair(uuid, jsonb)'::regprocedure,
  'f.created_at > now() - interval ''365 days''', 'f.created_at >= private.uni_licence_start(a.university_id)');
select pg_temp.patch('private.uni_fairs()'::regprocedure,
  'f.created_at > now() - interval ''365 days''', 'f.created_at >= private.uni_licence_start(a.university_id)');

-- Billing-only organisation members manage payments and never take a recruiting seat.
create or replace function private.org_seat_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.org_members m where m.org_id = p_org and m.status = 'active' and m.role <> 'billing')::integer
       + (select count(*) from public.org_invites i
           where i.org_id = p_org and i.used_at is null and i.revoked_at is null and i.expires_at > now() and i.role <> 'billing')::integer;
$$;

-- Shortlists and private notes need Starter or above (PRD 4a). Reads stay open so nothing is lost
-- after a downgrade; creating and changing them is refused.
create function private.require_org_entitled(p_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  if not private.org_entitled(v_org, p_key) then
    raise exception 'shortlists and private notes come with Starter and above' using errcode = 'PT402';
  end if;
  return v_org;
end;
$$;
revoke all on function private.require_org_entitled(text) from public;

select pg_temp.patch(f::regprocedure, 'v_org uuid := private.require_org();', 'v_org uuid := private.require_org_entitled(''recruit.shortlists'');')
  from unnest(array['private.create_shortlist(text)', 'private.rename_shortlist(uuid, text)', 'private.add_to_shortlist(uuid, uuid)',
                    'private.reorder_shortlist(uuid, uuid[])', 'private.add_note(uuid, text)']) f;

-- The plan page (phase 8 /org/plan): the real values, and the counter of the current period.
create or replace function private.org_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin', 'recruiter', 'billing']::public.org_role[], false);
  q jsonb := private.quota_status('org', v_org, 'contact.credits');
begin
  return jsonb_build_object(
    'plan', private.entitlement_value('org', v_org, 'org.plan') #>> '{}',
    'seats_limit', private.org_limit(v_org, 'org.seats'),
    'seats_used', private.org_seat_count(v_org),
    'contact_credits_limit', (q ->> 'limit')::integer + (q ->> 'extras')::integer,
    'contact_credits_used', (q ->> 'used')::integer,
    'active_posts_limit', private.org_limit(v_org, 'jobs.active_posts'),
    'entitlements', jsonb_build_object(
      'talent.full_profile', private.org_entitled(v_org, 'talent.full_profile'),
      'saved_searches', private.org_entitled(v_org, 'recruit.saved_searches'),
      'analytics', private.org_entitled(v_org, 'recruit.analytics'),
      'competitions.create', private.org_entitled(v_org, 'competitions.run'),
      'api.access', private.org_entitled(v_org, 'api.access'),
      'recruit.shortlists', private.org_entitled(v_org, 'recruit.shortlists')));
end;
$$;

-- Phase 8 counters move into usage_counters (same month, Pakistan time), then the old table goes.
insert into public.usage_counters (subject_type, subject_id, key, period_start, used)
select 'org', q.org_id, coalesce((select a.key from public.entitlement_key_aliases a where a.alias = q.key), q.key),
       q.period::timestamp at time zone 'Asia/Karachi', q.used
  from public.org_quota_usage q
 where exists (select 1 from public.entitlement_keys k
                where k.key = coalesce((select a.key from public.entitlement_key_aliases a where a.alias = q.key), q.key)
                  and k.kind = 'limit')
on conflict do nothing;
drop table public.org_quota_usage;

-- ---------------------------------------------------------------------------
-- Test-only grants become staff grants (30 days, reason recorded), then the stub keys retire
-- ---------------------------------------------------------------------------
insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
select case when exists (select 1 from public.organizations o where o.id = x.id::uuid) then 'org' else 'user' end::public.billing_subject,
       x.id::uuid, k.key,
       case k.kind when 'bool' then 'true'::jsonb when 'enum' then to_jsonb(k.levels[array_upper(k.levels, 1)])
                   else to_jsonb(case k.key when 'cv.templates' then 5 else 1 end) end,
       'admin', now() + interval '30 days', 'migrated from the phase 5/8/9 test grants'
  from jsonb_each(coalesce(private.config('entitlements.test_grants'), '{}'::jsonb)) t
  cross join lateral jsonb_array_elements_text(case jsonb_typeof(t.value) when 'array' then t.value else '[]'::jsonb end) x(id)
  join lateral (select * from private.entitlement_key(t.key)) k on k.key is not null
 where x.id ~ '^[0-9a-f-]{36}$'
   and k.subject = case when exists (select 1 from public.organizations o where o.id = x.id::uuid) then 'org' else 'user' end::public.billing_subject;

insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
select 'university', t.key::uuid, g.key, g.value, 'admin', now() + interval '30 days', 'migrated from the phase 9 test plans'
  from jsonb_each_text(coalesce(private.config('uni.test_plans'), '{}'::jsonb)) t
  join public.plans p on p.id = 'uni_' || t.value || '_yearly'
  cross join lateral jsonb_each(p.grants) g
 where t.key ~ '^[0-9a-f-]{36}$' and exists (select 1 from public.universities u where u.id = t.key::uuid);

insert into public.platform_config (key, version, value, reason)
select c.key, max(c.version) + 1, '{}', 'Retired in phase 10: entitlement_grants replaces it (nothing reads this key)'
  from public.platform_config c
 where c.key in ('entitlements.test_grants', 'uni.test_plans', 'org.trial_limits')
 group by c.key;

-- ---------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------
-- The caller's subject for a key's audience: themselves, their organisation (any role, two-factor via
-- require_org) or their university (owner/admin seat, two-factor via require_uni).
create function private.my_subject(p_type public.billing_subject)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_type = 'user' then
    return v_me;
  elsif p_type = 'org' then
    return private.require_org(array['admin', 'recruiter', 'billing']::public.org_role[], false);
  end if;
  return (private.require_uni(array['owner', 'admin', 'career', 'coordinator', 'comms']::public.uni_admin_role[])).university_id;
end;
$$;
revoke all on function private.my_subject(public.billing_subject) from public;

-- The caller's entitlements, for showing or hiding controls only (PRD 4b.4).
create function private.my_entitlements(p_subject text default 'user')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.billing_subject;
  v_id uuid;
begin
  if p_subject not in ('user', 'org', 'university') then
    raise exception 'unknown subject' using errcode = '22023';
  end if;
  v_type := p_subject::public.billing_subject;
  v_id := private.my_subject(v_type);
  return private.effective_entitlements(v_type, v_id)
         || jsonb_build_object('subject_type', v_type, 'subject_id', v_id);
end;
$$;

-- `requireEntitlement(key)` (PRD 4b.4): every paid server action calls this first. Raises PT402
-- (HTTP 402 through PostgREST) when the caller's subject doesn't hold the key. Unknown keys are refused.
create function private.require_entitlement(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_id uuid;
begin
  if k.key is null then
    raise exception 'this isn''t included in any plan' using errcode = 'PT402';
  end if;
  v_id := private.my_subject(k.subject);
  if k.subject = 'org' and not exists (select 1 from public.organizations o where o.id = v_id and o.status = 'verified') then
    raise exception 'your organisation isn''t verified yet' using errcode = '42501';
  end if;
  -- A metered key needs some allowance on the plan (or a top-up); spending it happens in the paid write
  -- itself (consume_quota, same transaction), which refuses with PT402 when nothing is left.
  if not private.entitled(k.subject, v_id, k.key) then
    raise exception '%: not included in your plan', k.label using errcode = 'PT402';
  end if;
end;
$$;

grant execute on function private.entitled(public.billing_subject, uuid, text), private.entitlement_value(public.billing_subject, uuid, text),
  private.org_limit(uuid, text), private.consume_quota(public.billing_subject, uuid, text, integer),
  private.release_quota(public.billing_subject, uuid, text, integer), private.quota_status(public.billing_subject, uuid, text)
  to service_role;

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

select pg_temp.expose(array['my_entitlements', 'require_entitlement']);
drop function pg_temp.expose(text[]);
drop function pg_temp.patch(regprocedure, text, text);
