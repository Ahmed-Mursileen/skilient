-- Phase 8, slice 4: recruiter analytics, the API (hashed tokens, 60 requests a minute, only students
-- the organisation has a link with), signed webhooks, and the staff-only reputation checks
-- (response statistics and the spam review above 80% declines) (PRD 5.20).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- SHA-256 of the token; the token is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_tokens_org_idx on public.api_tokens (org_id, created_at desc);

create table public.api_webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 300),
  -- HMAC-SHA256 key, shown once when the webhook is created; readable by the worker only.
  secret text not null,
  events text[] not null check (events <@ array['application.created', 'contact.accepted']::text[] and cardinality(events) >= 1),
  active boolean not null default true,
  consecutive_failures integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index api_webhooks_org_idx on public.api_webhooks (org_id) where active;

create table public.api_webhook_deliveries (
  id bigint generated always as identity primary key,
  webhook_id uuid not null references public.api_webhooks (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  attempt integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index api_webhook_deliveries_due_idx on public.api_webhook_deliveries (next_attempt_at) where status = 'pending';
create index api_webhook_deliveries_hook_idx on public.api_webhook_deliveries (webhook_id, created_at desc);

create table public.org_spam_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  requests integer not null,
  declined integer not null,
  rate numeric(4, 3) not null,
  status text not null default 'open' check (status in ('open', 'cleared', 'suspended')),
  opened_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  note text check (note is null or char_length(note) <= 2000)
);
create unique index org_spam_reviews_open_idx on public.org_spam_reviews (org_id) where status = 'open';

alter table public.api_tokens enable row level security;
alter table public.api_webhooks enable row level security;
alter table public.api_webhook_deliveries enable row level security;
alter table public.org_spam_reviews enable row level security;
revoke all on table public.api_tokens, public.api_webhooks, public.api_webhook_deliveries, public.org_spam_reviews
  from anon, authenticated;

insert into public.notification_types (type, category, emailed) values ('org_spam_review', 'recruiting', false);

-- ---------------------------------------------------------------------------
-- Webhook events
-- ---------------------------------------------------------------------------
create or replace function private.emit_org_event(p_org uuid, p_event text, p_data jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.api_webhook_deliveries (webhook_id, event, payload)
  select w.id, p_event, jsonb_build_object('event', p_event, 'org_id', p_org, 'created_at', now(), 'data', p_data)
    from public.api_webhooks w
   where w.org_id = p_org and w.active and p_event = any (w.events)
     and private.org_entitled(p_org, 'api.access');
$$;

create function private.contact_accepted_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    perform private.emit_org_event(new.org_id, 'contact.accepted',
                                   jsonb_build_object('contact_request_id', new.id, 'candidate_id', new.student_id, 'role_title', new.role_title));
  end if;
  return new;
end;
$$;
revoke all on function private.contact_accepted_event() from public;
create trigger contact_requests_accepted after update of status on public.contact_requests
  for each row execute function private.contact_accepted_event();

-- ---------------------------------------------------------------------------
-- Tokens and webhooks (org admins; entitlement api.access)
-- ---------------------------------------------------------------------------
create function private.require_api_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[]);
begin
  if not private.org_entitled(v_org, 'api.access') then
    raise exception 'the API isn''t part of your plan yet' using errcode = '55000';
  end if;
  return v_org;
end;
$$;
revoke all on function private.require_api_admin() from public;

create function private.create_api_token(p_name text, p_token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_api_admin();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 60 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'name the token' using errcode = '22023';
  end if;
  if (select count(*) from public.api_tokens where org_id = v_org and revoked_at is null) >= 10 then
    raise exception 'up to 10 active tokens: revoke one first' using errcode = '23514';
  end if;
  insert into public.api_tokens (org_id, name, token_hash, created_by) values (v_org, v_name, p_token_hash, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create function private.revoke_api_token(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[]);
begin
  update public.api_tokens set revoked_at = now() where id = p_id and org_id = v_org and revoked_at is null;
  if not found then
    raise exception 'token not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.api_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[]);
begin
  return jsonb_build_object(
    'entitled', private.org_entitled(v_org, 'api.access'),
    'tokens', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'created_at', t.created_at,
                                                            'last_used_at', t.last_used_at, 'revoked_at', t.revoked_at) order by t.created_at desc)
                          from public.api_tokens t where t.org_id = v_org), '[]'::jsonb),
    'webhooks', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', w.id, 'url', w.url, 'events', to_jsonb(w.events), 'active', w.active,
                            'failures', w.consecutive_failures,
                            'recent', (select coalesce(jsonb_agg(jsonb_build_object('event', d.event, 'status', d.status, 'attempt', d.attempt,
                                                                                   'http', d.last_status, 'at', d.created_at) order by d.created_at desc), '[]'::jsonb)
                                         from (select * from public.api_webhook_deliveries x where x.webhook_id = w.id order by x.created_at desc limit 5) d))
                            order by w.created_at)
                          from public.api_webhooks w where w.org_id = v_org), '[]'::jsonb));
end;
$$;

-- Returns the signing secret once; only the worker can read it afterwards.
create function private.create_webhook(p_url text, p_events text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_api_admin();
  v_url text := btrim(coalesce(p_url, ''));
  v_host text;
  v_secret text := 'whsec_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  if v_url !~ '^https://[^[:space:]]+$' or char_length(v_url) > 300 then
    raise exception 'the webhook address must start with https://' using errcode = '22023';
  end if;
  v_host := lower(substring(v_url from '^https://([^/:?#]+)'));
  if v_host is null or v_host in ('localhost') or v_host !~ '\.' or v_host ~ '^[0-9.]+$' or v_host ~ '\.(local|internal|localhost)$' then
    raise exception 'use a public host name, not an address or a local name' using errcode = '22023';
  end if;
  if p_events is null or cardinality(p_events) = 0 or exists (select 1 from unnest(p_events) e where e <> all (array['application.created', 'contact.accepted'])) then
    raise exception 'pick application.created, contact.accepted or both' using errcode = '22023';
  end if;
  if (select count(*) from public.api_webhooks where org_id = v_org) >= 5 then
    raise exception 'up to 5 webhooks' using errcode = '23514';
  end if;
  insert into public.api_webhooks (org_id, url, secret, events, created_by)
  values (v_org, v_url, v_secret, (select array_agg(distinct e) from unnest(p_events) e), (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end;
$$;

create function private.delete_webhook(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[]);
begin
  delete from public.api_webhooks where id = p_id and org_id = v_org;
  if not found then
    raise exception 'webhook not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The API: token-authenticated, callable without a session, scoped to students the organisation
-- has a link with (an application, or an accepted request or shortlist entry while they're visible).
-- Never a bulk export of the talent pool.
-- ---------------------------------------------------------------------------
create function private.api_auth(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.api_tokens;
begin
  if p_token is null or char_length(p_token) not between 20 and 200 then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  select * into t from public.api_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex') and revoked_at is null;
  if not found then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  if not private.org_entitled(t.org_id, 'api.access') then
    raise exception 'the API isn''t part of this plan' using errcode = '42501';
  end if;
  if not private.rate_limit('api:' || t.id::text, 60, interval '1 minute') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = t.id;
  end if;
  return t.org_id;
end;
$$;
revoke all on function private.api_auth(text) from public;

create function private.api_linked(p_org uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org is not null and p_student is not null
     and not exists (select 1 from public.company_blocks b where b.student_id = p_student and b.org_id = p_org)
     and (exists (select 1 from public.job_applications a join public.job_posts j on j.id = a.job_id
                   where j.org_id = p_org and a.student_id = p_student and a.stage <> 'withdrawn')
          or (exists (select 1 from public.talent_index t where t.student_id = p_student)
              and (exists (select 1 from public.contact_requests c where c.org_id = p_org and c.student_id = p_student
                              and c.status = 'accepted' and c.closed_at is null)
                   or exists (select 1 from public.shortlist_items i join public.recruiter_shortlists l on l.id = i.shortlist_id
                               where l.org_id = p_org and i.student_id = p_student and not i.hidden))));
$$;
revoke all on function private.api_linked(uuid, uuid) from public;

create function private.api_candidate(p_token text, p_candidate uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.api_auth(p_token);
  r record;
begin
  if not private.api_linked(v_org, p_candidate) then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  select r2.code, r2.issued_at, r2.expires_at, r2.key_id, r2.snapshot, r2.snapshot_hash, r2.signature, k.public_key
    into r
    from public.cv_records r2 join public.signing_keys k on k.key_id = r2.key_id
   where r2.user_id = p_candidate and r2.revoked_at is null and r2.superseded_by is null and r2.expires_at > now()
   order by r2.version desc limit 1;
  if r.code is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('candidate_id', p_candidate, 'code', r.code, 'issued_at', r.issued_at, 'expires_at', r.expires_at,
                            'key_id', r.key_id, 'public_key', r.public_key, 'snapshot', r.snapshot,
                            'snapshot_hash', r.snapshot_hash, 'signature', r.signature);
end;
$$;

create function private.api_shortlists(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.api_auth(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'created_at', l.created_at) order by l.created_at)
                     from public.recruiter_shortlists l where l.org_id = v_org), '[]'::jsonb);
end;
$$;

create function private.api_shortlist_candidates(p_token text, p_list uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.api_auth(p_token);
begin
  if not exists (select 1 from public.recruiter_shortlists l where l.id = p_list and l.org_id = v_org) then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('candidate_id', i.student_id, 'name', p.full_name, 'added_at', i.created_at) order by i.position, i.created_at)
      from public.shortlist_items i
      join public.profiles p on p.user_id = i.student_id
     where i.shortlist_id = p_list and not i.hidden and private.api_linked(v_org, i.student_id)), '[]'::jsonb);
end;
$$;

create function private.api_job_applications(p_token text, p_job uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.api_auth(p_token);
begin
  if not exists (select 1 from public.job_posts j where j.id = p_job and j.org_id = v_org) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'candidate_id', a.student_id, 'stage', a.stage, 'applied_at', a.applied_at,
                                        'note', a.note, 'cv_code', a.cv_code) order by a.applied_at)
      from public.job_applications a
     where a.job_id = p_job and a.stage <> 'withdrawn' and private.api_linked(v_org, a.student_id)), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhook delivery (the webhook-worker Edge Function)
-- ---------------------------------------------------------------------------
create function private.webhook_due(p_limit integer default 20)
returns table (id bigint, url text, secret text, event text, payload jsonb, attempt integer)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select d.id from public.api_webhook_deliveries d
     where d.status = 'pending' and d.next_attempt_at <= now()
     order by d.next_attempt_at limit least(greatest(p_limit, 1), 50)
       for update skip locked
  ), claimed as (
    update public.api_webhook_deliveries d set next_attempt_at = now() + interval '2 minutes'
      from due where d.id = due.id
    returning d.id, d.webhook_id, d.event, d.payload, d.attempt
  )
  select c.id, w.url, w.secret, c.event, c.payload, c.attempt
    from claimed c join public.api_webhooks w on w.id = c.webhook_id and w.active;
$$;

-- Backoff: 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours, then failed.
create function private.webhook_result(p_id bigint, p_ok boolean, p_status integer, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.api_webhook_deliveries;
  v_delays constant interval[] := array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours', interval '12 hours'];
begin
  select * into d from public.api_webhook_deliveries where id = p_id for update;
  if not found or d.status <> 'pending' then
    return;
  end if;
  if p_ok then
    update public.api_webhook_deliveries set status = 'delivered', delivered_at = now(), attempt = d.attempt + 1, last_status = p_status, last_error = null
     where id = p_id;
    update public.api_webhooks set consecutive_failures = 0 where id = d.webhook_id;
    return;
  end if;
  if d.attempt + 1 > cardinality(v_delays) then
    update public.api_webhook_deliveries set status = 'failed', attempt = d.attempt + 1, last_status = p_status, last_error = left(p_error, 300)
     where id = p_id;
  else
    update public.api_webhook_deliveries
       set attempt = d.attempt + 1, last_status = p_status, last_error = left(p_error, 300),
           next_attempt_at = now() + v_delays[d.attempt + 1]
     where id = p_id;
  end if;
  update public.api_webhooks set consecutive_failures = consecutive_failures + 1,
                                 active = (consecutive_failures + 1) < 30
   where id = d.webhook_id;
end;
$$;
revoke all on function private.webhook_due(integer), private.webhook_result(bigint, boolean, integer, text) from public;
grant execute on function private.webhook_due(integer), private.webhook_result(bigint, boolean, integer, text) to service_role;

create function private.wake_webhook_worker()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.api_webhook_deliveries d where d.status = 'pending' and d.next_attempt_at <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/webhook-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
end;
$$;
revoke all on function private.wake_webhook_worker() from public;
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'webhook_worker_secret',
                           'Bearer secret for the webhook-worker Edge Function')
where not exists (select 1 from vault.secrets where name = 'webhook_worker_secret');
select cron.schedule('webhook-worker', '* * * * *', $$select private.wake_webhook_worker()$$);
select cron.schedule('webhook-purge', '37 3 * * *',
  $$delete from public.api_webhook_deliveries where created_at < now() - interval '30 days'$$);

-- ---------------------------------------------------------------------------
-- Analytics (Starter and above: entitlement analytics)
-- ---------------------------------------------------------------------------
create function private.org_analytics(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin', 'recruiter']::public.org_role[]);
  v_days integer := case when p_days in (30, 90, 180) then p_days else 90 end;
  v_since timestamptz := now() - make_interval(days => v_days);
  v_plan jsonb := private.org_plan();
begin
  if not private.org_entitled(v_org, 'analytics') then
    return jsonb_build_object('locked', true, 'plan', v_plan);
  end if;
  return jsonb_build_object(
    'locked', false, 'days', v_days, 'plan', v_plan,
    'funnel', jsonb_build_object(
      'views', (select count(*) from public.profile_views v where v.org_id = v_org and v.at >= v_since),
      'contacts', (select count(*) from public.contact_requests c where c.org_id = v_org and c.created_at >= v_since),
      'accepted', (select count(*) from public.contact_requests c where c.org_id = v_org and c.created_at >= v_since and c.status = 'accepted'),
      'applied', (select count(*) from public.job_applications a join public.job_posts j on j.id = a.job_id
                   where j.org_id = v_org and a.applied_at >= v_since),
      'hired', (select count(*) from public.hires h where h.org_id = v_org and h.hired_at >= v_since)),
    -- Their own response time: how long an application waits for its first move.
    'median_first_response_hours', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (e.at - a.applied_at)) / 3600))::numeric, 1)
        from public.job_applications a
        join public.job_posts j on j.id = a.job_id and j.org_id = v_org
        join lateral (select min(x.at) as at from public.application_events x where x.application_id = a.id and x.stage <> 'applied') e on e.at is not null
       where a.applied_at >= v_since),
    'median_days_to_hire', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (h.hired_at - a.applied_at)) / 86400))::numeric, 1)
        from public.hires h join public.job_applications a on a.id = h.application_id
       where h.org_id = v_org and h.hired_at >= v_since),
    -- What they keep searching for.
    'skills_demand', coalesce((
      select jsonb_agg(jsonb_build_object('skill', x.name, 'searches', x.n) order by x.n desc, x.name)
        from (select coalesce(s.name, e ->> 'skill') as name, count(*) as n
                from public.search_audit a
                cross join lateral jsonb_array_elements(coalesce(a.filters -> 'skills', '[]'::jsonb)) e
                left join public.skills s on s.id = e ->> 'skill'
               where a.org_id = v_org and a.at >= v_since
               group by 1 order by n desc limit 10) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reputation (staff only) and the spam review
-- ---------------------------------------------------------------------------
create function private.org_response_stats(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only, with two-factor on' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'requests_30d', count(*),
             'answered_30d', count(*) filter (where c.status in ('accepted', 'declined')),
             'response_rate', case when count(*) > 0 then round(count(*) filter (where c.status in ('accepted', 'declined'))::numeric / count(*), 3) end,
             'decline_rate', case when count(*) filter (where c.status <> 'pending') > 0
                                  then round(count(*) filter (where c.status = 'declined')::numeric / count(*) filter (where c.status <> 'pending'), 3) end,
             'median_response_hours', (select round((percentile_cont(0.5) within group (order by extract(epoch from (x.decided_at - x.created_at)) / 3600))::numeric, 1)
                                         from public.contact_requests x
                                        where x.org_id = p_org and x.created_at > now() - interval '30 days' and x.status in ('accepted', 'declined')))
      from public.contact_requests c where c.org_id = p_org and c.created_at > now() - interval '30 days');
end;
$$;

create function private.ops_org_reputation(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only, with two-factor on' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'stats', private.org_response_stats(p_org),
    'searches', coalesce((select jsonb_agg(jsonb_build_object('mode', a.mode, 'filters', a.filters, 'results', a.result_count, 'at', a.at,
                                                              'by', (select p.full_name from public.profiles p where p.user_id = a.user_id)) order by a.at desc)
                            from (select * from public.search_audit where org_id = p_org order by at desc limit 20) a), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'rate', r.rate, 'requests', r.requests,
                                                             'declined', r.declined, 'opened_at', r.opened_at, 'note', r.note) order by r.opened_at desc)
                           from public.org_spam_reviews r where r.org_id = p_org), '[]'::jsonb));
end;
$$;

-- Daily: an organisation above 80% declines over 30 days (with at least 10 answered requests) gets a spam review.
create function private.check_org_spam()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o record;
  v_n integer := 0;
begin
  for o in
    select c.org_id, count(*) as total, count(*) filter (where c.status = 'declined') as declined
      from public.contact_requests c join public.organizations g on g.id = c.org_id and g.status = 'verified'
     where c.created_at > now() - interval '30 days' and c.status <> 'pending'
     group by c.org_id
    having count(*) >= private.recruit_limit('spam_min_requests')
       and count(*) filter (where c.status = 'declined')::numeric / count(*) > private.recruit_limit('spam_decline_rate')
  loop
    insert into public.org_spam_reviews (org_id, requests, declined, rate)
    values (o.org_id, o.total, o.declined, round(o.declined::numeric / o.total, 3))
    on conflict do nothing;
    if found then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.check_org_spam() from public;
select cron.schedule('org-spam-check', '29 4 * * *', $$select private.check_org_spam()$$);

create function private.ops_spam_reviews(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'org_id', o.id, 'org', o.name, 'domain', o.domain, 'rate', r.rate,
                                        'requests', r.requests, 'declined', r.declined, 'status', r.status, 'opened_at', r.opened_at,
                                        'note', r.note) order by r.opened_at)
      from public.org_spam_reviews r join public.organizations o on o.id = r.org_id
     where r.status = p_status), '[]'::jsonb);
end;
$$;

-- action: clear | suspend
create function private.ops_resolve_spam_review(p_id uuid, p_action text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  r public.org_spam_reviews;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into r from public.org_spam_reviews where id = p_id and status = 'open' for update;
  if not found then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if p_action not in ('clear', 'suspend') or char_length(v_reason) < 3 then
    raise exception 'pick clear or suspend and give a reason' using errcode = '22023';
  end if;
  update public.org_spam_reviews
     set status = case p_action when 'clear' then 'cleared' else 'suspended' end, resolved_by = v_me, resolved_at = now(), note = v_reason
   where id = p_id;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, after)
  values (v_me, 'org.spam_' || p_action, 'organization', r.org_id::text, v_reason, jsonb_build_object('review', p_id));
  if p_action = 'suspend' then
    perform private.decide_org(r.org_id, 'suspend', v_reason);
  end if;
end;
$$;

-- /verify/[code]: a signed-in recruiter who may open this student gets the "Open candidate" link there.
create function private.recruit_candidate_for_code(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_student uuid;
begin
  select r.user_id into v_student from public.cv_records r where r.code = upper(btrim(p_code));
  if v_student is null or private.candidate_access(v_org, v_student) is null then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;
  return v_student;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and public wrappers (security invoker), generated from one list
-- ---------------------------------------------------------------------------
create function pg_temp.expose(p_names text[], p_anon boolean default false)
returns void
language plpgsql
as $$
declare
  n text;
  r record;
  v_names text;
  v_to text := case when p_anon then 'anon, authenticated' else 'authenticated' end;
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
    execute format('grant execute on function private.%I(%s) to %s', n, r.ident, v_to);
    execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path = %L as $f$ select private.%I(%s) $f$',
                   n, r.args, r.result, case r.provolatile when 'v' then 'volatile' else 'stable' end, '', n, v_names);
    execute format('revoke all on function public.%I(%s) from public, anon', n, r.ident);
    execute format('grant execute on function public.%I(%s) to %s', n, r.ident, v_to);
  end loop;
end;
$$;

select pg_temp.expose(array[
  'create_api_token', 'revoke_api_token', 'api_settings', 'create_webhook', 'delete_webhook',
  'org_analytics', 'org_response_stats', 'ops_org_reputation', 'ops_spam_reviews', 'ops_resolve_spam_review',
  'recruit_candidate_for_code'
]);
-- The API functions are called without a session, carrying their own bearer token.
select pg_temp.expose(array['api_candidate', 'api_shortlists', 'api_shortlist_candidates', 'api_job_applications'], true);

drop function pg_temp.expose(text[], boolean);
