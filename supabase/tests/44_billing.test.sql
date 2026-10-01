-- Billing (PRD 4a, 4b; decisions.md 2026-10-05 "phase 10"): the entitlement registry and quotas, trials, checkout
-- and verified events (stored once, applied once), renewals, failures, grace and expiry, upgrades with credit,
-- downgrades over limits, add-ons, hiring fees and disputes, invoices and tax, university licences and sponsorship,
-- and the audited staff tools. The gateway is the simulated one; recorded real-gateway fixtures are in the worker tests.
-- S1..S3 students at NUTECH (S2 final year), RA an organisation admin, RB its billing member, RR a recruiter,
-- UO NUTECH's owner, ST accounts staff.
begin;
select * from no_plan();

create function pg_temp.as_user(p_id uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.v(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_value uuid) returns uuid language sql as $$
  select set_config('test.' || p_name, p_value::text, false)::uuid;
$$;
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('97000000-0000-0000-0000-0000000000' || case p when 'S1' then '01' when 'S2' then '02' when 'S3' then '03' when 'RA' then 'a1'
                                                         when 'RB' then 'a2' when 'RR' then 'a3' when 'RC' then 'a4' when 'RD' then 'a5'
                                                         when 'UO' then 'b1' when 'ST' then 'f1' end)::uuid
$$;
-- What a gateway's verified webhook does: store the event, then the 10-second job applies it.
create function pg_temp.pay(p_session uuid, p_pid text, p_method text default 'card') returns text language plpgsql as $$
declare
  c public.checkout_sessions;
begin
  select * into c from public.checkout_sessions where id = p_session;
  perform private.record_billing_event(c.gateway, 'evt_' || p_pid, 'payment.succeeded', jsonb_build_object('raw', true),
    jsonb_build_object('session_id', c.id, 'payment_id', p_pid, 'amount', c.amount, 'currency', c.currency, 'method', p_method,
                       'saved_method_ref', case when p_method = 'card' then 'card_' || p_pid end), c.live);
  perform private.billing_process_events();
  return (select outcome from public.billing_webhook_events where gateway = c.gateway and event_id = 'evt_' || p_pid);
end;
$$;
-- A renewal: the period ends, the tick queues a charge, the worker records the gateway's answer.
create function pg_temp.renew(p_sub uuid, p_pid text, p_ok boolean) returns text language plpgsql as $$
declare
  s public.subscriptions;
begin
  update public.subscriptions set current_period_start = least(current_period_start, now() - interval '40 days'), current_period_end = now()
   where id = p_sub and status = 'active';
  perform private.billing_tick();
  select * into s from public.subscriptions where id = p_sub;
  perform private.record_billing_event('worker', 'charge:' || p_pid, case when p_ok then 'payment.succeeded' else 'payment.failed' end, '{}',
    jsonb_build_object('subscription_id', s.id, 'gateway', s.gateway, 'payment_id', p_pid, 'amount', (s.pending_charge ->> 'total')::numeric,
                       'currency', s.currency, 'reason', 'card_declined'), s.live);
  perform private.billing_process_events();
  return (select outcome from public.billing_webhook_events where gateway = 'worker' and event_id = 'charge:' || p_pid);
end;
$$;
create function pg_temp.sub(p_type text, p_id uuid) returns public.subscriptions language sql security definer as $$
  select * from public.subscriptions where subject_type = p_type::public.billing_subject and subject_id = p_id order by created_at desc, ctid desc limit 1
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select pg_temp.remember('nutech', (select university_id from public.university_domains where domain = 'nutech.edu.pk'));
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('S1'), 'bs1@nutech.edu.pk', '{}'), (pg_temp.u('S2'), 'bs2@nutech.edu.pk', '{}'), (pg_temp.u('S3'), 'bs3@nutech.edu.pk', '{}'),
  (pg_temp.u('RA'), 'ra@billco-pk.com', '{"role":"recruiter","full_name":"Rida Admin"}'),
  (pg_temp.u('RB'), 'rb@billco-pk.com', '{"role":"recruiter","full_name":"Raza Billing"}'),
  (pg_temp.u('RR'), 'rr@billco-pk.com', '{"role":"recruiter","full_name":"Rehan Recruiter"}'),
  (pg_temp.u('RC'), 'rc@billco-pk.com', '{"role":"recruiter","full_name":"Rabia Three"}'),
  (pg_temp.u('RD'), 'rd@billco-pk.com', '{"role":"recruiter","full_name":"Rafay Four"}'),
  (pg_temp.u('UO'), 'uo@nutech.edu.pk', jsonb_build_object('role', 'university_admin', 'full_name', 'Uzma Owner', 'university_id', pg_temp.v('nutech'))),
  (pg_temp.u('ST'), 'stb@nutech.edu.pk', '{}');
update public.profiles set onboarding_complete = true, username = 'bl_' || right(user_id::text, 2), full_name = 'Student ' || right(user_id::text, 2),
       department = 'Computer Science', graduation_year = 2030
 where user_id::text like '97000000-%' and role = 'student';
update public.profiles set graduation_year = private.final_year_of(pg_temp.v('nutech')) where user_id = pg_temp.u('S2');
insert into public.staff_roles (user_id, role) values (pg_temp.u('ST'), 'accounts');
insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status, province, created_by)
values ('97000000-0000-0000-0000-0000000000e1', 'billco', 'BillCo', 'billco-pk.com', 'https://billco-pk.com', 'Software', '11-50', 'Lahore', 'CEO',
        'verified', null, pg_temp.u('RA'));
select pg_temp.remember('org', '97000000-0000-0000-0000-0000000000e1');
insert into public.org_members (org_id, user_id, role) values
  (pg_temp.v('org'), pg_temp.u('RA'), 'admin'), (pg_temp.v('org'), pg_temp.u('RB'), 'billing'), (pg_temp.v('org'), pg_temp.u('RR'), 'recruiter'),
  (pg_temp.v('org'), pg_temp.u('RC'), 'recruiter'), (pg_temp.v('org'), pg_temp.u('RD'), 'recruiter');
insert into public.university_admins (user_id, university_id, role) values (pg_temp.u('UO'), pg_temp.v('nutech'), 'owner');
update public.universities set owner_id = pg_temp.u('UO'), claimed_at = now() where id = pg_temp.v('nutech');

-- ---------------------------------------------------------------------------
-- Default deny: billing rows are read through functions only
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('S1'));
select throws_ok('select * from public.' || t, '42501', null, t || ' is not readable directly')
  from unnest(array['entitlement_grants', 'usage_counters', 'subscriptions', 'payments', 'invoices', 'billing_webhook_events', 'checkout_sessions',
                    'add_on_orders', 'hire_fees', 'tax_rates', 'trial_claims', 'billing_tasks', 'invoice_counters', 'billing_reminders']) t;
select throws_ok($$ insert into public.entitlement_grants (subject_type, subject_id, key, value, source) values ('user', pg_temp.u('S1'), 'cv.pdf_export', 'true', 'admin') $$,
  '42501', null, 'nobody grants themselves an entitlement');
select throws_ok($$ select public.record_billing_event('simulated', 'evt_x', 'payment.succeeded', '{}', '{}', false) $$, '42501', null,
  'only the webhook route (service role) records gateway events');
select throws_ok($$ select private.billing_process_events() $$, '42501', null, 'and only the database applies them');
select ok((select count(*) from public.plans) >= 10, 'plans and prices are public');
select throws_ok($$ select public.require_entitlement('made.up') $$, 'PT402', null, 'an unknown key is refused (402)');
select throws_ok($$ select public.require_entitlement('cv.pdf_export') $$, 'PT402', null, 'a free student has no PDF export');
select is(public.my_entitlements('user') -> 'values' ->> 'cv.templates', '1', 'the free value applies');
reset role;

-- ---------------------------------------------------------------------------
-- The registry merges grants: bool any, numbers max, enum highest; aliases; shape checks
-- ---------------------------------------------------------------------------
insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason) values
  ('user', pg_temp.u('S1'), 'cv.templates', '3', 'admin', now() + interval '1 day', 'pgTAP'),
  ('user', pg_temp.u('S1'), 'cv.templates', '5', 'admin', now() + interval '1 day', 'pgTAP'),
  ('user', pg_temp.u('S1'), 'cv.viewer_names', 'true', 'admin', now() + interval '1 day', 'pgTAP'),
  ('user', pg_temp.u('S1'), 'cv.pdf_export', 'false', 'admin', now() + interval '1 day', 'pgTAP');
select is(private.entitlement_value('user', pg_temp.u('S1'), 'cv.templates'), '5'::jsonb, 'numbers take the maximum');
select ok(private.has_entitlement(pg_temp.u('S1'), 'privacy.viewer_names'), 'the phase 8 name is an alias of cv.viewer_names');
select ok(not private.has_entitlement(pg_temp.u('S1'), 'cv.pdf_export'), 'a false grant grants nothing');
select ok(not private.has_entitlement(pg_temp.u('S1'), 'made.up'), 'unknown keys are false');
select ok(not private.org_entitled(pg_temp.v('org'), 'cv.pdf_export'), 'a student key means nothing to an organisation');
select throws_ok($$ insert into public.entitlement_grants (subject_type, subject_id, key, value, source, reason) values ('org', pg_temp.v('org'), 'cv.pdf_export', 'true', 'admin', 'x x') $$,
  '22023', null, 'a grant must match its key''s subject');
select throws_ok($$ insert into public.entitlement_grants (subject_type, subject_id, key, value, source, reason) values ('user', pg_temp.u('S1'), 'cv.templates', '"five"', 'admin', 'x x') $$,
  '22023', null, 'and its kind');
select throws_ok($$ insert into public.entitlement_grants (subject_type, subject_id, key, value, source) values ('user', pg_temp.u('S1'), 'cv.templates', '2', 'admin') $$,
  '23514', null, 'a staff grant needs a reason');
insert into public.entitlement_grants (subject_type, subject_id, key, value, source, starts_at, ends_at, reason)
values ('user', pg_temp.u('S1'), 'cv.insights', 'true', 'admin', now() - interval '2 days', now() - interval '1 day', 'expired grant');
select ok(not private.has_entitlement(pg_temp.u('S1'), 'cv.insights'), 'an expired grant counts for nothing');
update public.entitlement_grants set revoked_at = now(), revoked_reason = 'pgTAP cleanup' where subject_id = pg_temp.u('S1') and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Quotas: the period's limit, then top-ups, never more
-- ---------------------------------------------------------------------------
insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
values ('org', pg_temp.v('org'), 'contact.credits', '2', 'admin', now() + interval '1 day', 'pgTAP quota');
select is(private.consume_quota('org', pg_temp.v('org'), 'contact.credits', 1), 1, 'one credit spent, one left');
select is(private.consume_quota('org', pg_temp.v('org'), 'contact.credits', 1), 0, 'the last credit');
select throws_ok($$ select private.consume_quota('org', pg_temp.v('org'), 'contact.credits', 1) $$, 'PT402', null, 'none left: 402');
insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at)
values ('org', pg_temp.v('org'), 'contact.credits', '3', 'add_on', now() + interval '90 days');
select is((private.quota_status('org', pg_temp.v('org'), 'contact.credits') ->> 'remaining')::integer, 3, 'purchased credits add to what''s left');
select is(private.consume_quota('org', pg_temp.v('org'), 'contact.credits', 2), 1, 'top-ups are spent after the monthly allowance');
select throws_ok($$ select private.consume_quota('org', pg_temp.v('org'), 'contact.credits', 2) $$, 'PT402', null, 'never beyond them');
select lives_ok($$ select private.release_quota('org', pg_temp.v('org'), 'contact.credits', 1) $$, 'a failed write gives one back');
select is((private.quota_status('org', pg_temp.v('org'), 'contact.credits') ->> 'remaining')::integer, 2, 'the counter goes down first');
select throws_ok($$ select private.consume_quota('org', pg_temp.v('org'), 'org.seats', 1) $$, 'PT402', null, 'only limit keys are metered');
select throws_ok($$ select private.consume_quota('org', pg_temp.v('org'), 'made.up', 1) $$, 'PT402', null, 'unknown keys are refused');
update public.entitlement_grants set revoked_at = now(), revoked_reason = 'pgTAP cleanup' where subject_id = pg_temp.v('org') and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Trial: once per student, no card, ends as Free
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('S1'), 'aal1');
select isnt(public.start_trial(), null, 'a student starts a 7-day trial without a card');
select lives_ok($$ select public.require_entitlement('cv.pdf_export') $$, 'and has Pro features');
select throws_ok($$ select public.start_trial() $$, '23505', null, 'not twice at once');
select is(public.billing_overview('user') -> 'subscription' ->> 'status', 'trialing', 'billing shows the trial');
select pg_temp.as_user(pg_temp.u('RA'));
select throws_ok($$ select public.start_trial() $$, '42501', null, 'recruiters have no student trial');
reset role;
update public.subscriptions set trial_ends_at = now(), current_period_end = now() + interval '1 second'
 where subject_id = pg_temp.u('S1') and status = 'trialing';
select is((private.billing_tick() ->> 'trials_ended')::integer, 1, 'the tick ends the trial');
select is((pg_temp.sub('user', pg_temp.u('S1'))).status::text, 'expired', 'back to Free');
select ok(not private.has_entitlement(pg_temp.u('S1'), 'cv.pdf_export'), 'without Pro features');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('S1') and type = 'billing_trial_ended'), 'the student is told');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('S1'));
select throws_ok($$ select public.start_trial() $$, '23505', null, 'one trial per student, ever');
reset role;

-- ---------------------------------------------------------------------------
-- Checkout: the server prices it; the event is stored once and applied once
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('S3'));
select pg_temp.remember('s3_session', (public.create_checkout('user', 'student_pro_monthly', 'PKR', 'simulated', 'pgtap-s3-pro-0001') ->> 'session_id')::uuid);
select is((public.checkout_session(pg_temp.v('s3_session')) ->> 'amount')::numeric, 399.00, 'the amount comes from plans');
select is(public.checkout_session(pg_temp.v('s3_session')) ->> 'live', 'false', 'a simulated checkout is a test');
select is((public.create_checkout('user', 'student_pro_monthly', 'PKR', 'simulated', 'pgtap-s3-pro-0001') ->> 'session_id')::uuid, pg_temp.v('s3_session'),
  'the same key returns the same session');
select throws_ok($$ select public.create_checkout('user', 'student_pro_monthly', 'USD', 'paddle', 'pgtap-s3-pro-0002') $$, '22023', null, 'students pay in PKR');
select throws_ok($$ select public.create_checkout('user', 'student_pro_monthly', 'PKR', 'paddle', 'pgtap-s3-pro-0003') $$, '22023', null, 'PKR goes to the local gateway');
select throws_ok($$ select public.create_checkout('user', 'recruiter_growth_monthly', 'PKR', 'simulated', 'pgtap-s3-pro-0004') $$, 'P0002', null, 'a student can''t buy a recruiter plan');
select throws_ok($$ select public.create_checkout('user', 'uni_growth_yearly', 'PKR', 'simulated', 'pgtap-s3-pro-0005') $$, 'P0002', null, 'or a licence');
select pg_temp.as_user(pg_temp.u('S1'));
select throws_ok(format('select public.checkout_session(%L)', pg_temp.v('s3_session')), 'P0002', null, 'another student can''t see the session');
reset role;

select is(pg_temp.pay(pg_temp.v('s3_session'), 'pay_s3_1'), 'paid', 'a verified payment activates the plan');
select is((pg_temp.sub('user', pg_temp.u('S3'))).status::text, 'active', 'the subscription is active');
select is((pg_temp.sub('user', pg_temp.u('S3'))).payment_method, 'card', 'with a saved card it renews automatically');
select ok(private.has_entitlement(pg_temp.u('S3'), 'cv.pdf_export'), 'Pro features are on');
select is((select count(*)::integer from public.payments where subject_id = pg_temp.u('S3')), 1, 'one payment');
select ok((select not live from public.payments where subject_id = pg_temp.u('S3')), 'marked test');
select is((select series || ':' || kind from public.invoices where subject_id = pg_temp.u('S3')), 'TEST:receipt', 'a TEST receipt for a student');
select ok((select 'test_mode' = any (draft_reasons) from public.invoices where subject_id = pg_temp.u('S3')), 'watermarked as a test');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('S3') and type = 'billing_payment_succeeded'), 'and the student is told');
select is(private.email_channel_for(pg_temp.u('S3'), 'billing_payment_succeeded'), 'instant_email'::public.email_channel, 'billing always emails');
insert into public.notification_prefs (user_id, category, channel) values (pg_temp.u('S3'), 'billing', 'off');
select is(private.email_channel_for(pg_temp.u('S3'), 'billing_payment_succeeded'), 'instant_email'::public.email_channel, 'even when switched off');

-- Replays change nothing.
select is(private.record_billing_event('simulated', 'evt_pay_s3_1', 'payment.succeeded', '{}', '{}', false) ->> 'duplicate', 'true', 'the same event id is stored once');
select is(private.billing_process_events(), 0, 'and nothing is queued again');
select is(private.billing_apply_event((select id from public.billing_webhook_events where event_id = 'evt_pay_s3_1')), 'duplicate', 'applying it again is a no-op');
select pg_temp.remember('s3_sub', (pg_temp.sub('user', pg_temp.u('S3'))).id);
create temp table s3_before as select current_period_end, plan_id from public.subscriptions where id = pg_temp.v('s3_sub');
select is(pg_temp.pay(pg_temp.v('s3_session'), 'pay_s3_1'), 'paid', 'a resent webhook with the same event id stays as first applied');
select private.record_billing_event('simulated', 'evt_other_id', 'payment.succeeded', '{}',
  jsonb_build_object('session_id', pg_temp.v('s3_session'), 'payment_id', 'pay_s3_1', 'amount', 399, 'currency', 'PKR', 'method', 'card'), false);
select private.billing_process_events();
select is((select outcome from public.billing_webhook_events where event_id = 'evt_other_id'), 'payment_already_recorded', 'a new event id for a known payment is ignored');
select is((select count(*)::integer from public.payments where subject_id = pg_temp.u('S3')), 1, 'still one payment');
select is((select count(*)::integer from public.invoices where subject_id = pg_temp.u('S3')), 1, 'still one receipt');
select ok((select s.current_period_end = b.current_period_end from public.subscriptions s, s3_before b where s.id = pg_temp.v('s3_sub')), 'the period didn''t move');

-- A gateway or mode that doesn't match the session is rejected and kept for staff.
set local role authenticated;
select pg_temp.as_user(pg_temp.u('S2'));
select pg_temp.remember('s2_session', (public.create_checkout('user', 'student_pro_yearly', 'PKR', 'simulated', 'pgtap-s2-pro-0001') ->> 'session_id')::uuid);
reset role;
select private.record_billing_event('simulated', 'evt_short', 'payment.succeeded', '{}',
  jsonb_build_object('session_id', pg_temp.v('s2_session'), 'payment_id', 'pay_short', 'amount', 1, 'currency', 'PKR', 'method', 'card'), false);
select private.billing_process_events();
select ok((select outcome = 'amount_mismatch' from public.billing_webhook_events where event_id = 'evt_short')
            and (select status = 'open' from public.checkout_sessions where id = pg_temp.v('s2_session')), 'an underpayment is not applied');
select ok(exists (select 1 from public.billing_tasks where kind = 'amount_mismatch' and ref_id = pg_temp.v('s2_session')), 'staff get a task');
select private.record_billing_event('simulated', 'evt_live_claim', 'payment.succeeded', '{}',
  jsonb_build_object('session_id', pg_temp.v('s2_session'), 'payment_id', 'pay_live_claim', 'amount', 3499, 'currency', 'PKR', 'method', 'card'), true);
select private.billing_process_events();
select is((select outcome from public.billing_webhook_events where event_id = 'evt_live_claim'), 'session_mismatch', 'a live event can''t complete a test session');
select private.record_billing_event('simulated', 'evt_s2_fail', 'payment.failed', '{}',
  jsonb_build_object('session_id', pg_temp.v('s2_session'), 'reason', 'insufficient_funds'), false);
select private.billing_process_events();
select is((select status from public.checkout_sessions where id = pg_temp.v('s2_session')), 'failed', 'a failed payment fails the checkout');
select is((pg_temp.sub('user', pg_temp.u('S2'))).id, null, 'and creates no plan');

-- ---------------------------------------------------------------------------
-- Renewal, failure, retries, grace, expiry
-- ---------------------------------------------------------------------------
select is(pg_temp.renew(pg_temp.v('s3_sub'), 'pay_s3_2', true), 'renewed', 'a saved card renews at the period end');
select ok((select current_period_end > now() + interval '27 days' and retry_count = 0 from public.subscriptions where id = pg_temp.v('s3_sub')), 'a new period starts');
select is((select count(*)::integer from public.invoices where subject_id = pg_temp.u('S3')), 2, 'with a receipt');
select is(pg_temp.renew(pg_temp.v('s3_sub'), 'pay_s3_3', false), 'past_due', 'a declined renewal makes it past due');
select ok((select grace_ends_at = current_period_end + interval '7 days' and next_retry_at = current_period_end + interval '1 day'
             from public.subscriptions where id = pg_temp.v('s3_sub')), 'seven days of grace, first retry on day 1');
select ok(private.has_entitlement(pg_temp.u('S3'), 'cv.pdf_export'), 'access continues during grace');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('S3') and type = 'billing_payment_failed'), 'the student is told');
update public.subscriptions set next_retry_at = now() where id = pg_temp.v('s3_sub');
select private.billing_tick();
select ok((select charge_pending from public.subscriptions where id = pg_temp.v('s3_sub')), 'the retry is queued for the worker');
select private.record_billing_event('worker', 'charge:pay_s3_4', 'payment.failed', '{}',
  jsonb_build_object('subscription_id', pg_temp.v('s3_sub'), 'gateway', 'simulated', 'reason', 'card_declined'), false);
select private.billing_process_events();
select ok((select retry_count = 2 and next_retry_at = current_period_end + interval '3 days' from public.subscriptions where id = pg_temp.v('s3_sub')),
  'the second retry is on day 3');
update public.subscriptions set grace_ends_at = now() where id = pg_temp.v('s3_sub');
select private.billing_tick();
select is((select status::text || ':' || ended_reason from public.subscriptions where id = pg_temp.v('s3_sub')), 'expired:payment_failed', 'after the grace period it expires');
select ok(not private.has_entitlement(pg_temp.u('S3'), 'cv.pdf_export'), 'and Pro ends');

-- ---------------------------------------------------------------------------
-- Organisations: two-factor, province and tax, upgrade credit, downgrade over limits, cancel
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('RA'), 'aal1');
select throws_ok($$ select public.billing_overview('org') $$, '42501', null, 'billing needs two-factor');
select pg_temp.as_user(pg_temp.u('RR'));
select throws_ok($$ select public.billing_overview('org') $$, '42501', null, 'a recruiter seat can''t open billing');
select pg_temp.as_user(pg_temp.u('RB'));
select is(public.billing_overview('org') ->> 'name', 'BillCo', 'a billing member can');
select throws_ok($$ select public.create_checkout('org', 'recruiter_starter_monthly', 'PKR', 'simulated', 'pgtap-org-start-01') $$, '55000', null,
  'a PKR invoice needs the province first');
select lives_ok($$ select public.save_billing_details('org', '{"province":"Punjab","ntn":"1234567-8","address":"12 Main Boulevard, Lahore"}') $$, 'the billing member adds it');
select pg_temp.as_user(pg_temp.u('ST'), 'aal1');
select throws_ok($$ select public.ops_set_tax_rate('Punjab', 'Punjab sales tax on services', 0.16, current_date, 'accountant') $$, '42501', null, 'staff need two-factor');
select pg_temp.as_user(pg_temp.u('ST'));
select isnt(public.ops_set_tax_rate('Punjab', 'Punjab sales tax on services', 0.16, current_date, 'Rate confirmed by the accountant'), null, 'accounts staff enter the tax rate');
select pg_temp.as_user(pg_temp.u('RA'));
select pg_temp.remember('org_start', (public.create_checkout('org', 'recruiter_starter_monthly', 'PKR', 'simulated', 'pgtap-org-start-01') ->> 'session_id')::uuid);
select is((public.checkout_session(pg_temp.v('org_start')) ->> 'amount')::numeric, 17400.00, 'PKR 15,000 plus 16% Punjab tax');
select is((public.create_checkout('org', 'recruiter_starter_monthly', 'USD', 'simulated', 'pgtap-org-usd-001') ->> 'amount')::numeric, 55.00, 'USD has no Skilient tax (the merchant of record handles it)');
reset role;
select is(pg_temp.pay(pg_temp.v('org_start'), 'pay_org_1'), 'paid', 'the organisation pays');
select ok(private.org_entitled(pg_temp.v('org'), 'talent.full_profile'), 'Starter opens full profiles');
select is(private.org_limit(pg_temp.v('org'), 'contact.credits'), 25, 'and 25 contact credits');
select ok((select tax_total = 2400 and total = 17400 and series = 'TEST' and kind = 'invoice' and 'company_details_missing' = any (draft_reasons)
             from public.invoices where subject_id = pg_temp.v('org')), 'a tax invoice, DRAFT until company details are set');
select is((select number from public.invoices where subject_id = pg_temp.v('org')) ~ '^TEST-\d{4}-\d{6}$', true, 'numbered TEST-YYYY-NNNNNN');
select throws_ok($$ update public.invoices set total = 1 where subject_id = pg_temp.v('org') $$, '42501', null, 'an issued invoice never changes');
select throws_ok($$ delete from public.invoices where subject_id = pg_temp.v('org') $$, '42501', null, 'or disappears');

set local role authenticated;
select pg_temp.as_user(pg_temp.u('RA'));
select pg_temp.remember('org_up', (public.create_checkout('org', 'recruiter_growth_monthly', 'PKR', 'simulated', 'pgtap-org-growth-1') ->> 'session_id')::uuid);
select is(public.checkout_session(pg_temp.v('org_up')) ->> 'change', 'upgrade', 'a higher plan is an upgrade');
select is((public.checkout_session(pg_temp.v('org_up')) ->> 'amount')::numeric, 34800.00, 'unused Starter time is credited (45,000 − 15,000, plus tax)');
select throws_ok($$ select public.create_checkout('org', 'recruiter_starter_monthly', 'PKR', 'simulated', 'pgtap-org-start-02') $$, '23505', null,
  'buying the current plan again is refused');
reset role;
select is(pg_temp.pay(pg_temp.v('org_up'), 'pay_org_2'), 'paid', 'the upgrade is paid');
select is((select count(*)::integer from public.subscriptions where subject_id = pg_temp.v('org') and status = 'cancelled' and ended_reason = 'upgraded'), 1, 'Starter ends');
select is((pg_temp.sub('org', pg_temp.v('org'))).plan_id, 'recruiter_growth_monthly', 'Growth starts now');
select ok(private.org_entitled(pg_temp.v('org'), 'api.access') and private.org_entitled(pg_temp.v('org'), 'hire_fee.waived'), 'with API access and no hiring fee');
select is(private.org_limit(pg_temp.v('org'), 'org.seats'), 5, 'and five seats');

-- Downgrade at renewal, over the new limits.
insert into public.job_posts (org_id, title, type, location, salary_min, salary_max, deadline, description, status, published_at)
select pg_temp.v('org'), 'Role ' || g, 'full_time', 'Lahore', 100000, 150000, current_date + 30, repeat('Describe the role well. ', 4), 'live', now() - make_interval(days => 10 - g)
  from generate_series(1, 5) g;
insert into public.api_tokens (org_id, name, token_hash) values (pg_temp.v('org'), 'ATS', repeat('ab', 32));
set local role authenticated;
select pg_temp.as_user(pg_temp.u('RA'));
select throws_ok($$ select public.schedule_plan_change('org', 'recruiter_enterprise_yearly') $$, 'P0002', null, 'Enterprise is not self-serve');
select lives_ok($$ select public.schedule_plan_change('org', 'recruiter_starter_monthly') $$, 'the admin schedules a downgrade');
select throws_ok($$ select public.choose_seats(array[pg_temp.u('RC')]) $$, '22023', null, 'the kept seats include an admin');
select lives_ok($$ select public.choose_seats(array[pg_temp.u('RA')]) $$, 'the admin keeps their own seat');
select pg_temp.as_user(pg_temp.u('RR'));
select throws_ok($$ select public.choose_seats(array[pg_temp.u('RR')]) $$, '42501', null, 'only an admin chooses');
reset role;
select is((pg_temp.sub('org', pg_temp.v('org'))).next_plan_id, 'recruiter_starter_monthly', 'Growth continues until the period ends');
select is(pg_temp.renew((pg_temp.sub('org', pg_temp.v('org'))).id, 'pay_org_3', true), 'renewed', 'at renewal');
select is((pg_temp.sub('org', pg_temp.v('org'))).plan_id, 'recruiter_starter_monthly', 'the downgrade takes effect');
select is((select status from public.org_members where user_id = pg_temp.u('RA')), 'active', 'the chosen admin keeps the seat');
select is((select count(*)::integer from public.org_members where org_id = pg_temp.v('org') and status = 'inactive'), 3, 'the other recruiters become inactive, nothing deleted');
select is((select status from public.org_members where user_id = pg_temp.u('RB')), 'active', 'a billing member takes no seat');
select is((select count(*)::integer from public.job_posts where org_id = pg_temp.v('org') and status = 'live'), 3, 'three posts stay live');
select ok((select bool_and(status = 'paused') from (select status from public.job_posts where org_id = pg_temp.v('org') order by published_at desc limit 2) x),
  'the newest extras are paused');
select ok((select revoked_at is not null from public.api_tokens where org_id = pg_temp.v('org')), 'API tokens are revoked below Growth');
select pg_temp.remember('paused', (select id from public.job_posts where org_id = pg_temp.v('org') and status = 'paused' limit 1));
select pg_temp.remember('live_job', (select id from public.job_posts where org_id = pg_temp.v('org') and status = 'live' limit 1));
set local role authenticated;
select pg_temp.as_user(pg_temp.u('RA'));
select throws_ok(format('select public.reopen_paused_job(%L)', pg_temp.v('paused')),
  'PT402', null, 'a paused post can''t reopen while the slots are full');
select lives_ok($$ select public.cancel_subscription('org') $$, 'the admin cancels');
select is(public.billing_overview('org') -> 'subscription' ->> 'cancel_at_period_end', 'true', 'at the period end');
reset role;
select is((pg_temp.sub('org', pg_temp.v('org'))).status::text, 'active', 'it stays active until then');
update public.subscriptions set current_period_start = now() - interval '40 days', current_period_end = now() where id = (pg_temp.sub('org', pg_temp.v('org'))).id;
select private.billing_tick();
select is((pg_temp.sub('org', pg_temp.v('org'))).ended_reason, 'cancelled', 'then ends');
select is(private.entitlement_value('org', pg_temp.v('org'), 'org.plan') #>> '{}', 'explore', 'back on Explore');
select is((select count(*)::integer from public.job_posts where org_id = pg_temp.v('org') and status = 'live'), 1, 'with Explore''s one live post');
select pg_temp.remember('live_job', (select id from public.job_posts where org_id = pg_temp.v('org') and status = 'live' limit 1));

-- ---------------------------------------------------------------------------
-- Add-ons: contact credits for 90 days, a 14-day sponsored post; refunds
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('RB'));
select throws_ok($$ select public.create_add_on_checkout('contact_credits', 2, null, 'PKR', 'simulated', 'pgtap-credits-0001') $$, '22023', null, 'credits come in 5 to 100');
select pg_temp.remember('credits', (public.create_add_on_checkout('contact_credits', 10, null, 'PKR', 'simulated', 'pgtap-credits-0002') ->> 'session_id')::uuid);
select is((public.checkout_session(pg_temp.v('credits')) ->> 'amount')::numeric, 3480.00, '10 × PKR 300 plus tax');
select pg_temp.remember('sponsor', (public.create_add_on_checkout('sponsored_post', 1, pg_temp.v('live_job'),
                                                                  'PKR', 'simulated', 'pgtap-sponsor-0001') ->> 'session_id')::uuid);
select throws_ok(format('select public.create_add_on_checkout(''sponsored_post'', 1, %L, ''PKR'', ''simulated'', ''pgtap-sponsor-0002'')',
                        pg_temp.v('paused')), 'P0002', null, 'only a live post can be sponsored');
reset role;
select is(pg_temp.pay(pg_temp.v('credits'), 'pay_credits', 'wallet'), 'paid', 'credits are paid by wallet');
select is((private.quota_status('org', pg_temp.v('org'), 'contact.credits') ->> 'extras')::integer, 10, 'ten purchased credits');
select ok((select ends_at between now() + interval '89 days' and now() + interval '91 days' from public.entitlement_grants
            where subject_id = pg_temp.v('org') and source = 'add_on' and revoked_at is null), 'valid for 90 days');
select is(pg_temp.pay(pg_temp.v('sponsor'), 'pay_sponsor'), 'paid', 'a sponsored post is paid');
select ok((select sponsored_until between now() + interval '13 days' and now() + interval '15 days' from public.job_posts
            where id = (select job_id from public.add_on_orders where kind = 'sponsored_post' and subject_id = pg_temp.v('org'))), 'sponsored for 14 days');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('S1'));
select ok((select bool_or(sponsored) from public.opportunities('jobs')), 'students see the "Sponsored" label');
reset role;
select private.record_billing_event('simulated', 'evt_refund_credits', 'payment.refunded', '{}',
  jsonb_build_object('payment_id', 'pay_credits', 'amount', 3480, 'currency', 'PKR'), false);
select private.billing_process_events();
select is((select status from public.payments where gateway_payment_id = 'pay_credits'), 'refunded', 'a full refund is recorded');
select is((private.quota_status('org', pg_temp.v('org'), 'contact.credits') ->> 'extras')::integer, 0, 'and the credits go');
select ok(exists (select 1 from public.invoices where subject_id = pg_temp.v('org') and kind = 'credit_note' and series = 'TEST-CN' and total = -3480),
  'with a credit note');

-- ---------------------------------------------------------------------------
-- Hiring fees: invoiced on hire, disputed, resolved; unpaid blocks contact requests
-- ---------------------------------------------------------------------------
insert into public.hires (org_id, student_id, hired_by, job_type, kind) values (pg_temp.v('org'), pg_temp.u('S1'), pg_temp.u('RA'), 'internship', 'intern');
select pg_temp.remember('fee1', (select id from public.hire_fees where org_id = pg_temp.v('org') order by created_at desc limit 1));
select ok((select f.status = 'invoiced' and f.amount = 10000 and i.total = 11600 and i.due_at > now() + interval '29 days'
             from public.hire_fees f join public.invoices i on i.id = f.invoice_id where f.id = pg_temp.v('fee1')),
  'an intern hire is invoiced PKR 10,000 plus tax, due in 30 days');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('RB') and type = 'billing_hire_fee'), 'the billing member is told');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('RR'));
select throws_ok(format('select public.dispute_hire_fee(%L, ''marked_in_error'', ''We marked the wrong person hired.'')', pg_temp.v('fee1')),
  '42501', null, 'a recruiter seat can''t dispute');
select pg_temp.as_user(pg_temp.u('RA'));
select lives_ok(format('select public.dispute_hire_fee(%L, ''candidate_withdrew'', ''The candidate withdrew in the first week.'')', pg_temp.v('fee1')),
  'the admin disputes within 14 days');
select pg_temp.as_user(pg_temp.u('ST'));
select lives_ok(format('select public.ops_resolve_hire_fee(%L, ''void'', ''Withdrawal confirmed with the candidate'')', pg_temp.v('fee1')), 'staff void it');
reset role;
select ok((select f.status = 'void' and i.status = 'void' from public.hire_fees f join public.invoices i on i.id = f.invoice_id where f.id = pg_temp.v('fee1')),
  'the fee and its invoice are void');
select ok(exists (select 1 from public.invoices where kind = 'credit_note' and credits_invoice_id = (select invoice_id from public.hire_fees where id = pg_temp.v('fee1'))),
  'with a credit note');
insert into public.hires (org_id, student_id, hired_by, job_type, kind) values (pg_temp.v('org'), pg_temp.u('S2'), pg_temp.u('RA'), 'full_time', 'full_time');
select pg_temp.remember('fee2', (select id from public.hire_fees where org_id = pg_temp.v('org') order by created_at desc, ctid desc limit 1));
select is((select amount from public.hire_fees where id = pg_temp.v('fee2')), 30000.00, 'a full-time hire is PKR 30,000');
update public.hire_fees set due_at = now() - interval '1 day' where id = pg_temp.v('fee2');
insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
values ('org', pg_temp.v('org'), 'contact.credits', '5', 'admin', now() + interval '1 day', 'pgTAP');
select throws_ok($$ select private.consume_quota(pg_temp.v('org'), 'contact.credits', 1) $$, 'PT402', null, 'an overdue hiring fee blocks new contact requests');
select is((private.billing_tick() ->> 'periods_ended')::integer >= 0, true, 'the tick runs');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('RA') and type = 'billing_hire_fee_overdue'), 'and the organisation is told once');
select pg_temp.remember('fee2_invoice', (select invoice_id from public.hire_fees where id = pg_temp.v('fee2')));
set local role authenticated;
select pg_temp.as_user(pg_temp.u('ST'));
select lives_ok(format('select public.ops_mark_invoice_paid(%L, ''HBL-TRX-2026-0042'', ''Bank transfer received'')', pg_temp.v('fee2_invoice')),
  'staff record the bank transfer');
reset role;
select is((select status from public.hire_fees where id = pg_temp.v('fee2')), 'paid', 'the fee is paid');
select lives_ok($$ select private.consume_quota(pg_temp.v('org'), 'contact.credits', 1) $$, 'and contact requests open again');

-- ---------------------------------------------------------------------------
-- University licence and sponsorship
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('UO'));
select lives_ok($$ select public.request_licence('growth', 'Board approved the Growth licence') $$, 'the owner asks for a licence');
select throws_ok($$ select public.create_checkout('university', 'uni_growth_yearly', 'PKR', 'simulated', 'pgtap-uni-growth-1') $$, 'P0002', null,
  'licences are not bought at checkout');
select pg_temp.as_user(pg_temp.u('ST'));
select throws_ok(format('select public.ops_issue_licence(%L, ''growth'', null, '''', ''Board approval'')', pg_temp.v('nutech')), '22023', null, 'a licence needs a PO number');
select pg_temp.remember('lic_invoice', public.ops_issue_licence(pg_temp.v('nutech'), 'growth', null, 'PO-NUTECH-2026-17', 'Board approval letter received'));
reset role;
select is(private.uni_plan(pg_temp.v('nutech')), 'growth', 'the licence is active on issue');
select ok((select total = 900000 and status = 'issued' and po_number = 'PO-NUTECH-2026-17' and due_at between now() + interval '29 days' and now() + interval '31 days'
             and 'tax_rate_missing' = any (draft_reasons) from public.invoices where id = pg_temp.v('lic_invoice')),
  'invoiced with the PO number, 30-day terms; DRAFT while the province has no rate');
select ok(not exists (select 1 from public.billing_tasks where kind = 'licence_request' and subject_id = pg_temp.v('nutech') and done_at is null), 'the request is closed');
select is(private.uni_limit(pg_temp.v('nutech'), 'uni.job_fairs'), 1, 'Growth: one job fair a licence year');

select is((private.sponsorship_sync() ->> 'started')::integer, 1, 'sponsorship starts for the final-year student');
select ok(private.has_entitlement(pg_temp.u('S2'), 'cv.pdf_export'), 'S2 has Pro through the university');
select ok(not private.has_entitlement(pg_temp.u('S3'), 'cv.pdf_export'), 'S3 (not final year) does not');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('S2') and type = 'billing_sponsorship_started'), 'S2 is told');
select is((private.sponsorship_sync() ->> 'started')::integer, 0, 'running again changes nothing');
update public.profiles set graduation_year = 2031 where user_id = pg_temp.u('S2');
select is((private.sponsorship_sync() ->> 'ending')::integer, 1, 'a student who stops qualifying');
select ok((select bool_and(ends_at >= now() + interval '30 days' and ends_at < now() + interval '62 days') from public.entitlement_grants
            where subject_id = pg_temp.u('S2') and source = 'sponsorship' and revoked_at is null),
  'keeps Pro to the end of the first month at least 30 days away');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u('S2') and type = 'billing_sponsorship_ending'), 'and is told now');
update public.profiles set graduation_year = private.final_year_of(pg_temp.v('nutech')) where user_id = pg_temp.u('S2');
select is((private.sponsorship_sync() ->> 'restored')::integer, 1, 'qualifying again clears the end date');
update public.invoices set due_at = now() - interval '15 days' where id = pg_temp.v('lic_invoice');
select private.billing_tick();
select is(private.uni_plan(pg_temp.v('nutech')), 'free', 'an unpaid licence ends after 30 days and 14 days of grace');
select is((private.sponsorship_sync() ->> 'ending')::integer, 1, 'and sponsorship gets its notice');
select set_config('test.dummy', '', false);

-- ---------------------------------------------------------------------------
-- Staff tools: two-factor, reasons, audit before and after; test tools only on test plans
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.u('RA'));
select throws_ok(format('select public.ops_grant(''org'', %L, ''talent.full_profile'', ''true'', now() + interval ''6 months'', ''partner'')', pg_temp.v('org')),
  '42501', null, 'only staff grant');
select pg_temp.as_user(pg_temp.u('ST'));
select throws_ok(format('select public.ops_grant(''org'', %L, ''talent.full_profile'', ''true'', null, ''partner deal'')', pg_temp.v('org')), '22023', null,
  'a grant needs an expiry');
select pg_temp.remember('g1', public.ops_grant('org', pg_temp.v('org'), 'talent.full_profile', 'true', now() + interval '6 months', 'Launch partner: six months free'));
select lives_ok(format('select public.ops_revoke_grant(%L, ''Partner deal withdrawn'')', pg_temp.v('g1')), 'and revoke it');
select lives_ok(format('select public.ops_quota_override(''org'', %L, ''contact.credits'', 0, ''Goodwill reset after an outage'')', pg_temp.v('org')),
  'a quota override');
select isnt(public.ops_comp_plan('org', pg_temp.v('org'), 'recruiter_enterprise_yearly', 12, 'Enterprise contract signed', 'PO-ENT-1'), null, 'a comp plan');
select is(jsonb_array_length(public.ops_billing_search('billco')), 1, 'staff find the organisation');
select is(public.ops_billing_subject('org', pg_temp.v('org')) ->> 'name', 'BillCo', 'and open its billing');
select ok((public.ops_revenue() -> 'mrr') = '{}'::jsonb, 'test payments and comp plans are not revenue');
select ok((public.ops_gateway_activity() -> 'simulated' ->> 'last_live') = 'false', 'the readiness view sees the last simulated event');
select pg_temp.as_user(pg_temp.u('S1'));
select pg_temp.remember('s1_session', (public.create_checkout('user', 'student_pro_monthly', 'PKR', 'simulated', 'pgtap-s1-pro-00001') ->> 'session_id')::uuid);
reset role;
select is(pg_temp.pay(pg_temp.v('s1_session'), 'pay_s1_1'), 'paid', 'S1 buys Pro after the trial');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('ST'));
select lives_ok(format('select public.ops_simulate(%L, ''fail_next'', ''Testing renewal failure'')', (pg_temp.sub('user', pg_temp.u('S1'))).id),
  'test tools work on a test subscription');
select throws_ok(format('select public.ops_simulate(%L, ''renew_now'', ''comp plans are real'')', (pg_temp.sub('org', pg_temp.v('org'))).id), '42501', null,
  'but not on a real (comp) plan');
reset role;
select is((select count(*)::integer from public.ops_audit_log where action like 'billing.%' and staff_id = pg_temp.u('ST')), 9, 'every staff billing action is audited');
select is((select count(*)::integer from public.ops_audit_log where action like 'billing.%' and (after is null or reason is null)), 0, 'with the after values and a reason');
select ok((select before is not null from public.ops_audit_log where action = 'billing.revoke_grant' and staff_id = pg_temp.u('ST')), 'and the before values');

-- A live subscription can't be pushed around by the test tools.
update public.subscriptions set live = true, gateway = 'safepay' where id = (pg_temp.sub('user', pg_temp.u('S3'))).id;
set local role authenticated;
select pg_temp.as_user(pg_temp.u('ST'));
select throws_ok(format('select public.ops_simulate(%L, ''renew_now'', ''should not work'')', (pg_temp.sub('user', pg_temp.u('S3'))).id), '42501', null,
  'test tools refuse a live subscription');
reset role;

select * from finish();
rollback;
