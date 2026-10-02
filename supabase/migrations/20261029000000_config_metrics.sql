-- Phase 11, slice 4 (PRD 5.26): platform config in the ops UI and business metrics.
--
-- Config: every platform_config key has a row in config_keys with a JSON schema (pg_jsonschema).
-- A super admin saves a new version with a reason; the value must match the schema; the old
-- version stays (platform_config is append-only). Ranking keys take effect at the next nightly
-- run (it reads the config when it starts); prices live in plans and apply to new subscriptions
-- and renewals (renewal_quote reads the plan at renewal). The skill dictionary is edited by trust
-- reviewers: add, rename, retire, never delete.
--
-- Metrics: one materialised view of business series, refreshed hourly by pg_cron, plus daily
-- snapshots of weekly actives and hourly snapshots of queue backlogs for trends.

create extension if not exists pg_jsonschema with schema extensions;

-- ---------------------------------------------------------------------------
-- Config key registry
-- ---------------------------------------------------------------------------
create table public.config_keys (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,80}$'),
  area text not null check (area ~ '^[a-z_]{2,30}$'),
  description text not null check (char_length(description) between 3 and 300),
  -- When a new version takes effect: straight away, or at the next nightly ranking run.
  applies text not null check (applies in ('now', 'next_nightly')),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  updated_at timestamptz not null default now()
);
comment on table public.config_keys is
  'What each platform_config key is and the JSON schema its value must match (PRD 5.26). Staff-readable; changed only by migration.';
alter table public.config_keys enable row level security;
revoke all on table public.config_keys from anon, authenticated;
grant select on table public.config_keys to authenticated;
create policy config_keys_staff_read on public.config_keys for select to authenticated using ((select private.is_staff()));

-- The schema of the value a key holds today: objects keep their keys and types (no extra keys),
-- numbers stay non-negative, arrays keep their element type. Used once, to seed the registry.
create function pg_temp.schema_of(v jsonb)
returns jsonb
language plpgsql
as $$
declare
  k text;
  props jsonb := '{}'::jsonb;
  req jsonb := '[]'::jsonb;
begin
  case jsonb_typeof(v)
    when 'object' then
      if v = '{}'::jsonb then
        return '{"type": "object"}'::jsonb;
      end if;
      for k in select jsonb_object_keys(v) loop
        props := props || jsonb_build_object(k, pg_temp.schema_of(v -> k));
        req := req || to_jsonb(k);
      end loop;
      return jsonb_build_object('type', 'object', 'properties', props, 'required', req, 'additionalProperties', false);
    when 'array' then
      if jsonb_array_length(v) = 0 then
        return '{"type": "array"}'::jsonb;
      end if;
      return jsonb_build_object('type', 'array', 'items', pg_temp.schema_of(v -> 0), 'maxItems', 500);
    when 'number' then
      return '{"type": "number", "minimum": 0}'::jsonb;
    when 'boolean' then
      return '{"type": "boolean"}'::jsonb;
    when 'string' then
      return '{"type": "string", "maxLength": 500}'::jsonb;
    else
      return '{}'::jsonb;
  end case;
end;
$$;

insert into public.config_keys (key, area, description, applies, schema)
select c.key, split_part(c.key, '.', 1),
       coalesce(d.description, 'Platform setting ' || c.key || '.'),
       case when c.key like 'ranking.%' then 'next_nightly' else 'now' end,
       pg_temp.schema_of(c.value)
  from (select distinct on (key) key, value from public.platform_config order by key, version desc) c
  left join (values
    ('ranking.formula', 'Ranking weights, caps and decay. The nightly run reads it when it starts; its version is the formula version.'),
    ('feed.score', 'Feed scoring constants (PRD 5.10).'),
    ('feed.stages', 'When a post moves between feed stages, and how many reports hold it.'),
    ('feed.placement', 'Boosts and demotions in feed placement.'),
    ('feed.relevance', 'Relevance multipliers (friends, batch, skills).'),
    ('feed.diversity', 'Diversity rules for a feed page.'),
    ('feed.window', 'How far back and how many candidates the feed considers.'),
    ('billing.add_ons', 'Add-on prices and sizes (sponsored posts, contact credits).'),
    ('billing.lifecycle', 'Trials, retries, grace and reminders for subscriptions.'),
    ('billing.hire_fees', 'Hiring fees in PKR by kind of hire.'),
    ('billing.company', 'Company details printed on invoices.'),
    ('billing.live_mode', 'Whether payments are live (false while on the simulated gateway).'),
    ('billing.simulated_testers', 'User ids allowed to pay with the simulated gateway in production.'),
    ('code_check.limits', 'Code-check timings, sizes and the pass mark.'),
    ('credentials.limits', 'Credential upload limits.'),
    ('endorsements.limits', 'Endorsement limits (PRD 5.16).'),
    ('recruit.limits', 'Recruiter contact and invite limits.'),
    ('teacher.limits', 'Teacher review, idea and supervision limits.'),
    ('graduates.rule', 'The day students graduate each year.'),
    ('storage.quota_bytes', 'Storage quota shown to staff (Free plan: 1 GB).'),
    ('entitlements.test_grants', 'Test entitlements (setup checklist).'),
    ('org.trial_limits', 'Organisation trial limits (test use).'),
    ('uni.test_plans', 'University test plans (test use).')
  ) as d(key, description) on d.key = c.key;
drop function pg_temp.schema_of(jsonb);

-- ---------------------------------------------------------------------------
-- Config: read and save versions
-- ---------------------------------------------------------------------------
create function private.ops_config_keys()
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
             'key', k.key, 'area', k.area, 'description', k.description, 'applies', k.applies,
             'version', c.version, 'effective_at', c.effective_at, 'reason', c.reason, 'staff_name', p.full_name,
             'versions', (select count(*) from public.platform_config x where x.key = k.key))
             order by k.area, k.key)
      from public.config_keys k
      left join lateral (select * from public.platform_config c where c.key = k.key order by c.version desc limit 1) c on true
      left join public.profiles p on p.user_id = c.staff_id), '[]'::jsonb);
end;
$$;

create function private.ops_config_history(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
  k public.config_keys;
begin
  select * into k from public.config_keys where key = p_key;
  if k.key is null then
    raise exception 'unknown setting' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'key', k.key, 'area', k.area, 'description', k.description, 'applies', k.applies, 'schema', k.schema,
    'current', private.config(k.key),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version', c.version, 'value', c.value, 'reason', c.reason,
                                                              'staff_name', p.full_name, 'effective_at', c.effective_at, 'created_at', c.created_at)
                                           order by c.version desc)
                            from public.platform_config c left join public.profiles p on p.user_id = c.staff_id
                           where c.key = k.key), '[]'::jsonb));
end;
$$;

-- p_expected: the version the editor started from; a newer save in between is refused.
create function private.ops_set_config(p_key text, p_value jsonb, p_reason text, p_expected integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  k public.config_keys;
  v_current public.platform_config;
  v_version integer;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'give a reason (3 to 500 characters)' using errcode = '22023';
  end if;
  select * into k from public.config_keys where key = p_key for update;
  if k.key is null then
    raise exception 'unknown setting' using errcode = 'P0002';
  end if;
  select * into v_current from public.platform_config where key = p_key order by version desc limit 1;
  if v_current.version is distinct from p_expected then
    raise exception 'someone saved a newer version (v%); reload and try again', v_current.version using errcode = '40001';
  end if;
  if p_value is null or not extensions.jsonb_matches_schema(k.schema::json, p_value) then
    raise exception 'that value doesn''t match the shape this setting needs: same keys, same types, no negative numbers' using errcode = '22023';
  end if;
  if p_value = v_current.value then
    raise exception 'nothing changed' using errcode = '22023';
  end if;
  v_version := coalesce(v_current.version, 0) + 1;
  insert into public.platform_config (key, version, value, reason, staff_id) values (p_key, v_version, p_value, v_reason, v_me);
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'config.set', 'config', p_key, v_reason,
          jsonb_build_object('version', v_current.version, 'value', v_current.value),
          jsonb_build_object('version', v_version, 'value', p_value, 'applies', k.applies));
  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plan prices (super admin): new subscriptions and renewals use them
-- ---------------------------------------------------------------------------
create function private.ops_plans()
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
    select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'audience', p.audience, 'tier', p.tier, 'interval', p.interval,
                                        'price_pkr', p.price_pkr, 'price_usd', p.price_usd, 'self_serve', p.self_serve, 'active', p.active,
                                        'changes', (select count(*) from public.ops_audit_log l where l.target_type = 'plan' and l.target_id = p.id))
                     order by p.audience, p.position, p.id)
      from public.plans p), '[]'::jsonb);
end;
$$;

create function private.ops_set_plan_price(p_plan text, p_price_pkr numeric, p_price_usd numeric, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_super_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  p public.plans;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'give a reason (3 to 500 characters)' using errcode = '22023';
  end if;
  select * into p from public.plans where id = p_plan for update;
  if p.id is null then
    raise exception 'unknown plan' using errcode = 'P0002';
  end if;
  if (p.price_pkr is null) <> (p_price_pkr is null) or (p.price_usd is null) <> (p_price_usd is null) then
    raise exception 'a plan keeps the currencies it has (staff-applied plans have no price)' using errcode = '22023';
  end if;
  if coalesce(p_price_pkr, 1) <= 0 or coalesce(p_price_usd, 1) <= 0 then
    raise exception 'prices must be above zero' using errcode = '22023';
  end if;
  if p.price_pkr is not distinct from p_price_pkr and p.price_usd is not distinct from p_price_usd then
    raise exception 'nothing changed' using errcode = '22023';
  end if;
  update public.plans set price_pkr = p_price_pkr, price_usd = p_price_usd where id = p_plan;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values (v_me, 'plan.price', 'plan', p_plan, v_reason,
          jsonb_build_object('price_pkr', p.price_pkr, 'price_usd', p.price_usd),
          jsonb_build_object('price_pkr', p_price_pkr, 'price_usd', p_price_usd));
end;
$$;

create function private.ops_plan_history(p_plan text)
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
    select jsonb_agg(jsonb_build_object('before', l.before, 'after', l.after, 'reason', l.reason, 'staff_name', p.full_name, 'at', l.created_at)
                     order by l.created_at desc)
      from public.ops_audit_log l left join public.profiles p on p.user_id = l.staff_id
     where l.target_type = 'plan' and l.target_id = p_plan), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Skill dictionary (trust reviewers): add, rename, retire, restore. Never delete.
-- ---------------------------------------------------------------------------
create function private.ops_skills()
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
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'parent_id', s.parent_id,
                                        'detectors', s.detectors <> '{}'::jsonb, 'retired_at', s.retired_at,
                                        'holders', (select count(*) from public.user_skills us where us.skill_id = s.id and us.level > 0))
                     order by s.retired_at is not null, s.category, s.name)
      from public.skills s), '[]'::jsonb);
end;
$$;

-- p_action: add | rename | retire | restore. Adding takes id, name, category and an optional parent.
create function private.ops_edit_skill(p_action text, p_id text, p_name text, p_category text, p_parent text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_trust_reviewer();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name text := btrim(coalesce(p_name, ''));
  s public.skills;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'give a reason (3 to 500 characters)' using errcode = '22023';
  end if;
  select * into s from public.skills where id = p_id for update;
  if p_action = 'add' then
    if s.id is not null then
      raise exception 'a skill with that id already exists' using errcode = '23505';
    end if;
    if p_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'the id is lowercase letters, digits and dashes (up to 40)' using errcode = '22023';
    end if;
    if char_length(v_name) not between 1 and 60 then
      raise exception 'name it (up to 60 characters)' using errcode = '22023';
    end if;
    if p_category is null or p_category not in ('language', 'framework', 'library', 'tool', 'platform', 'practice') then
      raise exception 'choose a category' using errcode = '22023';
    end if;
    if p_parent is not null and not exists (select 1 from public.skills where id = p_parent and retired_at is null) then
      raise exception 'the parent skill doesn''t exist' using errcode = '22023';
    end if;
    insert into public.skills (id, name, category, parent_id, taxonomy_version)
    values (p_id, v_name, p_category::public.skill_category, p_parent, coalesce((select max(taxonomy_version) from public.skills), 1));
    insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
    values (v_me, 'skill.add', 'skill', p_id, v_reason, null,
            jsonb_build_object('name', v_name, 'category', p_category, 'parent_id', p_parent));
    return;
  end if;
  if s.id is null then
    raise exception 'unknown skill' using errcode = 'P0002';
  end if;
  if p_action = 'rename' then
    if char_length(v_name) not between 1 and 60 or v_name = s.name then
      raise exception 'give a new name (up to 60 characters)' using errcode = '22023';
    end if;
    update public.skills set name = v_name where id = p_id;
    insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
    values (v_me, 'skill.rename', 'skill', p_id, v_reason, jsonb_build_object('name', s.name), jsonb_build_object('name', v_name));
  elsif p_action in ('retire', 'restore') then
    if (p_action = 'retire') = (s.retired_at is not null) then
      raise exception 'this skill is already %', case when p_action = 'retire' then 'retired' else 'in use' end using errcode = '55000';
    end if;
    update public.skills set retired_at = case when p_action = 'retire' then now() end where id = p_id;
    insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
    values (v_me, 'skill.' || p_action, 'skill', p_id, v_reason, jsonb_build_object('retired_at', s.retired_at),
            jsonb_build_object('retired_at', (select retired_at from public.skills where id = p_id)));
  else
    raise exception 'choose add, rename, retire or restore' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------
create materialized view private.ops_metrics_mv as
select 'signups'::text as series,
       coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'student', d.student, 'faculty', d.faculty, 'recruiter', d.recruiter, 'official', d.official) order by d.day)
                   from (select g.day::date as day,
                                count(*) filter (where p.role = 'student') as student,
                                count(*) filter (where p.role = 'faculty') as faculty,
                                count(*) filter (where p.role = 'recruiter') as recruiter,
                                count(*) filter (where p.role not in ('student', 'faculty', 'recruiter')) as official
                           from generate_series((now() at time zone 'Asia/Karachi')::date - 89, (now() at time zone 'Asia/Karachi')::date, interval '1 day') g(day)
                           left join public.profiles p on (p.created_at at time zone 'Asia/Karachi')::date = g.day::date
                          group by g.day) d), '[]'::jsonb) as data
union all
select 'evidence',
       coalesce((select jsonb_agg(jsonb_build_object('university', x.name, 'students', x.students, 'l2', x.l2) order by x.students desc)
                   from (select un.name, count(*) as students,
                                count(*) filter (where exists (select 1 from public.user_skills us where us.user_id = p.user_id and us.level >= 2)) as l2
                           from public.profiles p join public.universities un on un.id = p.university_id
                          where p.role = 'student' and p.onboarding_complete
                          group by un.name
                          order by count(*) desc limit 15) x), '[]'::jsonb)
union all
select 'contacts',
       coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'sent', w.sent, 'accepted', w.accepted, 'declined', w.declined) order by w.week)
                   from (select g.week::date as week,
                                count(c.id) as sent,
                                count(c.id) filter (where c.status = 'accepted') as accepted,
                                count(c.id) filter (where c.status = 'declined') as declined
                           from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(week)
                           left join public.contact_requests c on date_trunc('week', c.created_at) = g.week
                          group by g.week) w), '[]'::jsonb)
union all
select 'hires',
       coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'intern', m.intern, 'full_time', m.full_time) order by m.month)
                   from (select g.month::date as month,
                                count(h.id) filter (where h.kind = 'intern') as intern,
                                count(h.id) filter (where h.kind = 'full_time') as full_time
                           from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') g(month)
                           left join public.hires h on date_trunc('month', h.hired_at) = g.month
                          group by g.month) m), '[]'::jsonb)
union all
select 'mrr',
       coalesce((select jsonb_agg(jsonb_build_object('stream', r.subject_type, 'currency', r.currency, 'mrr', r.mrr, 'subscriptions', r.n) order by r.subject_type, r.currency)
                   from (select s.subject_type, s.currency, count(*) as n,
                                round(sum(s.period_amount / case p.interval when 'year' then 12 else 1 end), 2) as mrr
                           from public.subscriptions s join public.plans p on p.id = s.plan_id
                          where s.live and s.status in ('active', 'past_due')
                          group by s.subject_type, s.currency) r), '[]'::jsonb)
union all
select 'refreshed', to_jsonb(now());
comment on materialized view private.ops_metrics_mv is 'Business metrics for /ops/metrics (PRD 5.26), refreshed hourly by ops-metrics.';

-- Trends that need history: weekly actives per university (daily) and queue backlogs (hourly).
create table private.ops_metric_snapshots (
  taken_at timestamptz not null,
  metric text not null check (metric in ('weekly_actives', 'backlog')),
  label text not null check (char_length(label) between 1 and 120),
  value integer not null check (value >= 0),
  primary key (metric, taken_at, label)
);
comment on table private.ops_metric_snapshots is 'History for /ops/metrics trends; written by private.refresh_ops_metrics().';
alter table private.ops_metric_snapshots enable row level security;
create index ops_metric_snapshots_recent_idx on private.ops_metric_snapshots (metric, taken_at desc);

create function private.refresh_ops_metrics()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_day timestamptz := date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
  v_rows integer := 0;
  v_n integer;
begin
  refresh materialized view private.ops_metrics_mv;
  insert into private.ops_metric_snapshots (taken_at, metric, label, value)
  select v_day, 'weekly_actives', un.name, count(*)
    from private.user_activity a
    join public.profiles p on p.user_id = a.user_id
    join public.universities un on un.id = p.university_id
   where a.last_active_at > now() - interval '7 days'
   group by un.name
  on conflict (metric, taken_at, label) do update set value = excluded.value;
  get diagnostics v_n = row_count;
  v_rows := v_rows + v_n;
  insert into private.ops_metric_snapshots (taken_at, metric, label, value)
  select v_hour, 'backlog', q.label, q.n from (
    select 'reports' as label, (select count(*) from public.report_cases where status = 'open')::integer as n
    union all select 'evidence', ((select count(*) from public.credentials where status = 'pending')
                                  + (select count(*) from public.review_flags where status = 'open')
                                  + (select count(*) from public.anti_gaming_flags where status = 'open')
                                  + (select count(*) from public.code_checks where status = 'submitted' and routed_to_staff_at is not null))::integer
    union all select 'organisations', ((select count(*) from public.organizations where status = 'pending')
                                       + (select count(*) from public.university_claims where status = 'pending')
                                       + (select count(*) from public.teacher_profiles where status = 'pending'))::integer
    union all select 'appeals', (select count(*) from public.appeals where status = 'pending')::integer
    union all select 'feedback', (select count(*) from public.feedback where status in ('received', 'reviewing'))::integer
  ) q
  on conflict (metric, taken_at, label) do update set value = excluded.value;
  get diagnostics v_n = row_count;
  v_rows := v_rows + v_n;
  delete from private.ops_metric_snapshots where taken_at < now() - interval '400 days';
  return v_rows;
end;
$$;
revoke all on function private.refresh_ops_metrics() from public;
select private.refresh_ops_metrics();
select cron.schedule('ops-metrics', '23 * * * *', $$select private.refresh_ops_metrics()$$);

create function private.ops_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_any_staff();
begin
  return (select jsonb_object_agg(m.series, m.data) from private.ops_metrics_mv m)
      || jsonb_build_object(
           'weekly_actives', coalesce((select jsonb_agg(jsonb_build_object('day', s.taken_at, 'label', s.label, 'value', s.value) order by s.taken_at, s.label)
                                         from private.ops_metric_snapshots s
                                        where s.metric = 'weekly_actives' and s.taken_at > now() - interval '90 days'), '[]'::jsonb),
           'backlog', coalesce((select jsonb_agg(jsonb_build_object('at', s.taken_at, 'label', s.label, 'value', s.value) order by s.taken_at, s.label)
                                  from private.ops_metric_snapshots s
                                 where s.metric = 'backlog' and s.taken_at > now() - interval '14 days'), '[]'::jsonb));
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
  'ops_config_keys', 'ops_config_history', 'ops_set_config', 'ops_plans', 'ops_set_plan_price', 'ops_plan_history',
  'ops_skills', 'ops_edit_skill', 'ops_metrics'
]);
drop function pg_temp.expose(text[]);
