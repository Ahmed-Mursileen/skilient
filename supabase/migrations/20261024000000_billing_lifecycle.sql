-- Phase 10 (billing), part 2 — B2 and B3: checkout, verified webhooks, the subscription lifecycle, invoices and
-- tax, add-ons and hiring fees (PRD 4b.5–4b.10; decisions.md 2026-10-05 "phase 10").
--
-- How money moves:
--   1. A server action calls `create_checkout` (amount and tax computed here from `plans`, never from the
--      client) and gets a checkout session. The gateway adapter (simulated, Safepay, Paddle) opens its page.
--   2. The gateway's signed result reaches /api/billing/webhook/[gateway]; the route verifies it and calls
--      `record_billing_event` (service role only), which stores it once (gateway + event id unique) and queues it.
--   3. `billing-events` (pg_cron, every 10 s) applies queued events in SQL: payment, subscription, grants,
--      invoice, notices. A duplicate event changes nothing.
--   4. `billing-tick` (every 5 min) moves subscriptions on in time: trials end, periods roll or expire, card
--      renewals and retries are queued for the `billing-worker` Edge Function (pgmq `billing_jobs`), which
--      calls the gateway and records the outcome as an event like any webhook.
-- Simulated payments, and the subscriptions, payments and invoices they create, carry `live = false` and never
-- count as revenue; invoices issued while `billing.live_mode` is off are in the TEST series.

-- ---------------------------------------------------------------------------
-- Types and config
-- ---------------------------------------------------------------------------
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'expired', 'cancelled');

insert into public.platform_config (key, version, value, reason) values
  ('billing.company', 1,
   '{"legal_name": "", "trading_name": "Skilient", "ntn": "", "strn": "", "address": "", "email": "", "phone": "",
     "bank": {"account_title": "", "bank_name": "", "iban": "", "swift": "", "branch": ""}}',
   'Phase 10 placeholder: company details printed on invoices; invoices say DRAFT until legal name, NTN and address are set'),
  ('billing.live_mode', 1, 'false',
   'Phase 10: invoices not tied to a gateway payment (hiring fees, licences) are TEST until this is true'),
  ('billing.simulated_testers', 1, '[]',
   'Phase 10: user ids allowed to use the simulated gateway in production (staff always may)');

alter table public.organizations
  add column province text check (province is null or province in ('Punjab', 'Sindh', 'KP', 'Balochistan', 'ICT', 'AJK', 'GB')),
  add column billing_ntn text check (billing_ntn is null or char_length(btrim(billing_ntn)) between 3 and 30),
  add column billing_address text check (billing_address is null or char_length(btrim(billing_address)) between 5 and 300);
alter table public.universities
  add column billing_ntn text check (billing_ntn is null or char_length(btrim(billing_ntn)) between 3 and 30),
  add column billing_address text check (billing_address is null or char_length(btrim(billing_address)) between 5 and 300);
alter table public.org_members
  add column seat_keep boolean not null default false;
alter table public.job_posts
  add column sponsored_until timestamptz,
  add column paused_at timestamptz;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  province text not null check (province in ('Punjab', 'Sindh', 'KP', 'Balochistan', 'ICT', 'AJK', 'GB')),
  label text not null check (char_length(btrim(label)) between 3 and 60),
  rate numeric(6, 4) not null check (rate >= 0 and rate <= 0.5),
  effective_from date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (province, effective_from)
);
comment on table public.tax_rates is 'Provincial sales tax on services, entered by accounts staff from the accountant''s advice (PRD 4b.10). Never hard-coded.';
create index tax_rates_entered_by_idx on public.tax_rates (entered_by);

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  purpose text not null check (purpose in ('subscription', 'add_on', 'invoice')),
  plan_id text references public.plans (id),
  -- new | upgrade | renew_prepaid (subscriptions only)
  change text check (change is null or change in ('new', 'upgrade', 'renew_prepaid')),
  add_on_order_id uuid,
  invoice_id uuid,
  -- The quote: lines, subtotal, tax lines, total and draft reasons, fixed when the session was made.
  quote jsonb not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('PKR', 'USD')),
  gateway text not null check (gateway in ('simulated', 'safepay', 'payfast', 'paddle')),
  live boolean not null,
  gateway_session_ref text,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 80),
  status text not null default 'open' check (status in ('open', 'paid', 'failed', 'cancelled', 'expired')),
  failure_reason text,
  subscription_id uuid,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (created_by, idempotency_key),
  check ((purpose = 'subscription') = (plan_id is not null and change is not null)),
  check ((purpose = 'add_on') = (add_on_order_id is not null)),
  check ((purpose = 'invoice') = (invoice_id is not null))
);
comment on table public.checkout_sessions is
  'A payment the subject has started (PRD 4b.5). The amount is computed on the server; the gateway result arrives by webhook.';
create index checkout_sessions_subject_idx on public.checkout_sessions (subject_type, subject_id, created_at desc);
create index checkout_sessions_open_idx on public.checkout_sessions (expires_at) where status = 'open';
create index checkout_sessions_plan_idx on public.checkout_sessions (plan_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null,
  -- simulated | safepay | payfast | paddle | manual (bank transfer, licences) | comp (staff) | none (trial)
  gateway text not null check (gateway in ('simulated', 'safepay', 'payfast', 'paddle', 'manual', 'comp', 'none')),
  live boolean not null,
  -- card renews automatically; wallet and bank transfer are prepaid periods; none for trials and comps.
  payment_method text not null check (payment_method in ('card', 'wallet', 'bank_transfer', 'none')),
  currency text not null default 'PKR' check (currency in ('PKR', 'USD')),
  -- What the current period cost before tax (for the upgrade credit).
  period_amount numeric(12, 2) not null default 0 check (period_amount >= 0),
  gateway_customer_ref text,
  gateway_subscription_ref text,
  -- A token or id the gateway gave for the saved card (never card details).
  saved_method_ref text,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  next_period_paid boolean not null default false,
  next_plan_id text references public.plans (id),
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  retry_count smallint not null default 0,
  next_retry_at timestamptz,
  charge_pending boolean not null default false,
  pending_charge jsonb,
  -- Simulated gateway only: the next renewal charge fails (staff test tool).
  simulate_fail_next boolean not null default false,
  po_number text check (po_number is null or char_length(btrim(po_number)) between 1 and 60),
  renewal_invoice_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,
  check (current_period_end > current_period_start)
);
comment on table public.subscriptions is
  'Plans a subject holds over time (PRD 4b.5). State moves only by verified events and the billing tick.';
create unique index subscriptions_one_current_idx on public.subscriptions (subject_type, subject_id)
  where status in ('trialing', 'active', 'past_due');
create index subscriptions_subject_idx on public.subscriptions (subject_type, subject_id, created_at desc);
create index subscriptions_due_idx on public.subscriptions (current_period_end) where status in ('trialing', 'active', 'past_due');
create index subscriptions_plan_idx on public.subscriptions (plan_id);
create index subscriptions_next_plan_idx on public.subscriptions (next_plan_id);
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  checkout_session_id uuid references public.checkout_sessions (id) on delete set null,
  invoice_id uuid,
  kind text not null check (kind in ('subscription', 'add_on', 'hire_fee', 'licence', 'invoice')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('PKR', 'USD')),
  gateway text not null,
  gateway_payment_id text not null check (char_length(gateway_payment_id) between 3 and 200),
  method text not null check (method in ('card', 'wallet', 'bank_transfer')),
  status text not null default 'succeeded' check (status in ('succeeded', 'refunded', 'partially_refunded')),
  refunded_amount numeric(12, 2) not null default 0 check (refunded_amount >= 0),
  -- USD sales go through the merchant of record, whose invoice is the tax document.
  mor_invoice_ref text,
  live boolean not null,
  created_at timestamptz not null default now(),
  unique (gateway, gateway_payment_id),
  check (refunded_amount <= amount)
);
comment on table public.payments is 'Money received, one row per gateway payment id (PRD 4b.2). Test payments have live = false.';
create index payments_subject_idx on public.payments (subject_type, subject_id, created_at desc);
create index payments_subscription_idx on public.payments (subscription_id);
create index payments_session_idx on public.payments (checkout_session_id);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_live_idx on public.payments (created_at) where live;

create table public.billing_webhook_events (
  id bigint generated always as identity primary key,
  gateway text not null check (gateway in ('simulated', 'safepay', 'payfast', 'paddle', 'worker')),
  event_id text not null check (char_length(event_id) between 3 and 200),
  type text not null check (char_length(type) between 3 and 80),
  -- The gateway's body as received (no card data is ever in it) and the adapter's normalised reading of it.
  payload jsonb not null,
  event jsonb not null,
  live boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  attempts integer not null default 0,
  error text,
  unique (gateway, event_id)
);
comment on table public.billing_webhook_events is
  'Verified gateway events, stored once (PRD 4b.12: event id unique so replays are ignored). Kept 400 days.';
create index billing_webhook_events_received_idx on public.billing_webhook_events (gateway, received_at desc);
create index billing_webhook_events_failed_idx on public.billing_webhook_events (received_at) where processed_at is null;

create table public.invoice_counters (
  series text not null check (series in ('SKL', 'TEST', 'SKL-CN', 'TEST-CN')),
  year integer not null,
  last integer not null default 0,
  primary key (series, year)
);
comment on table public.invoice_counters is 'Gapless invoice numbers per series and year (SKL-YYYY-NNNNNN); never reused.';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  series text not null,
  kind text not null check (kind in ('invoice', 'receipt', 'credit_note')),
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  credits_invoice_id uuid references public.invoices (id),
  payment_id uuid references public.payments (id) on delete set null,
  purpose text not null check (purpose in ('subscription', 'add_on', 'hire_fee', 'licence', 'refund')),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  subtotal numeric(12, 2) not null,
  tax_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(tax_lines) = 'array'),
  tax_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  currency text not null check (currency in ('PKR', 'USD')),
  status text not null check (status in ('issued', 'paid', 'void')),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  po_number text,
  bill_to jsonb not null,
  seller jsonb not null,
  -- Why this document is not a final tax invoice: test_mode, company_details_missing, tax_rate_missing.
  draft_reasons text[] not null default '{}',
  live boolean not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  check ((kind = 'credit_note') = (credits_invoice_id is not null))
);
comment on table public.invoices is
  'Invoices, receipts and credit notes (PRD 4b.10). The content is fixed at issue (hash); only the status changes.';
create index invoices_subject_idx on public.invoices (subject_type, subject_id, issued_at desc);
create index invoices_open_idx on public.invoices (due_at) where status = 'issued';
create index invoices_credits_idx on public.invoices (credits_invoice_id);
create index invoices_payment_idx on public.invoices (payment_id);
create index invoices_created_by_idx on public.invoices (created_by);
alter table public.payments add constraint payments_invoice_fk foreign key (invoice_id) references public.invoices (id) on delete set null;
alter table public.checkout_sessions add constraint checkout_sessions_invoice_fk foreign key (invoice_id) references public.invoices (id) on delete cascade;
alter table public.checkout_sessions add constraint checkout_sessions_subscription_fk foreign key (subscription_id) references public.subscriptions (id) on delete set null;
alter table public.subscriptions add constraint subscriptions_renewal_invoice_fk foreign key (renewal_invoice_id) references public.invoices (id) on delete set null;
create index checkout_sessions_invoice_idx on public.checkout_sessions (invoice_id);
create index checkout_sessions_subscription_idx on public.checkout_sessions (subscription_id);
create index subscriptions_renewal_invoice_idx on public.subscriptions (renewal_invoice_id);
create index subscriptions_created_by_idx on public.subscriptions (created_by);
create index checkout_sessions_created_by_idx on public.checkout_sessions (created_by);

create function private.invoice_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoices are never deleted; void them with a credit note' using errcode = '42501';
  end if;
  if (new.number, new.kind, new.lines, new.subtotal, new.tax_lines, new.tax_total, new.total, new.currency, new.bill_to, new.seller,
      new.issued_at, new.live, new.content_hash, new.subject_id)
     is distinct from
     (old.number, old.kind, old.lines, old.subtotal, old.tax_lines, old.tax_total, old.total, old.currency, old.bill_to, old.seller,
      old.issued_at, old.live, old.content_hash, old.subject_id) then
    raise exception 'an issued invoice can''t change; issue a credit note' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.invoice_immutable() from public;
create trigger invoices_immutable before update or delete on public.invoices
  for each row execute function private.invoice_immutable();

create table public.add_on_orders (
  id uuid primary key default gen_random_uuid(),
  subject_type public.billing_subject not null check (subject_type = 'org'),
  subject_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('contact_credits', 'sponsored_post')),
  quantity integer not null check (quantity between 1 and 100),
  job_id uuid references public.job_posts (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('PKR', 'USD')),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'cancelled', 'refunded')),
  live boolean not null,
  fulfilled_at timestamptz,
  grant_id uuid references public.entitlement_grants (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'sponsored_post') = (job_id is not null) or status <> 'pending')
);
comment on table public.add_on_orders is 'Contact credits and sponsored posts (PRD 4b.8). Fulfilled only by a verified payment.';
create index add_on_orders_subject_idx on public.add_on_orders (subject_id, created_at desc);
create index add_on_orders_job_idx on public.add_on_orders (job_id);
create index add_on_orders_grant_idx on public.add_on_orders (grant_id);
create index add_on_orders_created_by_idx on public.add_on_orders (created_by);
alter table public.checkout_sessions add constraint checkout_sessions_add_on_fk foreign key (add_on_order_id) references public.add_on_orders (id) on delete cascade;
create index checkout_sessions_add_on_idx on public.checkout_sessions (add_on_order_id);

create table public.hire_fees (
  id uuid primary key default gen_random_uuid(),
  hire_id uuid unique references public.hires (id) on delete set null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('intern', 'full_time')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'PKR' check (currency = 'PKR'),
  status text not null check (status in ('pending', 'invoiced', 'paid', 'disputed', 'void', 'waived')),
  invoice_id uuid references public.invoices (id) on delete set null,
  due_at timestamptz,
  dispute_kind text check (dispute_kind is null or dispute_kind in ('candidate_withdrew', 'marked_in_error')),
  dispute_reason text check (dispute_reason is null or char_length(btrim(dispute_reason)) between 10 and 1000),
  disputed_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_reason text,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.hire_fees is 'The flat fee per recorded hire (PRD 4b.9), unless the organisation''s plan waives it.';
create index hire_fees_org_idx on public.hire_fees (org_id, created_at desc);
create index hire_fees_invoice_idx on public.hire_fees (invoice_id);
create index hire_fees_resolved_by_idx on public.hire_fees (resolved_by);
create index hire_fees_overdue_idx on public.hire_fees (due_at) where status = 'invoiced';

create table public.billing_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('offer_follow_up', 'unreported_hire', 'amount_mismatch', 'licence_request')),
  subject_type public.billing_subject not null,
  subject_id uuid not null,
  ref_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  note text,
  unique (kind, ref_id)
);
comment on table public.billing_tasks is 'Follow-ups for accounts staff (PRD 4b.9 unreported hires, licence requests).';
create index billing_tasks_open_idx on public.billing_tasks (created_at) where done_at is null;
create index billing_tasks_done_by_idx on public.billing_tasks (done_by);

create table public.billing_reminders (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  period_end timestamptz not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, period_end, kind)
);
comment on table public.billing_reminders is 'Which renewal and expiry reminders went out, so each is sent once.';

alter table public.tax_rates enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.add_on_orders enable row level security;
alter table public.hire_fees enable row level security;
alter table public.billing_tasks enable row level security;
alter table public.billing_reminders enable row level security;
revoke all on table public.tax_rates, public.checkout_sessions, public.subscriptions, public.payments, public.billing_webhook_events,
  public.invoice_counters, public.invoices, public.add_on_orders, public.hire_fees, public.billing_tasks, public.billing_reminders
  from anon, authenticated;
-- Default deny: the subject (a student, an organisation's admin and billing members, a university's owner) and
-- accounts staff read through the functions below; only billing functions and the worker write.

select pgmq.create('billing_events');
select pgmq.create('billing_jobs');

-- ---------------------------------------------------------------------------
-- Notifications: billing is transactional, so it always emails at once (decisions.md 2026-10-05)
-- ---------------------------------------------------------------------------
insert into public.notification_categories (category, label, description, position, default_channel, allow_instant) values
  ('billing', 'Billing', 'Receipts, invoices, failed payments, renewals and sponsorship. Always emailed; can''t be turned off.', 30, 'instant_email', true);
insert into public.notification_types (type, category, emailed) values
  ('billing_payment_succeeded', 'billing', true),
  ('billing_payment_failed', 'billing', true),
  ('billing_trial_started', 'billing', false),
  ('billing_trial_ended', 'billing', true),
  ('billing_renewal_reminder', 'billing', true),
  ('billing_subscription_ended', 'billing', true),
  ('billing_invoice_issued', 'billing', true),
  ('billing_hire_fee', 'billing', true),
  ('billing_hire_fee_overdue', 'billing', true),
  ('billing_refund', 'billing', true),
  ('billing_plan_changed', 'billing', false),
  ('billing_limits_applied', 'billing', true),
  ('billing_sponsorship_started', 'billing', true),
  ('billing_sponsorship_ending', 'billing', true);

create or replace function private.email_channel_for(p_user uuid, p_type text)
returns public.email_channel
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when not t.emailed then 'off'::public.email_channel
           -- Billing notices are transactional: always instant, whatever the stored preference.
           when t.category = 'billing' then 'instant_email'::public.email_channel
           when coalesce(p.channel, c.default_channel) = 'instant_email' and not c.allow_instant
             then 'digest'::public.email_channel
           else coalesce(p.channel, c.default_channel)
         end
    from public.notification_types t
    join public.notification_categories c on c.category = t.category
    left join public.notification_prefs p on p.user_id = p_user and p.category = t.category
   where t.type = p_type;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Who may see and act on a subject's billing: the student; an organisation's active admin and billing
-- members; a university's owner.
create function private.billing_readers(p_type public.billing_subject, p_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p_id where p_type = 'user'
  union
  select m.user_id from public.org_members m
   where p_type = 'org' and m.org_id = p_id and m.status = 'active' and m.role in ('admin', 'billing')
  union
  select a.user_id from public.university_admins a
   where p_type = 'university' and a.university_id = p_id and a.role = 'owner';
$$;
revoke all on function private.billing_readers(public.billing_subject, uuid) from public;

create function private.billing_notify(p_type public.billing_subject, p_id uuid, p_ntype text, p_entity uuid, p_data jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.notify(r, null, p_ntype, 'billing', coalesce(p_entity, p_id),
                        coalesce(p_data, '{}'::jsonb) || jsonb_build_object('subject', p_type))
    from private.billing_readers(p_type, p_id) r;
$$;
revoke all on function private.billing_notify(public.billing_subject, uuid, text, uuid, jsonb) from public;

-- The caller's billing subject, for reading (p_write false) or paying and changing plans (true).
-- Organisations: admin and billing members on two-factor (require_org). Universities: the owner on
-- two-factor (require_uni). Students: themselves (onboarded).
create function private.billing_subject_of_caller(p_subject text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_subject = 'user' then
    return private.require_user();
  elsif p_subject = 'org' then
    return private.require_org(array['admin', 'billing']::public.org_role[], false);
  elsif p_subject = 'university' then
    return (private.require_uni(array['owner']::public.uni_admin_role[])).university_id;
  end if;
  raise exception 'unknown subject' using errcode = '22023';
end;
$$;
revoke all on function private.billing_subject_of_caller(text) from public;

create function private.billing_subject_name(p_type public.billing_subject, p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
           when 'user' then (select coalesce(p.full_name, p.username, 'Student') from public.profiles p where p.user_id = p_id)
           when 'org' then (select o.name from public.organizations o where o.id = p_id)
           else (select u.name from public.universities u where u.id = p_id) end;
$$;
revoke all on function private.billing_subject_name(public.billing_subject, uuid) from public;

create function private.plan_interval(p_plan text)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select case p.interval when 'year' then interval '1 year' else interval '1 month' end from public.plans p where p.id = p_plan;
$$;
revoke all on function private.plan_interval(text) from public;

create function private.plan_rank(p_plan text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p.tier when 'pro' then 1 when 'starter' then 1 when 'basic' then 1 when 'growth' then 2
                     when 'enterprise' then 3 when 'campus' then 3 else 0 end * 10
         + case p.interval when 'year' then 1 else 0 end
    from public.plans p where p.id = p_plan;
$$;
revoke all on function private.plan_rank(text) from public;

create function private.billing_live_mode()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.config('billing.live_mode') #>> '{}')::boolean, false);
$$;
revoke all on function private.billing_live_mode() from public;

create function private.lifecycle(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.config('billing.lifecycle') -> p_key;
$$;
revoke all on function private.lifecycle(text) from public;

-- Company details on invoices (config placeholders Ahmed fills in; see the setup checklist).
create function private.billing_company()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.config('billing.company'), '{}'::jsonb);
$$;
revoke all on function private.billing_company() from public;

create function private.company_complete(p_with_tax boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(btrim(c ->> 'legal_name'), '') <> '' and coalesce(btrim(c ->> 'ntn'), '') <> ''
     and coalesce(btrim(c ->> 'address'), '') <> ''
     and (not p_with_tax or coalesce(btrim(c ->> 'strn'), '') <> '')
    from (select private.billing_company() as c) x;
$$;
revoke all on function private.company_complete(boolean) from public;

create function private.subject_province(p_type public.billing_subject, p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type when 'org' then (select o.province from public.organizations o where o.id = p_id)
                     when 'university' then (select u.province from public.universities u where u.id = p_id) end;
$$;
revoke all on function private.subject_province(public.billing_subject, uuid) from public;

create function private.tax_rate_for(p_province text, p_on date)
returns public.tax_rates
language sql
stable
security definer
set search_path = ''
as $$
  select t.* from public.tax_rates t
   where t.province = p_province and t.effective_from <= p_on
   order by t.effective_from desc limit 1;
$$;
revoke all on function private.tax_rate_for(text, date) from public;

-- A quote: lines [{description, quantity, unit_amount, amount}] → subtotal, provincial tax for organisation
-- and university PKR invoices (from tax_rates for the subject's province today), total, and the reasons
-- the document would be a draft. Students' prices include tax and get a receipt; USD goes through the
-- merchant of record, which handles tax.
create function private.billing_quote(p_type public.billing_subject, p_id uuid, p_lines jsonb, p_currency text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric(12, 2) := (select coalesce(sum((l ->> 'amount')::numeric), 0) from jsonb_array_elements(p_lines) l);
  v_taxable boolean := p_type in ('org', 'university') and p_currency = 'PKR';
  v_province text := private.subject_province(p_type, p_id);
  r public.tax_rates;
  v_tax numeric(12, 2) := 0;
  v_tax_lines jsonb := '[]'::jsonb;
  v_reasons text[] := '{}';
begin
  if v_taxable then
    r := private.tax_rate_for(v_province, (now() at time zone 'Asia/Karachi')::date);
    if r.id is null then
      v_reasons := array_append(v_reasons, 'tax_rate_missing');
    else
      v_tax := round(v_subtotal * r.rate, 2);
      v_tax_lines := jsonb_build_array(jsonb_build_object('label', r.label, 'province', r.province, 'rate', r.rate, 'amount', v_tax));
    end if;
  end if;
  if not private.company_complete(v_taxable) then
    v_reasons := array_append(v_reasons, 'company_details_missing');
  end if;
  return jsonb_build_object('lines', p_lines, 'subtotal', v_subtotal, 'tax_lines', v_tax_lines, 'tax_total', v_tax,
                            'total', v_subtotal + v_tax, 'currency', p_currency, 'draft_reasons', to_jsonb(v_reasons),
                            'document', case when p_type = 'user' then 'receipt' else 'invoice' end);
end;
$$;
revoke all on function private.billing_quote(public.billing_subject, uuid, jsonb, text) from public;

create function private.next_invoice_number(p_series text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now() at time zone 'Asia/Karachi')::integer;
  v_n integer;
begin
  insert into public.invoice_counters as c (series, year, last) values (p_series, v_year, 1)
  on conflict (series, year) do update set last = c.last + 1
  returning c.last into v_n;
  return p_series || '-' || v_year::text || '-' || lpad(v_n::text, 6, '0');
end;
$$;
revoke all on function private.next_invoice_number(text) from public;

create function private.bill_to(p_type public.billing_subject, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'user' then (select jsonb_build_object('name', coalesce(p.full_name, p.username), 'email', u.email)
                        from public.profiles p join auth.users u on u.id = p.user_id where p.user_id = p_id)
    when 'org' then (select jsonb_build_object('name', o.name, 'address', coalesce(o.billing_address, o.city), 'province', o.province,
                                               'ntn', o.billing_ntn, 'domain', o.domain)
                       from public.organizations o where o.id = p_id)
    else (select jsonb_build_object('name', u.name, 'address', coalesce(u.billing_address, u.city), 'province', u.province, 'ntn', u.billing_ntn)
            from public.universities u where u.id = p_id) end;
$$;
revoke all on function private.bill_to(public.billing_subject, uuid) from public;

-- Issues an invoice, receipt or credit note from a quote. Its content is fixed from here on (hash).
create function private.issue_invoice(p_type public.billing_subject, p_id uuid, p_kind text, p_purpose text, p_quote jsonb,
                                      p_live boolean, p_status text, p_due_at timestamptz default null,
                                      p_payment uuid default null, p_po text default null, p_credits uuid default null,
                                      p_by uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_series text := case when p_live then 'SKL' else 'TEST' end || case when p_kind = 'credit_note' then '-CN' else '' end;
  v_number text := private.next_invoice_number(v_series);
  v_reasons text[] := array(select jsonb_array_elements_text(coalesce(p_quote -> 'draft_reasons', '[]'::jsonb)));
  v_seller jsonb := private.billing_company();
  v_bill jsonb := private.bill_to(p_type, p_id);
  v_body jsonb;
  v_id uuid;
begin
  if not p_live then
    v_reasons := array_prepend('test_mode', v_reasons);
  end if;
  v_body := jsonb_build_object('number', v_number, 'kind', p_kind, 'lines', p_quote -> 'lines', 'subtotal', p_quote -> 'subtotal',
                               'tax_lines', coalesce(p_quote -> 'tax_lines', '[]'::jsonb), 'total', p_quote -> 'total',
                               'currency', p_quote ->> 'currency', 'bill_to', v_bill, 'seller', v_seller, 'po_number', p_po);
  insert into public.invoices (number, series, kind, subject_type, subject_id, credits_invoice_id, payment_id, purpose, lines, subtotal,
                               tax_lines, tax_total, total, currency, status, issued_at, due_at, paid_at, po_number, bill_to, seller,
                               draft_reasons, live, content_hash, created_by)
  values (v_number, v_series, p_kind, p_type, p_id, p_credits, p_payment, p_purpose, p_quote -> 'lines', (p_quote ->> 'subtotal')::numeric,
          coalesce(p_quote -> 'tax_lines', '[]'::jsonb), coalesce((p_quote ->> 'tax_total')::numeric, 0), (p_quote ->> 'total')::numeric,
          p_quote ->> 'currency', p_status, now(), p_due_at, case when p_status = 'paid' then now() end, p_po, v_bill, v_seller,
          v_reasons, p_live, encode(extensions.digest(convert_to(v_body::text, 'UTF8'), 'sha256'), 'hex'), p_by)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.issue_invoice(public.billing_subject, uuid, text, text, jsonb, boolean, text, timestamptz, uuid, text, uuid, uuid) from public;

create function private.current_subscription(p_type public.billing_subject, p_id uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.subscriptions s
   where s.subject_type = p_type and s.subject_id = p_id and s.status in ('trialing', 'active', 'past_due');
$$;
revoke all on function private.current_subscription(public.billing_subject, uuid) from public;

-- Contact credits reset at each renewal: the counter period is the paid subscription's current period.
create or replace function private.current_subscription_period(p_type public.billing_subject, p_id uuid)
returns tstzrange
language sql
stable
security definer
set search_path = ''
as $$
  select tstzrange(s.current_period_start, s.current_period_end)
    from public.subscriptions s
   where s.subject_type = p_type and s.subject_id = p_id and s.status in ('active', 'past_due');
$$;

-- Re-creates a subscription's plan grants for its current state: trial grants until the trial ends, plan
-- grants until the period ends (or the grace period while past due). Ended subscriptions hold none.
create function private.sync_plan_grants(p_sub uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_until timestamptz;
begin
  select * into s from public.subscriptions where id = p_sub;
  update public.entitlement_grants set revoked_at = now(), revoked_reason = 'subscription changed'
   where source in ('plan', 'trial') and source_id = p_sub and revoked_at is null;
  if s.status not in ('trialing', 'active', 'past_due') then
    return;
  end if;
  v_until := case s.status when 'trialing' then s.trial_ends_at
                           when 'past_due' then greatest(s.grace_ends_at, s.current_period_end)
                           else s.current_period_end end;
  if v_until <= now() then
    return;
  end if;
  insert into public.entitlement_grants (subject_type, subject_id, key, value, source, source_id, starts_at, ends_at)
  select s.subject_type, s.subject_id, g.key, g.value,
         case when s.status = 'trialing' then 'trial' else 'plan' end::public.grant_source, s.id, now(), v_until
    from public.plans p cross join lateral jsonb_each(p.grants) g
   where p.id = s.plan_id;
end;
$$;
revoke all on function private.sync_plan_grants(uuid) from public;

-- ---------------------------------------------------------------------------
-- Over the limits after a downgrade or expiry (PRD 4b.6)
-- ---------------------------------------------------------------------------
create function private.apply_org_limits(p_org uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_seats integer := private.org_limit(p_org, 'org.seats');
  v_posts integer := private.org_limit(p_org, 'jobs.active_posts');
  v_members integer := 0;
  v_paused integer := 0;
  v_tokens integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('org-seats:' || p_org::text, 0));
  -- Seats: the members the admin chose, then admins, then the most recently active keep theirs; the rest
  -- become inactive (nothing deleted). Pending invites go first.
  if private.org_seat_count(p_org) > v_seats then
    update public.org_invites set revoked_at = now()
     where org_id = p_org and used_at is null and revoked_at is null and expires_at > now() and role <> 'billing';
    with ranked as (
      select m.user_id, row_number() over (order by m.seat_keep desc, (m.role = 'admin') desc, u.last_sign_in_at desc nulls last, m.created_at) as n
        from public.org_members m join auth.users u on u.id = m.user_id
       where m.org_id = p_org and m.status = 'active' and m.role <> 'billing')
    update public.org_members m set status = 'inactive'
      from ranked r where m.org_id = p_org and m.user_id = r.user_id and r.n > v_seats;
    get diagnostics v_members = row_count;
  end if;
  -- Live posts over the limit: the newest extras pause; the recruiter chooses which to reopen.
  with ranked as (
    select j.id, row_number() over (order by j.published_at nulls last, j.created_at) as n
      from public.job_posts j where j.org_id = p_org and j.status = 'live')
  update public.job_posts j set status = 'paused', paused_at = now()
    from ranked r where j.id = r.id and r.n > v_posts;
  get diagnostics v_paused = row_count;
  -- API tokens are revoked below Growth; webhooks stop.
  if not private.entitled('org', p_org, 'api.access') then
    update public.api_tokens set revoked_at = now() where org_id = p_org and revoked_at is null;
    get diagnostics v_tokens = row_count;
    update public.api_webhooks set active = false where org_id = p_org and active;
  end if;
  if v_members + v_paused + v_tokens > 0 then
    perform private.billing_notify('org', p_org, 'billing_limits_applied', p_org,
      jsonb_build_object('members', v_members, 'paused_posts', v_paused, 'tokens', v_tokens));
  end if;
  return jsonb_build_object('members', v_members, 'paused_posts', v_paused, 'tokens', v_tokens);
end;
$$;
revoke all on function private.apply_org_limits(uuid) from public;

create function private.expire_subscription(p_sub uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  update public.subscriptions
     set status = 'expired', ended_at = now(), ended_reason = p_reason, charge_pending = false, next_retry_at = null
   where id = p_sub and status in ('trialing', 'active', 'past_due')
  returning * into s;
  if s.id is null then
    return;
  end if;
  perform private.sync_plan_grants(s.id);
  if s.subject_type = 'org' then
    perform private.apply_org_limits(s.subject_id);
  end if;
  perform private.billing_notify(s.subject_type, s.subject_id,
    case when p_reason = 'trial_ended' then 'billing_trial_ended' else 'billing_subscription_ended' end, s.id,
    jsonb_build_object('plan', (select p.label from public.plans p where p.id = s.plan_id), 'reason', p_reason));
end;
$$;
revoke all on function private.expire_subscription(uuid, text) from public;

-- Starts the next period: the scheduled plan (a downgrade) takes over, counters reset with the new period.
create function private.roll_period(p_sub uuid, p_amount numeric default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_plan text;
  v_changed boolean;
begin
  select * into s from public.subscriptions where id = p_sub for update;
  v_plan := coalesce(s.next_plan_id, s.plan_id);
  v_changed := v_plan <> s.plan_id;
  update public.subscriptions
     set plan_id = v_plan, next_plan_id = null, status = 'active',
         current_period_start = s.current_period_end,
         current_period_end = greatest(s.current_period_end + private.plan_interval(v_plan), now() + interval '1 day'),
         grace_ends_at = null, retry_count = 0, next_retry_at = null, charge_pending = false, pending_charge = null,
         next_period_paid = false, simulate_fail_next = false,
         period_amount = coalesce(p_amount, s.period_amount),
         renewal_invoice_id = null
   where id = p_sub;
  perform private.sync_plan_grants(p_sub);
  if v_changed and s.subject_type = 'org' then
    perform private.apply_org_limits(s.subject_id);
  end if;
end;
$$;
revoke all on function private.roll_period(uuid, numeric) from public;

-- ---------------------------------------------------------------------------
-- Checkout (B2): amounts from plans and config only
-- ---------------------------------------------------------------------------
create function private.check_gateway(p_gateway text, p_currency text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_currency = 'PKR' and p_gateway in ('simulated', 'safepay', 'payfast'))
      or (p_currency = 'USD' and p_gateway in ('simulated', 'paddle'));
$$;
revoke all on function private.check_gateway(text, text) from public;

create function private.open_session(p_type public.billing_subject, p_id uuid, p_purpose text, p_plan text, p_change text,
                                     p_add_on uuid, p_invoice uuid, p_quote jsonb, p_gateway text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
  c public.checkout_sessions;
begin
  if p_key is null or char_length(p_key) not between 16 and 80 then
    raise exception 'invalid checkout key' using errcode = '22023';
  end if;
  select * into c from public.checkout_sessions where created_by = v_me and idempotency_key = p_key;
  if c.id is not null then
    -- The same click twice gets the same session back.
    return jsonb_build_object('session_id', c.id, 'amount', c.amount, 'currency', c.currency, 'gateway', c.gateway,
                              'live', c.live, 'status', c.status, 'quote', c.quote);
  end if;
  if not private.rate_limit('checkout:' || v_me::text, 30, interval '1 hour') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  if (p_quote ->> 'total')::numeric < 1 then
    raise exception 'nothing to pay' using errcode = '55000';
  end if;
  insert into public.checkout_sessions (subject_type, subject_id, created_by, purpose, plan_id, change, add_on_order_id, invoice_id,
                                        quote, amount, currency, gateway, live, idempotency_key, expires_at)
  values (p_type, p_id, v_me, p_purpose, p_plan, p_change, p_add_on, p_invoice, p_quote, (p_quote ->> 'total')::numeric,
          p_quote ->> 'currency', p_gateway, p_gateway <> 'simulated', p_key,
          now() + make_interval(mins => coalesce((private.lifecycle('checkout_minutes') #>> '{}')::integer, 60)))
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'amount', (p_quote ->> 'total')::numeric, 'currency', p_quote ->> 'currency',
                            'gateway', p_gateway, 'live', p_gateway <> 'simulated', 'status', 'open', 'quote', p_quote);
end;
$$;
revoke all on function private.open_session(public.billing_subject, uuid, text, text, text, uuid, uuid, jsonb, text, text) from public;

-- Buy or change to a self-serve plan. Upgrades take effect at payment with the unused part of the current
-- period credited; the same plan again is a prepaid renewal (wallets) or paying a failed renewal.
create function private.create_checkout(p_subject text, p_plan text, p_currency text, p_gateway text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_type public.billing_subject;
  v_id uuid;
  p public.plans;
  s public.subscriptions;
  v_change text := 'new';
  v_price numeric(12, 2);
  v_credit numeric(12, 2) := 0;
  v_lines jsonb;
begin
  v_id := private.billing_subject_of_caller(p_subject);
  v_type := p_subject::public.billing_subject;
  select * into p from public.plans where id = p_plan and active and self_serve;
  if p.id is null or p.audience <> v_type then
    raise exception 'that plan isn''t available here' using errcode = 'P0002';
  end if;
  if v_type = 'user' and not exists (select 1 from public.profiles pr where pr.user_id = v_id and pr.role = 'student') then
    raise exception 'Student Pro is for students' using errcode = '42501';
  end if;
  if v_type = 'org' and not exists (select 1 from public.organizations o where o.id = v_id and o.status = 'verified') then
    raise exception 'your organisation needs to be verified before it can buy a plan' using errcode = '42501';
  end if;
  if v_type = 'org' and p_currency = 'PKR' and private.subject_province(v_type, v_id) is null then
    raise exception 'add your organisation''s province first (it decides the sales tax on the invoice)' using errcode = '55000';
  end if;
  if p_currency is null or not private.check_gateway(p_gateway, p_currency) or (v_type <> 'org' and p_currency <> 'PKR') then
    raise exception 'that payment option isn''t available' using errcode = '22023';
  end if;
  v_price := case p_currency when 'USD' then p.price_usd else p.price_pkr end;
  if v_price is null then
    raise exception 'that plan has no % price', p_currency using errcode = '22023';
  end if;
  s := private.current_subscription(v_type, v_id);
  if s.id is not null and s.status <> 'trialing' then
    if s.plan_id = p.id then
      if s.status = 'past_due' or (s.payment_method in ('wallet', 'bank_transfer') and not s.next_period_paid
                                    and s.current_period_end < now() + interval '14 days') then
        v_change := 'renew_prepaid';
      else
        raise exception 'you''re already on this plan' using errcode = '23505';
      end if;
    elsif private.plan_rank(p.id) > private.plan_rank(s.plan_id) then
      v_change := 'upgrade';
      if s.currency = p_currency and s.period_amount > 0 then
        v_credit := round(s.period_amount * greatest(extract(epoch from s.current_period_end - now()), 0)
                          / extract(epoch from s.current_period_end - s.current_period_start), 2);
      end if;
    else
      raise exception 'downgrades take effect at renewal; choose it under "Change plan"' using errcode = '55000';
    end if;
  end if;
  v_lines := jsonb_build_array(jsonb_build_object('description', p.label || case p.interval when 'year' then ' (yearly)' else ' (monthly)' end,
                                                  'quantity', 1, 'unit_amount', v_price, 'amount', v_price));
  if v_credit > 0 then
    v_lines := v_lines || jsonb_build_object('description', 'Unused time on your current plan', 'quantity', 1,
                                             'unit_amount', -least(v_credit, v_price - 1), 'amount', -least(v_credit, v_price - 1));
  end if;
  return private.open_session(v_type, v_id, 'subscription', p.id, v_change, null, null,
                              private.billing_quote(v_type, v_id, v_lines, p_currency), p_gateway, p_key);
end;
$$;

-- Contact credits (5–100, valid 90 days) or a 14-day sponsored post, for organisation admins and billing members.
create function private.create_add_on_checkout(p_kind text, p_quantity integer, p_job uuid, p_currency text, p_gateway text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.billing_subject_of_caller('org');
  v_cfg jsonb := private.config('billing.add_ons') -> p_kind;
  v_unit numeric(12, 2);
  v_qty integer := coalesce(p_quantity, 1);
  v_order uuid;
  v_lines jsonb;
begin
  if v_cfg is null then
    raise exception 'unknown add-on' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_org and o.status = 'verified') then
    raise exception 'your organisation needs to be verified first' using errcode = '42501';
  end if;
  if p_currency is null or not private.check_gateway(p_gateway, p_currency) then
    raise exception 'that payment option isn''t available' using errcode = '22023';
  end if;
  if p_currency = 'PKR' and private.subject_province('org', v_org) is null then
    raise exception 'add your organisation''s province first (it decides the sales tax on the invoice)' using errcode = '55000';
  end if;
  v_unit := (v_cfg ->> case p_currency when 'USD' then 'usd' else 'pkr' end)::numeric;
  if p_kind = 'contact_credits' then
    if v_qty < (v_cfg ->> 'min')::integer or v_qty > (v_cfg ->> 'max')::integer then
      raise exception 'buy between % and % credits', v_cfg ->> 'min', v_cfg ->> 'max' using errcode = '22023';
    end if;
  else
    v_qty := 1;
    if not exists (select 1 from public.job_posts j where j.id = p_job and j.org_id = v_org and j.status = 'live') then
      raise exception 'only a live post of yours can be sponsored' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.job_posts j where j.id = p_job and j.sponsored_until > now()) then
      raise exception 'that post is already sponsored' using errcode = '23505';
    end if;
  end if;
  v_lines := jsonb_build_array(jsonb_build_object(
    'description', case p_kind when 'contact_credits' then 'Contact credits (valid ' || (v_cfg ->> 'days') || ' days)'
                               else 'Sponsored job post (' || (v_cfg ->> 'days') || ' days)' end,
    'quantity', v_qty, 'unit_amount', v_unit, 'amount', v_unit * v_qty));
  insert into public.add_on_orders (subject_type, subject_id, kind, quantity, job_id, amount, currency, live, created_by)
  values ('org', v_org, p_kind, v_qty, case when p_kind = 'sponsored_post' then p_job end, v_unit * v_qty, p_currency,
          p_gateway <> 'simulated', (select auth.uid()))
  returning id into v_order;
  return private.open_session('org', v_org, 'add_on', null, null, v_order, null,
                              private.billing_quote('org', v_org, v_lines, p_currency), p_gateway, p_key);
end;
$$;

-- Pay an issued invoice (a hiring fee or a licence) through the local gateway.
create function private.create_invoice_checkout(p_subject text, p_invoice uuid, p_gateway text, p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.billing_subject_of_caller(p_subject);
  i public.invoices;
begin
  select * into i from public.invoices
   where id = p_invoice and subject_type = p_subject::public.billing_subject and subject_id = v_id and kind = 'invoice';
  if i.id is null then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if i.status <> 'issued' then
    raise exception 'this invoice is already %', i.status using errcode = '55000';
  end if;
  if not private.check_gateway(p_gateway, i.currency) or (i.live and p_gateway = 'simulated') then
    raise exception 'that payment option isn''t available for this invoice' using errcode = '22023';
  end if;
  return private.open_session(i.subject_type, i.subject_id, 'invoice', null, null, null, i.id,
                              jsonb_build_object('lines', i.lines, 'subtotal', i.subtotal, 'tax_lines', i.tax_lines,
                                                 'tax_total', i.tax_total, 'total', i.total, 'currency', i.currency,
                                                 'draft_reasons', to_jsonb(i.draft_reasons), 'document', 'invoice'),
                              p_gateway, p_key);
end;
$$;

-- What the checkout and return pages show. Only the person who started it, or the subject's readers.
create function private.checkout_session(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  c public.checkout_sessions;
begin
  select * into c from public.checkout_sessions where id = p_id;
  if c.id is null or not (c.created_by = v_me or v_me in (select private.billing_readers(c.subject_type, c.subject_id))) then
    raise exception 'checkout not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', c.id, 'subject_type', c.subject_type, 'purpose', c.purpose, 'change', c.change, 'status',
    case when c.status = 'open' and c.expires_at <= now() then 'expired' else c.status end,
    'amount', c.amount, 'currency', c.currency, 'gateway', c.gateway, 'live', c.live, 'quote', c.quote,
    'failure_reason', c.failure_reason, 'expires_at', c.expires_at, 'completed_at', c.completed_at,
    'title', case c.purpose
               when 'subscription' then (select p.label || case p.interval when 'year' then ' · yearly' else ' · monthly' end
                                           from public.plans p where p.id = c.plan_id)
               when 'add_on' then (select case o.kind when 'contact_credits' then o.quantity || ' contact credits' else 'Sponsored job post' end
                                     from public.add_on_orders o where o.id = c.add_on_order_id)
               else (select 'Invoice ' || i.number from public.invoices i where i.id = c.invoice_id) end,
    'recurring_allowed', c.purpose = 'subscription',
    'return_to', case c.subject_type when 'user' then '/settings/billing' when 'org' then '/org/billing' else '/uni/billing' end);
end;
$$;

create function private.cancel_checkout(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.checkout_sessions set status = 'cancelled', completed_at = now()
   where id = p_id and created_by = (select auth.uid()) and status = 'open';
  update public.add_on_orders o set status = 'cancelled'
    from public.checkout_sessions c
   where c.id = p_id and o.id = c.add_on_order_id and o.status = 'pending' and c.status = 'cancelled';
end;
$$;

-- One 7-day Student Pro trial per student, no card (PRD 4b.5).
create function private.start_trial()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_days integer := coalesce((private.lifecycle('trial_days') #>> '{}')::integer, 7);
  v_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.user_id = v_me and p.role = 'student' and p.status = 'active') then
    raise exception 'the trial is for students' using errcode = '42501';
  end if;
  if private.entitled('user', v_me, 'student.plan') then
    raise exception 'you already have Student Pro' using errcode = '23505';
  end if;
  if (private.current_subscription('user', v_me)).id is not null then
    raise exception 'you already have a plan' using errcode = '23505';
  end if;
  insert into public.trial_claims (user_id) values (v_me) on conflict do nothing;
  if not found then
    raise exception 'you''ve already used your free trial' using errcode = '23505';
  end if;
  insert into public.subscriptions (subject_type, subject_id, plan_id, status, gateway, live, payment_method, current_period_start,
                                    current_period_end, trial_ends_at, created_by)
  values ('user', v_me, 'student_pro_monthly', 'trialing', 'none', false, 'none', now(), now() + make_interval(days => v_days),
          now() + make_interval(days => v_days), v_me)
  returning id into v_id;
  perform private.sync_plan_grants(v_id);
  perform private.billing_notify('user', v_me, 'billing_trial_started', v_id, jsonb_build_object('days', v_days));
  return v_id;
end;
$$;

-- Downgrades and interval changes apply at the next renewal (PRD 4b.5); "free" means cancel at period end.
create function private.schedule_plan_change(p_subject text, p_plan text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.billing_subject_of_caller(p_subject);
  s public.subscriptions := private.current_subscription(p_subject::public.billing_subject, v_id);
  p public.plans;
begin
  if s.id is null or s.status = 'trialing' then
    raise exception 'there''s no paid plan to change' using errcode = 'P0002';
  end if;
  if p_plan = 'free' then
    update public.subscriptions set cancel_at_period_end = true, next_plan_id = null where id = s.id;
    perform private.billing_notify(s.subject_type, s.subject_id, 'billing_plan_changed', s.id, jsonb_build_object('to', 'Free'));
    return;
  end if;
  select * into p from public.plans where id = p_plan and active and self_serve and audience = s.subject_type;
  if p.id is null then
    raise exception 'that plan isn''t available here' using errcode = 'P0002';
  end if;
  if p.id = s.plan_id then
    update public.subscriptions set next_plan_id = null, cancel_at_period_end = false where id = s.id;
    return;
  end if;
  if private.plan_rank(p.id) > private.plan_rank(s.plan_id) then
    raise exception 'upgrades are paid now at checkout' using errcode = '55000';
  end if;
  if (case s.currency when 'USD' then p.price_usd else p.price_pkr end) is null then
    raise exception 'that plan has no % price', s.currency using errcode = '22023';
  end if;
  update public.subscriptions set next_plan_id = p.id, cancel_at_period_end = false where id = s.id;
  perform private.billing_notify(s.subject_type, s.subject_id, 'billing_plan_changed', s.id, jsonb_build_object('to', p.label));
end;
$$;

create function private.cancel_subscription(p_subject text, p_resume boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.billing_subject_of_caller(p_subject);
  s public.subscriptions := private.current_subscription(p_subject::public.billing_subject, v_id);
begin
  if s.id is null or s.gateway in ('manual', 'comp') then
    raise exception 'there''s no plan you can cancel here' using errcode = 'P0002';
  end if;
  if s.status = 'trialing' then
    if p_resume then
      return;
    end if;
    perform private.expire_subscription(s.id, 'cancelled');
    return;
  end if;
  update public.subscriptions set cancel_at_period_end = not p_resume, next_plan_id = case when p_resume then next_plan_id end
   where id = s.id;
end;
$$;

-- Before a seat downgrade the admin chooses who keeps a seat (PRD 4b.6).
create function private.choose_seats(p_keep uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org(array['admin']::public.org_role[], false);
begin
  if exists (select 1 from unnest(coalesce(p_keep, '{}')) k
              where not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = k and m.role <> 'billing')) then
    raise exception 'choose people on your team' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_keep, '{}')) > 0 and not exists (
       select 1 from public.org_members m where m.org_id = v_org and m.role = 'admin' and m.user_id = any (p_keep)) then
    raise exception 'keep at least one admin' using errcode = '22023';
  end if;
  update public.org_members set seat_keep = (user_id = any (coalesce(p_keep, '{}'))) where org_id = v_org;
end;
$$;

-- A paused post comes back when there is a free live slot.
create function private.reopen_paused_job(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
begin
  perform pg_advisory_xact_lock(hashtextextended('job-slots:' || v_org::text, 0));
  if (select count(*) from public.job_posts where org_id = v_org and status = 'live') >= private.org_limit(v_org, 'jobs.active_posts') then
    raise exception 'your plan''s live posts are all in use; close one or upgrade' using errcode = 'PT402';
  end if;
  update public.job_posts set status = 'live', paused_at = null where id = p_id and org_id = v_org and status = 'paused';
  if not found then
    raise exception 'that post isn''t paused' using errcode = 'P0002';
  end if;
end;
$$;

-- Province and invoice details for organisations (admin or billing) and universities (owner).
create function private.save_billing_details(p_subject text, p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.billing_subject_of_caller(p_subject);
  v_province text := nullif(btrim(coalesce(p ->> 'province', '')), '');
  v_ntn text := nullif(btrim(coalesce(p ->> 'ntn', '')), '');
  v_address text := nullif(btrim(coalesce(p ->> 'address', '')), '');
begin
  if v_province is not null and v_province not in ('Punjab', 'Sindh', 'KP', 'Balochistan', 'ICT', 'AJK', 'GB') then
    raise exception 'choose a province' using errcode = '22023';
  end if;
  if p_subject = 'org' then
    update public.organizations set province = coalesce(v_province, province), billing_ntn = v_ntn, billing_address = v_address where id = v_id;
  elsif p_subject = 'university' then
    update public.universities set billing_ntn = v_ntn, billing_address = v_address where id = v_id;
  else
    raise exception 'students have no invoice details' using errcode = '22023';
  end if;
end;
$$;

create function private.request_licence(p_level text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.university_admins := private.require_uni(array['owner']::public.uni_admin_role[]);
begin
  if p_level not in ('basic', 'growth', 'campus') then
    raise exception 'choose Basic, Growth or Campus' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'keep the note under 1,000 characters' using errcode = '22023';
  end if;
  if not private.rate_limit('licence_request:' || a.university_id::text, 3, interval '1 day') then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  insert into public.billing_tasks (kind, subject_type, subject_id, ref_id, detail)
  values ('licence_request', 'university', a.university_id, gen_random_uuid(),
          jsonb_build_object('level', p_level, 'note', nullif(btrim(coalesce(p_note, '')), ''), 'by', a.user_id));
end;
$$;

create function private.dispute_hire_fee(p_id uuid, p_kind text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.billing_subject_of_caller('org');
  f public.hire_fees;
begin
  select * into f from public.hire_fees where id = p_id and org_id = v_org for update;
  if f.id is null then
    raise exception 'fee not found' using errcode = 'P0002';
  end if;
  if f.status not in ('invoiced', 'pending') then
    raise exception 'this fee can''t be disputed now' using errcode = '55000';
  end if;
  if f.created_at < now() - make_interval(days => coalesce((private.lifecycle('hire_fee_dispute_days') #>> '{}')::integer, 14)) then
    raise exception 'disputes are open for 14 days after the hire' using errcode = '55000';
  end if;
  if p_kind not in ('candidate_withdrew', 'marked_in_error') or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'say what happened (10 to 1,000 characters)' using errcode = '22023';
  end if;
  update public.hire_fees set status = 'disputed', dispute_kind = p_kind, dispute_reason = btrim(p_reason), disputed_at = now()
   where id = f.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hiring fees (B3): a recorded hire invoices the fee unless the plan waives it
-- ---------------------------------------------------------------------------
create function private.on_hire_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric(12, 2) := (private.config('billing.hire_fees') ->> new.kind)::numeric;
  v_live boolean := private.billing_live_mode();
  v_due timestamptz := now() + make_interval(days => coalesce((private.lifecycle('hire_fee_due_days') #>> '{}')::integer, 30));
  v_invoice uuid;
  v_fee uuid;
begin
  if private.entitled('org', new.org_id, 'hire_fee.waived') or coalesce(v_amount, 0) <= 0 then
    insert into public.hire_fees (hire_id, org_id, kind, amount, status, resolution_reason)
    values (new.id, new.org_id, new.kind, coalesce(v_amount, 0), 'waived', 'waived by the plan');
    update public.hires set fee_status = 'waived' where id = new.id;
    return new;
  end if;
  v_invoice := private.issue_invoice('org', new.org_id, 'invoice', 'hire_fee',
    private.billing_quote('org', new.org_id, jsonb_build_array(jsonb_build_object(
      'description', 'Hiring fee: ' || case new.kind when 'intern' then 'internship' else 'full-time' end || ' hire on '
                     || to_char(new.hired_at at time zone 'Asia/Karachi', 'DD Mon YYYY'),
      'quantity', 1, 'unit_amount', v_amount, 'amount', v_amount)), 'PKR'),
    v_live, 'issued', v_due);
  insert into public.hire_fees (hire_id, org_id, kind, amount, status, invoice_id, due_at)
  values (new.id, new.org_id, new.kind, v_amount, 'invoiced', v_invoice, v_due)
  returning id into v_fee;
  update public.hires set fee_status = 'invoiced' where id = new.id;
  perform private.billing_notify('org', new.org_id, 'billing_hire_fee', v_invoice,
    jsonb_build_object('amount', v_amount, 'kind', new.kind, 'due', to_char(v_due at time zone 'Asia/Karachi', 'DD Mon YYYY')));
  return new;
end;
$$;
revoke all on function private.on_hire_recorded() from public;
create trigger hires_fee after insert on public.hires
  for each row execute function private.on_hire_recorded();

-- Hires recorded before billing existed are waived (decisions.md 2026-10-05).
insert into public.hire_fees (hire_id, org_id, kind, amount, status, resolution_reason)
select h.id, h.org_id, h.kind, 0, 'waived', 'recorded before billing launched'
  from public.hires h where h.fee_status = 'unbilled';
update public.hires set fee_status = 'waived' where fee_status = 'unbilled';

-- An organisation with a hiring-fee invoice unpaid after its due date can't send new contact requests.
create or replace function private.consume_quota(p_org uuid, p_key text, p_amount integer default 1)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key = 'contact.credits' and exists (select 1 from public.hire_fees f where f.org_id = p_org and f.status = 'invoiced' and f.due_at < now()) then
    raise exception 'pay the overdue hiring-fee invoice before sending new contact requests' using errcode = 'PT402';
  end if;
  perform private.consume_quota('org'::public.billing_subject, p_org, p_key, p_amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhook events: stored once, applied once (B2)
-- ---------------------------------------------------------------------------
-- Called by the webhook route (service role) after the adapter verified the signature and the timestamp,
-- and by the billing worker with the outcome of a charge or refund it made.
create function private.record_billing_event(p_gateway text, p_event_id text, p_type text, p_payload jsonb, p_event jsonb, p_live boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.billing_webhook_events (gateway, event_id, type, payload, event, live)
  values (p_gateway, p_event_id, p_type, coalesce(p_payload, '{}'::jsonb), coalesce(p_event, '{}'::jsonb), coalesce(p_live, false))
  on conflict (gateway, event_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('duplicate', true);
  end if;
  perform pgmq.send('billing_events', jsonb_build_object('id', v_id));
  return jsonb_build_object('duplicate', false, 'id', v_id);
end;
$$;
revoke all on function private.record_billing_event(text, text, text, jsonb, jsonb, boolean) from public;

create function public.record_billing_event(p_gateway text, p_event_id text, p_type text, p_payload jsonb, p_event jsonb, p_live boolean)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_billing_event(p_gateway, p_event_id, p_type, p_payload, p_event, p_live);
$$;
revoke all on function public.record_billing_event(text, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function private.record_billing_event(text, text, text, jsonb, jsonb, boolean) to service_role;
grant execute on function public.record_billing_event(text, text, text, jsonb, jsonb, boolean) to service_role;

-- Records a succeeded payment once and returns its id (null when this gateway payment id is known).
create function private.insert_payment(p_type public.billing_subject, p_id uuid, p_kind text, p_amount numeric, p_currency text,
                                       p_gateway text, p_payment_id text, p_method text, p_live boolean, p_sub uuid, p_session uuid,
                                       p_mor_ref text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.payments (subject_type, subject_id, kind, amount, currency, gateway, gateway_payment_id, method, live,
                               subscription_id, checkout_session_id, mor_invoice_ref)
  values (p_type, p_id, p_kind, p_amount, p_currency, p_gateway, p_payment_id, p_method, p_live, p_sub, p_session, p_mor_ref)
  on conflict (gateway, gateway_payment_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.insert_payment(public.billing_subject, uuid, text, numeric, text, text, text, text, boolean, uuid, uuid, text) from public;

-- A receipt or invoice for a payment just taken (PKR only: USD carries the merchant of record's invoice).
create function private.document_for_payment(p_payment uuid, p_quote jsonb, p_purpose text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  v_invoice uuid;
begin
  select * into pay from public.payments where id = p_payment;
  if pay.currency <> 'PKR' then
    return null;
  end if;
  v_invoice := private.issue_invoice(pay.subject_type, pay.subject_id, coalesce(p_quote ->> 'document', 'invoice'), p_purpose,
                                     p_quote, pay.live, 'paid', null, pay.id);
  update public.payments set invoice_id = v_invoice where id = pay.id;
  return v_invoice;
end;
$$;
revoke all on function private.document_for_payment(uuid, jsonb, text) from public;

create function private.apply_subscription_payment(c public.checkout_sessions, e jsonb, p_gateway text, p_payment uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := private.current_subscription(c.subject_type, c.subject_id);
  v_sub uuid;
  v_method text := case when e ->> 'method' = 'card' and coalesce(e ->> 'saved_method_ref', '') <> '' then 'card' else 'wallet' end;
  v_amount numeric(12, 2) := (c.quote ->> 'subtotal')::numeric;
  v_full numeric(12, 2) := (select (l ->> 'amount')::numeric from jsonb_array_elements(c.quote -> 'lines') l limit 1);
begin
  if s.id is not null and s.status <> 'trialing' and s.plan_id = c.plan_id then
    -- Paying the same plan again: a prepaid next period, or settling a failed renewal now.
    if s.status = 'past_due' then
      perform private.roll_period(s.id, v_amount);
    else
      update public.subscriptions set next_period_paid = true where id = s.id;
    end if;
    v_sub := s.id;
  elsif s.id is not null and s.status <> 'trialing' then
    -- An upgrade: the old plan ends now (its unused time was credited in the quote).
    update public.subscriptions set status = 'cancelled', ended_at = now(), ended_reason = 'upgraded', charge_pending = false
     where id = s.id;
    perform private.sync_plan_grants(s.id);
    s.id := null;
  end if;
  if v_sub is null and s.id is not null and s.status = 'trialing' then
    -- A trial converts in place.
    update public.subscriptions
       set plan_id = c.plan_id, status = 'active', gateway = p_gateway, live = c.live, payment_method = v_method, currency = c.currency,
           period_amount = v_full, saved_method_ref = nullif(e ->> 'saved_method_ref', ''),
           gateway_customer_ref = nullif(e ->> 'customer_ref', ''), gateway_subscription_ref = nullif(e ->> 'subscription_ref', ''),
           current_period_start = now(), current_period_end = now() + private.plan_interval(c.plan_id)
     where id = s.id;
    v_sub := s.id;
  elsif v_sub is null then
    insert into public.subscriptions (subject_type, subject_id, plan_id, status, gateway, live, payment_method, currency, period_amount,
                                      saved_method_ref, gateway_customer_ref, gateway_subscription_ref, current_period_start,
                                      current_period_end, created_by)
    values (c.subject_type, c.subject_id, c.plan_id, 'active', p_gateway, c.live, v_method, c.currency, v_full,
            nullif(e ->> 'saved_method_ref', ''), nullif(e ->> 'customer_ref', ''), nullif(e ->> 'subscription_ref', ''),
            now(), now() + private.plan_interval(c.plan_id), c.created_by)
    returning id into v_sub;
  end if;
  update public.payments set subscription_id = v_sub where id = p_payment;
  perform private.sync_plan_grants(v_sub);
  return v_sub;
end;
$$;
revoke all on function private.apply_subscription_payment(public.checkout_sessions, jsonb, text, uuid) from public;

create function private.fulfil_add_on(p_order uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.add_on_orders;
  v_cfg jsonb;
  v_grant uuid;
begin
  select * into o from public.add_on_orders where id = p_order for update;
  if o.status <> 'pending' then
    return;
  end if;
  v_cfg := private.config('billing.add_ons') -> o.kind;
  if o.kind = 'contact_credits' then
    insert into public.entitlement_grants (subject_type, subject_id, key, value, source, source_id, ends_at)
    values ('org', o.subject_id, 'contact.credits', to_jsonb(o.quantity), 'add_on', o.id,
            now() + make_interval(days => (v_cfg ->> 'days')::integer))
    returning id into v_grant;
  else
    -- Labelled "Sponsored" in the feed and job list, never ranked above organic results in talent search.
    update public.job_posts set sponsored_until = greatest(coalesce(sponsored_until, now()), now()) + make_interval(days => (v_cfg ->> 'days')::integer)
     where id = o.job_id;
  end if;
  update public.add_on_orders set status = 'fulfilled', fulfilled_at = now(), grant_id = v_grant where id = o.id;
end;
$$;
revoke all on function private.fulfil_add_on(uuid) from public;

-- Applies one stored event. Idempotent: an event is applied at most once, and a payment id at most once.
create function private.billing_apply_event(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ev public.billing_webhook_events;
  e jsonb;
  c public.checkout_sessions;
  s public.subscriptions;
  pay public.payments;
  v_payment uuid;
  v_sub uuid;
  v_doc uuid;
  v_outcome text := 'ignored';
  v_amount numeric(12, 2);
  v_gateway text;
  v_quote jsonb;
  v_retry jsonb;
begin
  select * into ev from public.billing_webhook_events where id = p_id for update;
  if ev.id is null then
    return 'missing';
  end if;
  if ev.processed_at is not null then
    return 'duplicate';
  end if;
  e := ev.event;
  v_gateway := coalesce(e ->> 'gateway', ev.gateway);
  v_amount := (e ->> 'amount')::numeric;

  if e ->> 'session_id' is not null then
    select * into c from public.checkout_sessions where id = (e ->> 'session_id')::uuid for update;
    if c.id is null then
      raise exception 'event % names an unknown checkout session', ev.event_id;
    end if;
    if c.gateway <> v_gateway or c.live <> ev.live then
      -- Not retryable: kept for staff, never applied.
      update public.billing_webhook_events set processed_at = now(), outcome = 'session_mismatch',
             error = 'the event''s gateway or mode does not match its checkout session' where id = ev.id;
      return 'session_mismatch';
    end if;
  end if;
  if e ->> 'subscription_id' is not null then
    select * into s from public.subscriptions where id = (e ->> 'subscription_id')::uuid for update;
  end if;

  if ev.type = 'payment.succeeded' and c.id is not null then
    if v_amount is distinct from c.amount or e ->> 'currency' is distinct from c.currency then
      insert into public.billing_tasks (kind, subject_type, subject_id, ref_id, detail)
      values ('amount_mismatch', c.subject_type, c.subject_id, c.id, jsonb_build_object('event', ev.event_id, 'paid', v_amount, 'expected', c.amount))
      on conflict do nothing;
      update public.billing_webhook_events set processed_at = now(), outcome = 'amount_mismatch',
             error = format('paid %s %s for a session of %s %s', v_amount, e ->> 'currency', c.amount, c.currency) where id = ev.id;
      return 'amount_mismatch';
    end if;
    v_payment := private.insert_payment(c.subject_type, c.subject_id,
                   case c.purpose when 'subscription' then 'subscription' when 'add_on' then 'add_on'
                                  else (select case i.purpose when 'hire_fee' then 'hire_fee' when 'licence' then 'licence' else 'invoice' end
                                          from public.invoices i where i.id = c.invoice_id) end,
                   v_amount, c.currency, v_gateway, e ->> 'payment_id',
                   case when e ->> 'method' in ('card', 'wallet', 'bank_transfer') then e ->> 'method' else 'card' end,
                   c.live, null, c.id, nullif(e ->> 'mor_invoice_ref', ''));
    if v_payment is null then
      v_outcome := 'payment_already_recorded';
    else
      update public.checkout_sessions set status = 'paid', completed_at = now() where id = c.id;
      if c.purpose = 'subscription' then
        v_sub := private.apply_subscription_payment(c, e, v_gateway, v_payment);
        update public.checkout_sessions set subscription_id = v_sub where id = c.id;
        v_doc := private.document_for_payment(v_payment, c.quote, 'subscription');
      elsif c.purpose = 'add_on' then
        perform private.fulfil_add_on(c.add_on_order_id);
        v_doc := private.document_for_payment(v_payment, c.quote, 'add_on');
      else
        if (select i.live from public.invoices i where i.id = c.invoice_id) <> c.live then
          raise exception 'a test payment can''t settle a live invoice';
        end if;
        update public.invoices set status = 'paid', paid_at = now() where id = c.invoice_id and status = 'issued';
        update public.payments set invoice_id = c.invoice_id where id = v_payment;
        update public.hire_fees set status = 'paid', resolved_at = now() where invoice_id = c.invoice_id and status in ('invoiced', 'pending');
        v_doc := c.invoice_id;
      end if;
      perform private.billing_notify(c.subject_type, c.subject_id, 'billing_payment_succeeded', coalesce(v_doc, v_payment),
        jsonb_build_object('amount', v_amount, 'currency', c.currency, 'title', private.checkout_session_title(c.id), 'live', c.live));
      v_outcome := 'paid';
    end if;

  elsif ev.type = 'payment.succeeded' and s.id is not null then
    -- A renewal the worker charged on a saved card.
    v_quote := coalesce(s.pending_charge, '{}'::jsonb);
    v_payment := private.insert_payment(s.subject_type, s.subject_id, 'subscription', v_amount, coalesce(e ->> 'currency', s.currency),
                                        v_gateway, e ->> 'payment_id', 'card', s.live, s.id, null, nullif(e ->> 'mor_invoice_ref', ''));
    if v_payment is null then
      v_outcome := 'payment_already_recorded';
    elsif s.status in ('active', 'past_due') then
      perform private.roll_period(s.id, coalesce((v_quote ->> 'subtotal')::numeric, v_amount));
      if v_quote ? 'lines' then
        perform private.document_for_payment(v_payment, v_quote, 'subscription');
      end if;
      perform private.billing_notify(s.subject_type, s.subject_id, 'billing_payment_succeeded', v_payment,
        jsonb_build_object('amount', v_amount, 'currency', s.currency, 'title', (select p.label from public.plans p where p.id = coalesce(s.next_plan_id, s.plan_id)) || ' renewal',
                           'live', s.live));
      v_outcome := 'renewed';
    else
      v_outcome := 'renewal_after_end';
    end if;

  elsif ev.type = 'payment.failed' and c.id is not null then
    update public.checkout_sessions set status = 'failed', failure_reason = left(coalesce(e ->> 'reason', 'declined'), 200), completed_at = now()
     where id = c.id and status = 'open';
    update public.add_on_orders set status = 'cancelled' where id = c.add_on_order_id and status = 'pending';
    perform private.billing_notify(c.subject_type, c.subject_id, 'billing_payment_failed', c.id,
      jsonb_build_object('title', private.checkout_session_title(c.id), 'reason', coalesce(e ->> 'reason', 'declined'), 'renewal', false));
    v_outcome := 'checkout_failed';

  elsif ev.type = 'payment.failed' and s.id is not null then
    if s.status in ('active', 'past_due') then
      v_retry := private.lifecycle('retry_days');
      update public.subscriptions
         set status = 'past_due', charge_pending = false,
             grace_ends_at = coalesce(grace_ends_at, current_period_end + make_interval(days => coalesce((private.lifecycle('grace_days') #>> '{}')::integer, 7))),
             retry_count = retry_count + 1,
             next_retry_at = case when retry_count + 1 <= jsonb_array_length(v_retry)
                                  then current_period_end + make_interval(days => (v_retry ->> retry_count)::integer) end
       where id = s.id;
      perform private.sync_plan_grants(s.id);
      perform private.billing_notify(s.subject_type, s.subject_id, 'billing_payment_failed', s.id,
        jsonb_build_object('title', (select p.label from public.plans p where p.id = s.plan_id) || ' renewal',
                           'reason', coalesce(e ->> 'reason', 'declined'), 'renewal', true));
      v_outcome := 'past_due';
    end if;

  elsif ev.type = 'payment.refunded' then
    select * into pay from public.payments where gateway = v_gateway and gateway_payment_id = e ->> 'payment_id' for update;
    if pay.id is null then
      raise exception 'refund % names an unknown payment', ev.event_id;
    end if;
    v_amount := least(coalesce(v_amount, pay.amount), pay.amount - pay.refunded_amount);
    if v_amount > 0 then
      update public.payments set refunded_amount = refunded_amount + v_amount,
                                 status = case when refunded_amount + v_amount >= amount then 'refunded' else 'partially_refunded' end
       where id = pay.id;
      if pay.currency = 'PKR' and pay.invoice_id is not null then
        perform private.issue_invoice(pay.subject_type, pay.subject_id, 'credit_note', 'refund',
          jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('description', 'Refund of ' || (select i.number from public.invoices i where i.id = pay.invoice_id),
                                                                           'quantity', 1, 'unit_amount', -v_amount, 'amount', -v_amount)),
                             'subtotal', -v_amount, 'tax_lines', '[]'::jsonb, 'tax_total', 0, 'total', -v_amount, 'currency', pay.currency,
                             'draft_reasons', '[]'::jsonb),
          pay.live, 'issued', null, pay.id, null, pay.invoice_id);
      end if;
      -- A full refund ends what the payment bought.
      if pay.refunded_amount + v_amount >= pay.amount then
        if pay.subscription_id is not null then
          perform private.expire_subscription(pay.subscription_id, 'refunded');
        end if;
        update public.entitlement_grants g set revoked_at = now(), revoked_reason = 'refunded'
          from public.add_on_orders o, public.checkout_sessions cs
         where cs.id = pay.checkout_session_id and o.id = cs.add_on_order_id and g.id = o.grant_id and g.revoked_at is null;
        update public.job_posts j set sponsored_until = null
          from public.add_on_orders o, public.checkout_sessions cs
         where cs.id = pay.checkout_session_id and o.id = cs.add_on_order_id and o.kind = 'sponsored_post' and j.id = o.job_id;
        update public.add_on_orders o set status = 'refunded'
          from public.checkout_sessions cs where cs.id = pay.checkout_session_id and o.id = cs.add_on_order_id;
      end if;
      perform private.billing_notify(pay.subject_type, pay.subject_id, 'billing_refund', pay.id,
        jsonb_build_object('amount', v_amount, 'currency', pay.currency));
      v_outcome := 'refunded';
    else
      v_outcome := 'nothing_to_refund';
    end if;

  elsif ev.type = 'checkout.cancelled' and c.id is not null then
    update public.checkout_sessions set status = 'cancelled', completed_at = now() where id = c.id and status = 'open';
    update public.add_on_orders set status = 'cancelled' where id = c.add_on_order_id and status = 'pending';
    v_outcome := 'checkout_cancelled';
  end if;

  update public.billing_webhook_events set processed_at = now(), outcome = v_outcome, error = null where id = ev.id;
  return v_outcome;
end;
$$;
revoke all on function private.billing_apply_event(bigint) from public;

create function private.checkout_session_title(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case c.purpose
           when 'subscription' then (select p.label from public.plans p where p.id = c.plan_id)
           when 'add_on' then (select case o.kind when 'contact_credits' then o.quantity || ' contact credits' else 'Sponsored job post' end
                                 from public.add_on_orders o where o.id = c.add_on_order_id)
           else (select 'Invoice ' || i.number from public.invoices i where i.id = c.invoice_id) end
    from public.checkout_sessions c where c.id = p_id;
$$;
revoke all on function private.checkout_session_title(uuid) from public;

-- Drains the event queue (pg_cron every 10 s; tests call it directly). Each event runs in its own
-- sub-transaction: a failure is recorded on the event and retried, up to five attempts.
create function private.billing_process_events(p_max integer default 50)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m record;
  v_id bigint;
  v_done integer := 0;
begin
  for m in select * from pgmq.read('billing_events', 30, p_max) loop
    v_id := (m.message ->> 'id')::bigint;
    begin
      perform private.billing_apply_event(v_id);
      perform pgmq.delete('billing_events', m.msg_id);
      v_done := v_done + 1;
    exception when others then
      update public.billing_webhook_events set attempts = attempts + 1, error = left(sqlerrm, 500) where id = v_id;
      if m.read_ct >= 5 then
        perform pgmq.archive('billing_events', m.msg_id);
      end if;
    end;
  end loop;
  return v_done;
end;
$$;
revoke all on function private.billing_process_events(integer) from public;
grant execute on function private.billing_process_events(integer), private.billing_apply_event(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Time moves subscriptions on (billing-tick, every 5 minutes)
-- ---------------------------------------------------------------------------
-- What a renewal of this subscription charges: the next plan's price in its currency, tax for organisations.
create function private.renewal_quote(p_sub uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  p public.plans;
  v_price numeric(12, 2);
begin
  select * into s from public.subscriptions where id = p_sub;
  select * into p from public.plans where id = coalesce(s.next_plan_id, s.plan_id);
  v_price := case s.currency when 'USD' then p.price_usd else p.price_pkr end;
  if v_price is null then
    return null;
  end if;
  return private.billing_quote(s.subject_type, s.subject_id,
    jsonb_build_array(jsonb_build_object('description', p.label || case p.interval when 'year' then ' (yearly)' else ' (monthly)' end || ' renewal',
                                         'quantity', 1, 'unit_amount', v_price, 'amount', v_price)), s.currency);
end;
$$;
revoke all on function private.renewal_quote(uuid) from public;

create function private.queue_charge(p_sub uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_quote jsonb := private.renewal_quote(p_sub);
begin
  select * into s from public.subscriptions where id = p_sub for update;
  if v_quote is null then
    perform private.expire_subscription(p_sub, 'no_price');
    return;
  end if;
  update public.subscriptions set charge_pending = true, pending_charge = v_quote where id = p_sub;
  perform pgmq.send('billing_jobs', jsonb_build_object(
    'kind', 'charge', 'subscription_id', s.id, 'gateway', s.gateway, 'live', s.live,
    'saved_method_ref', s.saved_method_ref, 'customer_ref', s.gateway_customer_ref, 'subscription_ref', s.gateway_subscription_ref,
    'amount', (v_quote ->> 'total')::numeric, 'currency', s.currency,
    'idempotency_key', 'renew:' || s.id::text || ':' || extract(epoch from s.current_period_end)::bigint::text || ':' || s.retry_count::text,
    'simulate_fail', s.simulate_fail_next));
end;
$$;
revoke all on function private.queue_charge(uuid) from public;

create function private.billing_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_out jsonb := '{}'::jsonb;
  v_n integer := 0;
  v_days integer;
  v_grace integer := coalesce((private.lifecycle('licence_grace_days') #>> '{}')::integer, 14);
begin
  -- Trials that ran out.
  for r in select id from public.subscriptions where status = 'trialing' and trial_ends_at <= now() for update skip locked loop
    perform private.expire_subscription(r.id, 'trial_ended');
    v_n := v_n + 1;
  end loop;
  v_out := v_out || jsonb_build_object('trials_ended', v_n);

  -- Periods that ended.
  v_n := 0;
  for r in
    select * from public.subscriptions
     where status = 'active' and current_period_end <= now() and not charge_pending
     for update skip locked
  loop
    if r.cancel_at_period_end then
      perform private.expire_subscription(r.id, 'cancelled');
    elsif r.next_period_paid then
      perform private.roll_period(r.id);
    elsif r.gateway = 'manual' and r.renewal_invoice_id is not null then
      perform private.roll_period(r.id, (select i.subtotal from public.invoices i where i.id = r.renewal_invoice_id));
    elsif r.payment_method = 'card' and r.saved_method_ref is not null then
      perform private.queue_charge(r.id);
    else
      perform private.expire_subscription(r.id, case when r.gateway = 'manual' then 'licence_ended' else 'period_ended' end);
    end if;
    v_n := v_n + 1;
  end loop;
  v_out := v_out || jsonb_build_object('periods_ended', v_n);

  -- Failed renewals: retries on days 1, 3 and 6, then expiry after the grace period.
  v_n := 0;
  for r in select id, grace_ends_at, next_retry_at from public.subscriptions
            where status = 'past_due' and not charge_pending for update skip locked loop
    if r.grace_ends_at <= now() then
      perform private.expire_subscription(r.id, 'payment_failed');
      v_n := v_n + 1;
    elsif r.next_retry_at is not null and r.next_retry_at <= now() then
      perform private.queue_charge(r.id);
      v_n := v_n + 1;
    end if;
  end loop;
  v_out := v_out || jsonb_build_object('past_due', v_n);

  -- Licences whose invoice is unpaid after its terms and the grace period.
  v_n := 0;
  for r in
    select s.id from public.subscriptions s
     where s.gateway = 'manual' and s.status = 'active'
       and exists (select 1 from public.invoices i
                    where i.subject_type = s.subject_type and i.subject_id = s.subject_id and i.purpose = 'licence'
                      and i.status = 'issued' and i.due_at + make_interval(days => v_grace) <= now())
     for update skip locked
  loop
    perform private.expire_subscription(r.id, 'unpaid');
    v_n := v_n + 1;
  end loop;
  v_out := v_out || jsonb_build_object('licences_unpaid', v_n);

  -- Prepaid periods (wallets, bank transfer) can't renew themselves: reminders 7, 3 and 1 days before.
  v_n := 0;
  for r in
    select s.id, s.subject_type, s.subject_id, s.current_period_end, s.plan_id, d.days
      from public.subscriptions s
      cross join lateral (select (x #>> '{}')::integer as days from jsonb_array_elements(private.lifecycle('reminder_days')) x) d
     where s.status = 'active' and s.payment_method in ('wallet', 'bank_transfer') and not s.next_period_paid and not s.cancel_at_period_end
       and s.renewal_invoice_id is null
       and s.current_period_end > now() and s.current_period_end <= now() + make_interval(days => d.days)
  loop
    insert into public.billing_reminders (subscription_id, period_end, kind) values (r.id, r.current_period_end, 'renew_' || r.days)
    on conflict do nothing;
    if found then
      perform private.billing_notify(r.subject_type, r.subject_id, 'billing_renewal_reminder', r.id,
        jsonb_build_object('days', r.days, 'plan', (select p.label from public.plans p where p.id = r.plan_id),
                           'ends', to_char(r.current_period_end at time zone 'Asia/Karachi', 'DD Mon YYYY')));
      v_n := v_n + 1;
    end if;
  end loop;
  v_out := v_out || jsonb_build_object('reminders', v_n);

  -- Abandoned checkouts.
  update public.add_on_orders o set status = 'cancelled'
    from public.checkout_sessions c
   where c.add_on_order_id = o.id and c.status = 'open' and c.expires_at <= now() and o.status = 'pending';
  update public.checkout_sessions set status = 'expired', completed_at = now() where status = 'open' and expires_at <= now();

  -- Hiring fees past due: one notice; new contact requests are refused until paid (consume_quota).
  for r in update public.hire_fees set overdue_notified_at = now()
            where status = 'invoiced' and due_at < now() and overdue_notified_at is null
            returning org_id, invoice_id, amount loop
    perform private.billing_notify('org', r.org_id, 'billing_hire_fee_overdue', r.invoice_id, jsonb_build_object('amount', r.amount));
  end loop;

  -- Applications sitting at "offer" for 45 days: a staff follow-up for an unreported hire.
  v_days := coalesce((private.lifecycle('offer_follow_up_days') #>> '{}')::integer, 45);
  insert into public.billing_tasks (kind, subject_type, subject_id, ref_id, detail)
  select 'offer_follow_up', 'org', j.org_id, a.id, jsonb_build_object('job', j.title, 'since', a.stage_changed_at)
    from public.job_applications a join public.job_posts j on j.id = a.job_id
   where a.stage = 'offer' and a.stage_changed_at <= now() - make_interval(days => v_days)
  on conflict do nothing;

  return v_out;
end;
$$;
revoke all on function private.billing_tick() from public;
grant execute on function private.billing_tick() to service_role;

create function private.billing_tick_job()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run uuid := public.job_run_start('billing-tick');
  v_out jsonb;
begin
  begin
    v_out := private.billing_tick();
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded',
    (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(v_out)));
end;
$$;
revoke all on function private.billing_tick_job() from public;

-- Wakes the billing worker Edge Function when a gateway call is waiting (renewal charges, refunds).
create function private.wake_billing_worker()
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
  if not exists (select 1 from pgmq.q_billing_jobs where vt <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'billing_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/billing-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function private.wake_billing_worker() from public;

-- The worker reads its jobs through these (it connects as the database owner, like the other workers).
create function private.billing_jobs_read(p_max integer default 10)
returns table (msg_id bigint, read_ct integer, job jsonb)
language sql
volatile
security definer
set search_path = ''
as $$
  select m.msg_id, m.read_ct, m.message from pgmq.read('billing_jobs', 120, p_max) m;
$$;
revoke all on function private.billing_jobs_read(integer) from public;

create function private.billing_job_done(p_msg bigint)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select pgmq.delete('billing_jobs', p_msg);
$$;
revoke all on function private.billing_job_done(bigint) from public;

-- A charge the worker couldn't even attempt (adapter missing, network) goes back to the queue; after five
-- tries the subscription is treated as a failed renewal.
create function private.billing_job_failed(p_msg bigint, p_read integer, p_job jsonb, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_read >= 5 then
    perform pgmq.archive('billing_jobs', p_msg);
    if p_job ->> 'kind' = 'charge' then
      perform private.record_billing_event('worker', 'charge-error:' || (p_job ->> 'idempotency_key'), 'payment.failed',
        jsonb_build_object('error', left(p_error, 300)),
        jsonb_build_object('subscription_id', p_job ->> 'subscription_id', 'gateway', p_job ->> 'gateway', 'reason', 'gateway_unavailable'),
        coalesce((p_job ->> 'live')::boolean, false));
    end if;
  end if;
end;
$$;
revoke all on function private.billing_job_failed(bigint, integer, jsonb, text) from public;

select cron.schedule('billing-events', '10 seconds', $$select private.billing_process_events()$$);
select cron.schedule('billing-tick', '*/5 * * * *', $$select private.billing_tick_job()$$);
select cron.schedule('billing-worker', '* * * * *', $$select private.wake_billing_worker()$$);
select cron.schedule('billing-purge', '41 3 * * *',
  $$delete from public.billing_webhook_events where received_at < now() - interval '400 days' and processed_at is not null$$);

-- ---------------------------------------------------------------------------
-- Reads for the billing pages
-- ---------------------------------------------------------------------------
create function private.subscription_json(s public.subscriptions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'plan_id', s.plan_id, 'plan', p.label, 'tier', p.tier, 'interval', p.interval, 'status', s.status, 'gateway', s.gateway,
    'live', s.live, 'payment_method', s.payment_method, 'currency', s.currency,
    'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end, 'next_period_paid', s.next_period_paid,
    'next_plan_id', s.next_plan_id, 'next_plan', (select n.label || case n.interval when 'year' then ' (yearly)' else ' (monthly)' end
                                                   from public.plans n where n.id = s.next_plan_id),
    'trial_ends_at', s.trial_ends_at, 'grace_ends_at', s.grace_ends_at, 'po_number', s.po_number,
    'saved_card', s.saved_method_ref is not null) end
    from public.plans p where p.id = s.plan_id or s.id is null
   limit 1;
$$;
revoke all on function private.subscription_json(public.subscriptions) from public;

create function private.billing_history(p_type public.billing_subject, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'amount', x.amount, 'currency', x.currency,
                                                             'method', x.method, 'status', x.status, 'refunded_amount', x.refunded_amount,
                                                             'live', x.live, 'gateway', x.gateway, 'invoice_id', x.invoice_id,
                                                             'created_at', x.created_at) order by x.created_at desc)
                            from (select * from public.payments where subject_type = p_type and subject_id = p_id
                                   order by created_at desc limit 50) x), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'kind', i.kind, 'purpose', i.purpose,
                                                             'total', i.total, 'currency', i.currency, 'status', i.status,
                                                             'issued_at', i.issued_at, 'due_at', i.due_at, 'live', i.live,
                                                             'draft', cardinality(i.draft_reasons) > 0) order by i.issued_at desc)
                            from (select * from public.invoices where subject_type = p_type and subject_id = p_id
                                   order by issued_at desc limit 100) i), '[]'::jsonb));
$$;
revoke all on function private.billing_history(public.billing_subject, uuid) from public;

-- Everything /settings/billing, /org/billing and /uni/billing show, in one call.
create function private.billing_overview(p_subject text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.billing_subject;
  v_id uuid := private.billing_subject_of_caller(p_subject);
  s public.subscriptions;
begin
  v_type := p_subject::public.billing_subject;
  s := private.current_subscription(v_type, v_id);
  return jsonb_build_object(
    'subject_type', v_type, 'subject_id', v_id, 'name', private.billing_subject_name(v_type, v_id),
    'subscription', private.subscription_json(s),
    'entitlements', private.effective_entitlements(v_type, v_id),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tier', p.tier, 'label', p.label, 'interval', p.interval,
                                                           'price_pkr', p.price_pkr, 'price_usd', p.price_usd, 'grants', p.grants,
                                                           'self_serve', p.self_serve, 'rank', private.plan_rank(p.id))
                                        order by p.position)
                         from public.plans p where p.active and p.audience = v_type), '[]'::jsonb),
    'trial_available', v_type = 'user' and not exists (select 1 from public.trial_claims t where t.user_id = v_id)
                       and s.id is null and not private.entitled('user', v_id, 'student.plan'),
    'sponsored', case when v_type = 'user' then (
                   select jsonb_build_object('university', u.name, 'ends_at', g.ends_at)
                     from private.active_grants('user', v_id, 'student.plan') g
                     join public.universities u on u.id = g.source_id
                    where g.source = 'sponsorship' limit 1) end,
    'details', case v_type
                 when 'org' then (select jsonb_build_object('province', o.province, 'ntn', o.billing_ntn, 'address', o.billing_address)
                                    from public.organizations o where o.id = v_id)
                 when 'university' then (select jsonb_build_object('province', u.province, 'ntn', u.billing_ntn, 'address', u.billing_address)
                                           from public.universities u where u.id = v_id) end,
    'hire_fees', case when v_type = 'org' then coalesce((
                   select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'amount', f.amount, 'status', f.status,
                                                       'invoice_id', f.invoice_id, 'due_at', f.due_at, 'created_at', f.created_at,
                                                       'dispute_kind', f.dispute_kind, 'resolution_reason', f.resolution_reason,
                                                       'can_dispute', f.status in ('invoiced', 'pending')
                                                                      and f.created_at > now() - interval '14 days')
                                    order by f.created_at desc)
                     from (select * from public.hire_fees where org_id = v_id order by created_at desc limit 50) f), '[]'::jsonb) end,
    'paused_posts', case when v_type = 'org' then coalesce((
                      select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'paused_at', j.paused_at) order by j.paused_at desc)
                        from public.job_posts j where j.org_id = v_id and j.status = 'paused'), '[]'::jsonb) end,
    'members', case when v_type = 'org' then coalesce((
                 select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name, 'role', m.role, 'status', m.status,
                                                     'seat_keep', m.seat_keep) order by m.created_at)
                   from public.org_members m join public.profiles p on p.user_id = m.user_id
                  where m.org_id = v_id and m.role <> 'billing'), '[]'::jsonb) end,
    'live_posts', case when v_type = 'org' then (select count(*) from public.job_posts j where j.org_id = v_id and j.status = 'live') end,
    'company_complete', private.company_complete(true),
    'live_mode', private.billing_live_mode())
    || private.billing_history(v_type, v_id);
end;
$$;

-- One invoice, receipt or credit note with everything the PDF prints; its readers and accounts staff only.
create function private.invoice_document(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  v_me uuid := (select auth.uid());
begin
  select * into i from public.invoices where id = p_id;
  if i.id is null or not (v_me in (select private.billing_readers(i.subject_type, i.subject_id)) or private.is_staff('accounts')) then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if i.subject_type = 'org' and not private.is_staff('accounts') then
    perform private.require_org(array['admin', 'billing']::public.org_role[], false);
  elsif i.subject_type = 'university' and not private.is_staff('accounts') then
    perform private.require_uni(array['owner']::public.uni_admin_role[]);
  end if;
  return jsonb_build_object(
    'id', i.id, 'number', i.number, 'kind', i.kind, 'purpose', i.purpose, 'lines', i.lines, 'subtotal', i.subtotal,
    'tax_lines', i.tax_lines, 'tax_total', i.tax_total, 'total', i.total, 'currency', i.currency, 'status', i.status,
    'issued_at', i.issued_at, 'due_at', i.due_at, 'paid_at', i.paid_at, 'voided_at', i.voided_at, 'po_number', i.po_number,
    'bill_to', i.bill_to, 'seller', i.seller, 'draft_reasons', to_jsonb(i.draft_reasons), 'live', i.live,
    'content_hash', i.content_hash,
    'credits', (select c.number from public.invoices c where c.id = i.credits_invoice_id),
    'pay_by_bank', i.kind = 'invoice' and i.status = 'issued' and i.subject_type in ('org', 'university'),
    'subject_type', i.subject_type);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sponsored posts carry their label to students (never an ordering input)
-- ---------------------------------------------------------------------------
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
select pg_temp.patch('private.opportunities(text, integer)'::regprocedure,
  '''/opportunities/jobs/'' || j.id::text, j.deadline::timestamptz, false',
  '''/opportunities/jobs/'' || j.id::text, j.deadline::timestamptz, coalesce(j.sponsored_until > now(), false)');
drop function pg_temp.patch(regprocedure, text, text);

-- ---------------------------------------------------------------------------
-- Public wrappers
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
  'create_checkout', 'create_add_on_checkout', 'create_invoice_checkout', 'checkout_session', 'cancel_checkout',
  'start_trial', 'schedule_plan_change', 'cancel_subscription', 'choose_seats', 'reopen_paused_job',
  'save_billing_details', 'request_licence', 'dispute_hire_fee', 'billing_overview', 'invoice_document'
]);
drop function pg_temp.expose(text[]);
