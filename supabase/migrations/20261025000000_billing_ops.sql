-- Phase 10 (billing), part 3 — B4 and B5: university sponsorship sync and the staff billing tools
-- (PRD 4b.7, 4b.11; decisions.md 2026-10-05 "phase 10").
--
-- Sponsorship: every night, for each claimed university whose licence includes `uni.sponsored_pro`, its final-year
-- students (Growth: the phase 6/9 rule, graduating on the coming 1 September unless the university has a
-- `final_year_batch` exception) or all its active students (Campus) hold Student Pro grants with
-- `source = sponsorship`. A student who stops qualifying keeps Pro until the end of the first month that is at
-- least 30 days away and is told at once, with an offer to continue personally. Graduates stop qualifying.
--
-- Staff tools: accounts staff on two-factor (`private.is_staff('accounts')`). Every write records the before and
-- after values and a reason in `ops_audit_log`.

-- ---------------------------------------------------------------------------
-- Sponsorship (B4)
-- ---------------------------------------------------------------------------
create function private.final_year_of(p_university uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.final_year_batch,
                  extract(year from (now() at time zone 'Asia/Karachi'))::integer
                    + case when extract(month from (now() at time zone 'Asia/Karachi')) >= 9 then 1 else 0 end)
    from public.universities u where u.id = p_university;
$$;
revoke all on function private.final_year_of(uuid) from public;

-- Who a university sponsors right now (empty without a sponsoring licence).
create function private.sponsorship_eligible(p_university uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
    from public.profiles p
   where p.university_id = p_university and p.role = 'student' and p.status = 'active'
     and private.uni_plan(p_university) <> 'free'
     and case private.entitlement_value('university', p_university, 'uni.sponsored_pro') #>> '{}'
           when 'all' then true
           when 'final_year' then p.graduation_year = private.final_year_of(p_university)
           else false end;
$$;
revoke all on function private.sponsorship_eligible(uuid) from public;

-- End of the first month (Pakistan time) that is at least the notice period away.
create function private.sponsorship_end_date()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (date_trunc('month', (now() at time zone 'Asia/Karachi')
                               + make_interval(days => coalesce((private.lifecycle('sponsorship_notice_days') #>> '{}')::integer, 30)))
          + interval '1 month') at time zone 'Asia/Karachi';
$$;
revoke all on function private.sponsorship_end_date() from public;

create function private.sponsorship_sync()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_started integer := 0;
  v_ending integer := 0;
  v_restored integer := 0;
  v_end timestamptz := private.sponsorship_end_date();
  v_template jsonb := (select p.grants from public.plans p where p.id = 'student_pro_monthly');
begin
  -- New: eligible students without a running sponsorship grant from their university.
  for r in
    select e.uid as user_id, u.id as university_id, u.name
      from public.universities u
      cross join lateral private.sponsorship_eligible(u.id) e(uid)
     where u.owner_id is not null
       and not exists (select 1 from public.entitlement_grants g
                        where g.subject_type = 'user' and g.subject_id = e.uid and g.source = 'sponsorship' and g.source_id = u.id
                          and g.key = 'student.plan' and g.revoked_at is null and (g.ends_at is null or g.ends_at > now()))
  loop
    insert into public.entitlement_grants (subject_type, subject_id, key, value, source, source_id, reason)
    select 'user', r.user_id, t.key, t.value, 'sponsorship', r.university_id, 'sponsored by ' || r.name
      from jsonb_each(v_template) t;
    perform private.billing_notify('user', r.user_id, 'billing_sponsorship_started', r.university_id,
      jsonb_build_object('university', r.name,
                         'paying', exists (select 1 from public.subscriptions s where s.subject_type = 'user' and s.subject_id = r.user_id
                                              and s.status in ('active', 'past_due') and s.gateway not in ('comp', 'none'))));
    v_started := v_started + 1;
  end loop;

  -- Re-qualified before their end date: the end date goes away.
  for r in
    select distinct g.subject_id, g.source_id
      from public.entitlement_grants g
     where g.source = 'sponsorship' and g.revoked_at is null and g.ends_at is not null and g.ends_at > now()
       and g.subject_id in (select private.sponsorship_eligible(g.source_id))
  loop
    update public.entitlement_grants set ends_at = null, notice_sent_at = null
     where source = 'sponsorship' and source_id = r.source_id and subject_id = r.subject_id and revoked_at is null;
    v_restored := v_restored + 1;
  end loop;

  -- No longer eligible: Pro continues to the end of the first month 30 days away; told now.
  for r in
    select distinct g.subject_id, g.source_id, u.name
      from public.entitlement_grants g
      join public.universities u on u.id = g.source_id
     where g.source = 'sponsorship' and g.revoked_at is null and g.ends_at is null
       and g.subject_id not in (select private.sponsorship_eligible(g.source_id))
  loop
    update public.entitlement_grants set ends_at = v_end, notice_sent_at = now()
     where source = 'sponsorship' and source_id = r.source_id and subject_id = r.subject_id and revoked_at is null and ends_at is null;
    perform private.billing_notify('user', r.subject_id, 'billing_sponsorship_ending', r.source_id,
      jsonb_build_object('university', r.name, 'ends', to_char(v_end at time zone 'Asia/Karachi', 'DD Mon YYYY')));
    v_ending := v_ending + 1;
  end loop;

  return jsonb_build_object('started', v_started, 'ending', v_ending, 'restored', v_restored);
end;
$$;
revoke all on function private.sponsorship_sync() from public;
grant execute on function private.sponsorship_sync() to service_role;

create function private.sponsorship_sync_job()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run uuid := public.job_run_start('sponsorship-sync');
  v_out jsonb;
begin
  begin
    v_out := private.sponsorship_sync();
  exception when others then
    perform public.job_run_finish(v_run, 'failed', null, sqlerrm);
    return;
  end;
  perform public.job_run_finish(v_run, 'succeeded', (v_out ->> 'started')::integer + (v_out ->> 'ending')::integer);
end;
$$;
revoke all on function private.sponsorship_sync_job() from public;
-- 01:15 PKT, after graduate-rollover (00:10 PKT) so graduates stop qualifying the same night.
select cron.schedule('sponsorship-sync', '15 20 * * *', $$select private.sponsorship_sync_job()$$);

-- /uni/sponsorship shows the real number of sponsored students now (hidden below 5).
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
select pg_temp.patch('private.uni_sponsorship()'::regprocedure, '''active_grants'', 0,',
  '''active_grants'', private.hide_small((select count(distinct g.subject_id) from public.entitlement_grants g
                                          where g.source = ''sponsorship'' and g.source_id = u.id and g.key = ''student.plan''
                                            and g.revoked_at is null and (g.ends_at is null or g.ends_at > now()))),
    ''sponsored_level'', private.entitlement_value(''university'', u.id, ''uni.sponsored_pro'') #>> ''{}'',');
drop function pg_temp.patch(regprocedure, text, text);

-- ---------------------------------------------------------------------------
-- Staff tools (B5)
-- ---------------------------------------------------------------------------
-- private.require_accounts() (phase 4) checks accounts staff on two-factor.

create function private.billing_audit(p_action text, p_type text, p_id text, p_reason text, p_before jsonb, p_after jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 2000 then
    raise exception 'give a reason (3 to 2,000 characters)' using errcode = '22023';
  end if;
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  values ((select auth.uid()), p_action, p_type, p_id, btrim(p_reason), p_before, p_after);
end;
$$;
revoke all on function private.billing_audit(text, text, text, text, jsonb, jsonb) from public;

create function private.ops_billing_search(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
begin
  perform private.require_accounts();
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object('type', 'user', 'id', p.user_id, 'name', coalesce(p.full_name, p.username), 'detail', '@' || p.username,
                                'plan', private.entitlement_value('user', p.user_id, 'student.plan') #>> '{}') x
        from public.profiles p
       where p.role = 'student' and (lower(p.username) like v_q || '%' or lower(p.full_name) like '%' || v_q || '%'
                                     or p.user_id::text = v_q)
      union all
      select jsonb_build_object('type', 'org', 'id', o.id, 'name', o.name, 'detail', o.domain,
                                'plan', private.entitlement_value('org', o.id, 'org.plan') #>> '{}')
        from public.organizations o
       where lower(o.name) like '%' || v_q || '%' or o.domain like v_q || '%' or o.id::text = v_q
      union all
      select jsonb_build_object('type', 'university', 'id', u.id, 'name', u.name, 'detail', coalesce(u.city, ''),
                                'plan', private.uni_plan(u.id))
        from public.universities u
       where lower(u.name) like '%' || v_q || '%' or u.id::text = v_q
      limit 40) s), '[]'::jsonb);
end;
$$;

create function private.ops_billing_subject(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.billing_subject;
begin
  perform private.require_accounts();
  if p_type not in ('user', 'org', 'university') then
    raise exception 'unknown subject' using errcode = '22023';
  end if;
  v_type := p_type::public.billing_subject;
  if private.billing_subject_name(v_type, p_id) is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'type', v_type, 'id', p_id, 'name', private.billing_subject_name(v_type, p_id),
    'entitlements', private.effective_entitlements(v_type, p_id),
    'subscriptions', coalesce((select jsonb_agg(private.subscription_json(s) || jsonb_build_object('ended_at', s.ended_at, 'ended_reason', s.ended_reason,
                                                                                                  'created_at', s.created_at, 'simulate_fail_next', s.simulate_fail_next)
                                 order by s.created_at desc)
                                 from (select * from public.subscriptions where subject_type = v_type and subject_id = p_id
                                        order by created_at desc limit 20) s), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'key', g.key, 'value', g.value, 'source', g.source, 'source_id', g.source_id,
                                                            'starts_at', g.starts_at, 'ends_at', g.ends_at, 'reason', g.reason, 'consumed', g.consumed,
                                                            'revoked_at', g.revoked_at, 'revoked_reason', g.revoked_reason,
                                                            'active', g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now()))
                                         order by g.created_at desc)
                          from (select * from public.entitlement_grants where subject_type = v_type and subject_id = p_id
                                 order by created_at desc limit 150) g), '[]'::jsonb),
    'counters', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'period_start', c.period_start, 'used', c.used)
                                           order by c.period_start desc)
                            from (select * from public.usage_counters where subject_type = v_type and subject_id = p_id
                                   order by period_start desc limit 24) c), '[]'::jsonb),
    'hire_fees', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'amount', f.amount, 'status', f.status,
                                                               'invoice_id', f.invoice_id, 'due_at', f.due_at, 'dispute_kind', f.dispute_kind,
                                                               'dispute_reason', f.dispute_reason, 'created_at', f.created_at)
                                            order by f.created_at desc)
                             from public.hire_fees f where v_type = 'org' and f.org_id = p_id), '[]'::jsonb),
    'add_ons', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'quantity', o.quantity, 'amount', o.amount,
                                                             'currency', o.currency, 'status', o.status, 'live', o.live, 'created_at', o.created_at)
                                          order by o.created_at desc)
                           from public.add_on_orders o where v_type = 'org' and o.subject_id = p_id), '[]'::jsonb))
    || private.billing_history(v_type, p_id);
end;
$$;

-- A manual grant with a reason and an expiry (for example Growth free for six months for a launch partner).
create function private.ops_grant(p_type text, p_id uuid, p_key text, p_value jsonb, p_ends_at timestamptz, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_id uuid;
begin
  if k.key is null or k.subject::text <> p_type then
    raise exception 'unknown entitlement for this kind of account' using errcode = '22023';
  end if;
  if p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '3 years' then
    raise exception 'grants need an expiry within three years' using errcode = '22023';
  end if;
  if private.billing_subject_name(p_type::public.billing_subject, p_id) is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason, created_by)
  values (p_type::public.billing_subject, p_id, k.key, p_value, 'admin', p_ends_at, btrim(p_reason), v_me)
  returning id into v_id;
  perform private.billing_audit('billing.grant', p_type, p_id::text, p_reason,
    jsonb_build_object(k.key, private.entitlement_value(p_type::public.billing_subject, p_id, k.key)),
    (select to_jsonb(g) from public.entitlement_grants g where g.id = v_id));
  return v_id;
end;
$$;

create function private.ops_revoke_grant(p_grant uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.entitlement_grants;
begin
  perform private.require_accounts();
  select * into g from public.entitlement_grants where id = p_grant and revoked_at is null for update;
  if g.id is null then
    raise exception 'grant not found' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  update public.entitlement_grants set revoked_at = now(), revoked_reason = btrim(p_reason) where id = g.id;
  perform private.billing_audit('billing.revoke_grant', g.subject_type::text, g.subject_id::text, p_reason, to_jsonb(g),
    (select to_jsonb(x) from public.entitlement_grants x where x.id = g.id));
  if g.subject_type = 'org' then
    perform private.apply_org_limits(g.subject_id);
  end if;
end;
$$;

-- Sets what this period's counter shows as used (a goodwill reset, or a correction).
create function private.ops_quota_override(p_type text, p_id uuid, p_key text, p_used integer, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.entitlement_keys := private.entitlement_key(p_key);
  v_period timestamptz;
  v_before integer;
begin
  perform private.require_accounts();
  if k.key is null or k.kind <> 'limit' or k.subject::text <> p_type or p_used is null or p_used < 0 or p_used > 100000 then
    raise exception 'choose a metered entitlement and a count' using errcode = '22023';
  end if;
  v_period := private.quota_period_start(k.subject, p_id, k.key);
  select used into v_before from public.usage_counters
   where subject_type = k.subject and subject_id = p_id and key = k.key and period_start = v_period for update;
  insert into public.usage_counters (subject_type, subject_id, key, period_start, used)
  values (k.subject, p_id, k.key, v_period, p_used)
  on conflict (subject_type, subject_id, key, period_start) do update set used = excluded.used;
  perform private.billing_audit('billing.quota_override', p_type, p_id::text, p_reason,
    jsonb_build_object('key', k.key, 'period_start', v_period, 'used', coalesce(v_before, 0)),
    jsonb_build_object('key', k.key, 'period_start', v_period, 'used', p_used));
end;
$$;

-- A comp plan: the plan's grants for a number of months, no payment (Enterprise contracts, launch partners).
create function private.ops_comp_plan(p_type text, p_id uuid, p_plan text, p_months integer, p_reason text, p_po text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  p public.plans;
  s public.subscriptions;
  v_id uuid;
begin
  select * into p from public.plans where id = p_plan and active;
  if p.id is null or p.audience::text <> p_type then
    raise exception 'that plan isn''t for this kind of account' using errcode = '22023';
  end if;
  if p_months is null or p_months not between 1 and 36 then
    raise exception 'comp plans last 1 to 36 months' using errcode = '22023';
  end if;
  if private.billing_subject_name(p_type::public.billing_subject, p_id) is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  s := private.current_subscription(p_type::public.billing_subject, p_id);
  if s.id is not null and s.status <> 'trialing' then
    raise exception 'this account already has a plan; let it end or change it first' using errcode = '55000';
  end if;
  if s.id is not null then
    perform private.expire_subscription(s.id, 'replaced_by_comp');
  end if;
  insert into public.subscriptions (subject_type, subject_id, plan_id, status, gateway, live, payment_method, current_period_start,
                                    current_period_end, po_number, created_by)
  values (p_type::public.billing_subject, p_id, p.id, 'active', 'comp', true, 'none', now(), now() + make_interval(months => p_months),
          nullif(btrim(coalesce(p_po, '')), ''), v_me)
  returning id into v_id;
  perform private.sync_plan_grants(v_id);
  perform private.billing_audit('billing.comp_plan', p_type, p_id::text, p_reason, private.subscription_json(s),
    (select private.subscription_json(x) from public.subscriptions x where x.id = v_id));
  return v_id;
end;
$$;

-- Ends a subscription now (a comp plan ending early, a licence withdrawn). Paid plans should be refunded instead.
create function private.ops_end_subscription(p_sub uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  perform private.require_accounts();
  select * into s from public.subscriptions where id = p_sub and status in ('trialing', 'active', 'past_due');
  if s.id is null then
    raise exception 'no running subscription' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  perform private.expire_subscription(s.id, 'ended_by_staff');
  perform private.billing_audit('billing.end_subscription', s.subject_type::text, s.subject_id::text, p_reason,
    private.subscription_json(s), (select private.subscription_json(x) from public.subscriptions x where x.id = s.id));
end;
$$;

-- A university licence (or next year's renewal): active on issue, invoice due in 30 days, bank transfer or pay link.
create function private.ops_issue_licence(p_university uuid, p_level text, p_starts date, p_po text, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  p public.plans;
  s public.subscriptions;
  v_start timestamptz := coalesce(p_starts, (now() at time zone 'Asia/Karachi')::date)::timestamp at time zone 'Asia/Karachi';
  v_due timestamptz;
  v_invoice uuid;
  v_id uuid;
begin
  select * into p from public.plans where id = 'uni_' || coalesce(p_level, '') || '_yearly';
  if p.id is null then
    raise exception 'choose Basic, Growth or Campus' using errcode = '22023';
  end if;
  if not exists (select 1 from public.universities u where u.id = p_university and u.owner_id is not null) then
    raise exception 'the university needs a verified owner first' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_po, ''))) not between 1 and 60 then
    raise exception 'enter the university''s purchase order number' using errcode = '22023';
  end if;
  v_due := now() + make_interval(days => coalesce((private.lifecycle('licence_terms_days') #>> '{}')::integer, 30));
  s := private.current_subscription('university', p_university);
  v_invoice := private.issue_invoice('university', p_university, 'invoice', 'licence',
    private.billing_quote('university', p_university, jsonb_build_array(jsonb_build_object(
      'description', p.label || ' licence, one year from ' || to_char(case when s.id is null then v_start else s.current_period_end end
                                                                      at time zone 'Asia/Karachi', 'DD Mon YYYY'),
      'quantity', 1, 'unit_amount', p.price_pkr, 'amount', p.price_pkr)), 'PKR'),
    private.billing_live_mode(), 'issued', v_due, null, btrim(p_po), null, v_me);
  if s.id is not null then
    if s.gateway <> 'manual' or s.current_period_end > now() + interval '60 days' then
      raise exception 'a licence can be renewed in its last 60 days' using errcode = '55000';
    end if;
    update public.subscriptions set next_plan_id = p.id, renewal_invoice_id = v_invoice, po_number = btrim(p_po) where id = s.id;
    v_id := s.id;
  else
    insert into public.subscriptions (subject_type, subject_id, plan_id, status, gateway, live, payment_method, currency, period_amount,
                                      current_period_start, current_period_end, po_number, created_by)
    values ('university', p_university, p.id, 'active', 'manual', private.billing_live_mode(), 'bank_transfer', 'PKR', p.price_pkr,
            least(v_start, now()), greatest(v_start, now()) + interval '1 year', btrim(p_po), v_me)
    returning id into v_id;
    perform private.sync_plan_grants(v_id);
  end if;
  update public.billing_tasks set done_at = now(), done_by = v_me, note = 'licence issued'
   where kind = 'licence_request' and subject_id = p_university and done_at is null;
  perform private.billing_notify('university', p_university, 'billing_invoice_issued', v_invoice,
    jsonb_build_object('title', p.label || ' licence', 'due', to_char(v_due at time zone 'Asia/Karachi', 'DD Mon YYYY')));
  perform private.billing_audit('billing.issue_licence', 'university', p_university::text, p_reason, private.subscription_json(s),
    (select private.subscription_json(x) || jsonb_build_object('invoice_id', v_invoice) from public.subscriptions x where x.id = v_id));
  return v_invoice;
end;
$$;

-- Voids an unpaid invoice with a credit note (paid ones are refunded instead).
create function private.void_invoice(p_invoice uuid, p_reason text, p_by uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice and kind = 'invoice' for update;
  if i.id is null then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if i.status <> 'issued' then
    raise exception 'only an unpaid invoice can be voided; refund a paid one' using errcode = '55000';
  end if;
  update public.invoices set status = 'void', voided_at = now(), void_reason = btrim(p_reason) where id = i.id;
  perform private.issue_invoice(i.subject_type, i.subject_id, 'credit_note', 'refund',
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('description', 'Cancels invoice ' || i.number, 'quantity', 1,
                                                                     'unit_amount', -i.total, 'amount', -i.total)),
                       'subtotal', -i.total, 'tax_lines', '[]'::jsonb, 'tax_total', 0, 'total', -i.total, 'currency', i.currency,
                       'draft_reasons', '[]'::jsonb),
    i.live, 'issued', null, null, null, i.id, p_by);
  update public.checkout_sessions set status = 'cancelled', completed_at = now() where invoice_id = i.id and status = 'open';
end;
$$;
revoke all on function private.void_invoice(uuid, text, uuid) from public;

create function private.ops_void_invoice(p_invoice uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_before jsonb := (select jsonb_build_object('number', i.number, 'status', i.status, 'total', i.total) from public.invoices i where i.id = p_invoice);
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  perform private.void_invoice(p_invoice, p_reason, v_me);
  update public.hire_fees set status = 'void', resolved_at = now(), resolved_by = v_me, resolution_reason = btrim(p_reason)
   where invoice_id = p_invoice and status in ('invoiced', 'disputed', 'pending');
  perform private.billing_audit('billing.void_invoice', 'invoice', p_invoice::text, p_reason, v_before,
    (select jsonb_build_object('number', i.number, 'status', i.status, 'total', i.total) from public.invoices i where i.id = p_invoice));
end;
$$;

-- A bank transfer arrived: the invoice is paid with the bank's reference.
create function private.ops_mark_invoice_paid(p_invoice uuid, p_reference text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  v_payment uuid;
begin
  perform private.require_accounts();
  select * into i from public.invoices where id = p_invoice and kind = 'invoice' for update;
  if i.id is null then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if i.status <> 'issued' then
    raise exception 'this invoice is already %', i.status using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_reference, ''))) not between 3 and 100 then
    raise exception 'enter the bank reference' using errcode = '22023';
  end if;
  v_payment := private.insert_payment(i.subject_type, i.subject_id,
    case i.purpose when 'hire_fee' then 'hire_fee' when 'licence' then 'licence' else 'invoice' end,
    i.total, i.currency, 'manual', 'bank:' || btrim(p_reference), 'bank_transfer', i.live, null, null, null);
  if v_payment is null then
    raise exception 'that bank reference is already recorded' using errcode = '23505';
  end if;
  update public.payments set invoice_id = i.id where id = v_payment;
  update public.invoices set status = 'paid', paid_at = now(), payment_id = v_payment where id = i.id;
  update public.hire_fees set status = 'paid', resolved_at = now() where invoice_id = i.id and status in ('invoiced', 'disputed', 'pending');
  perform private.billing_audit('billing.mark_paid', 'invoice', i.id::text, p_reason,
    jsonb_build_object('number', i.number, 'status', i.status),
    jsonb_build_object('number', i.number, 'status', 'paid', 'reference', btrim(p_reference), 'payment_id', v_payment));
end;
$$;

-- Refund through the gateway: queued for the worker, which calls the adapter and records the outcome.
create function private.ops_refund(p_payment uuid, p_amount numeric, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  v_amount numeric(12, 2);
begin
  perform private.require_accounts();
  select * into pay from public.payments where id = p_payment;
  if pay.id is null then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  v_amount := coalesce(p_amount, pay.amount - pay.refunded_amount);
  if v_amount <= 0 or v_amount > pay.amount - pay.refunded_amount then
    raise exception 'refund between 1 and % %', pay.amount - pay.refunded_amount, pay.currency using errcode = '22023';
  end if;
  if pay.gateway = 'manual' then
    -- Bank transfers are refunded by bank; the outcome is recorded here directly.
    perform private.record_billing_event('worker', 'manual-refund:' || pay.id::text || ':' || (pay.refunded_amount + v_amount)::text,
      'payment.refunded', jsonb_build_object('by', (select auth.uid())),
      jsonb_build_object('gateway', 'manual', 'payment_id', pay.gateway_payment_id, 'amount', v_amount, 'currency', pay.currency),
      pay.live);
  else
    perform pgmq.send('billing_jobs', jsonb_build_object(
      'kind', 'refund', 'payment_id', pay.id, 'gateway', pay.gateway, 'gateway_payment_id', pay.gateway_payment_id,
      'amount', v_amount, 'currency', pay.currency, 'live', pay.live,
      'idempotency_key', 'refund:' || pay.id::text || ':' || (pay.refunded_amount + v_amount)::text));
  end if;
  perform private.billing_audit('billing.refund', 'payment', pay.id::text, p_reason,
    jsonb_build_object('amount', pay.amount, 'refunded', pay.refunded_amount, 'status', pay.status),
    jsonb_build_object('amount', pay.amount, 'refund_requested', v_amount));
end;
$$;

create function private.ops_resolve_hire_fee(p_fee uuid, p_outcome text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  f public.hire_fees;
begin
  select * into f from public.hire_fees where id = p_fee for update;
  if f.id is null then
    raise exception 'fee not found' using errcode = 'P0002';
  end if;
  if p_outcome not in ('paid', 'void', 'waived') or f.status not in ('disputed', 'invoiced', 'pending') then
    raise exception 'resolve an open fee to paid, void or waived' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_outcome = 'paid' then
    -- The dispute is rejected: the invoice stands and is owed again (a fresh 30 days from today).
    update public.hire_fees set status = 'invoiced', due_at = greatest(due_at, now() + interval '30 days'), resolved_at = now(),
                                resolved_by = v_me, resolution_reason = btrim(p_reason), overdue_notified_at = null
     where id = f.id;
    update public.invoices set due_at = greatest(due_at, now() + interval '30 days') where id = f.invoice_id and status = 'issued';
  else
    if f.invoice_id is not null and exists (select 1 from public.invoices i where i.id = f.invoice_id and i.status = 'issued') then
      perform private.void_invoice(f.invoice_id, p_reason, v_me);
    end if;
    update public.hire_fees set status = p_outcome, resolved_at = now(), resolved_by = v_me, resolution_reason = btrim(p_reason) where id = f.id;
    update public.hires set fee_status = 'waived' where id = f.hire_id;
  end if;
  perform private.billing_audit('billing.resolve_hire_fee', 'hire_fee', f.id::text, p_reason,
    jsonb_build_object('status', f.status, 'dispute_kind', f.dispute_kind),
    (select jsonb_build_object('status', x.status, 'resolution', x.resolution_reason) from public.hire_fees x where x.id = f.id));
end;
$$;

create function private.ops_set_tax_rate(p_province text, p_label text, p_rate numeric, p_from date, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  v_before jsonb := (select to_jsonb(t) from private.tax_rate_for(p_province, coalesce(p_from, current_date)) t where t.id is not null);
  v_id uuid;
begin
  if p_rate is null or p_rate < 0 or p_rate > 0.5 or p_from is null or p_from < current_date - 31 then
    raise exception 'enter a rate between 0 and 0.5 (50 per cent), effective from this month on' using errcode = '22023';
  end if;
  insert into public.tax_rates (province, label, rate, effective_from, reason, entered_by)
  values (p_province, btrim(coalesce(p_label, '')), p_rate, p_from, btrim(coalesce(p_reason, '')), v_me)
  returning id into v_id;
  perform private.billing_audit('billing.tax_rate', 'tax_rate', p_province, p_reason, v_before,
    (select to_jsonb(t) from public.tax_rates t where t.id = v_id));
  return v_id;
end;
$$;

-- Test tools for the simulated gateway: never for a live subscription.
create function private.ops_simulate(p_sub uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_out jsonb;
begin
  perform private.require_accounts();
  select * into s from public.subscriptions where id = p_sub for update;
  if s.id is null then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;
  if s.live or s.gateway not in ('simulated', 'none', 'manual', 'comp') then
    raise exception 'test tools only work on test subscriptions' using errcode = '42501';
  end if;
  if p_action = 'fail_next' then
    update public.subscriptions set simulate_fail_next = true where id = s.id;
  elsif p_action = 'renew_now' then
    if s.status not in ('active', 'trialing') then
      raise exception 'only a running subscription can renew' using errcode = '55000';
    end if;
    update public.subscriptions
       set current_period_start = least(current_period_start, now() - interval '1 day'), current_period_end = now(),
           trial_ends_at = case when status = 'trialing' then now() end
     where id = s.id;
  elsif p_action = 'end_grace' then
    if s.status <> 'past_due' then
      raise exception 'only a past-due subscription has a grace period' using errcode = '55000';
    end if;
    update public.subscriptions set grace_ends_at = now() where id = s.id;
  elsif p_action = 'retry_now' then
    if s.status <> 'past_due' then
      raise exception 'only a past-due subscription retries' using errcode = '55000';
    end if;
    update public.subscriptions set next_retry_at = now() where id = s.id;
  else
    raise exception 'unknown test action' using errcode = '22023';
  end if;
  v_out := private.billing_tick();
  perform private.billing_audit('billing.simulate', 'subscription', s.id::text, p_reason, private.subscription_json(s),
    (select private.subscription_json(x) || jsonb_build_object('action', p_action) from public.subscriptions x where x.id = s.id));
  return v_out;
end;
$$;

create function private.ops_billing_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'subject_type', t.subject_type, 'subject_id', t.subject_id,
                                                       'name', private.billing_subject_name(t.subject_type, t.subject_id), 'detail', t.detail,
                                                       'created_at', t.created_at) order by t.created_at)
                     from public.billing_tasks t where t.done_at is null), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', 'hire_fee_dispute', 'subject_type', 'org', 'subject_id', f.org_id,
                                                          'name', o.name, 'detail', jsonb_build_object('dispute_kind', f.dispute_kind,
                                                          'reason', f.dispute_reason, 'amount', f.amount), 'created_at', f.disputed_at)
                                        order by f.disputed_at)
                        from public.hire_fees f join public.organizations o on o.id = f.org_id where f.status = 'disputed'), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', 'event_failed', 'subject_type', null, 'subject_id', null,
                                                          'name', e.gateway || ' ' || e.type, 'detail', jsonb_build_object('error', e.error,
                                                          'attempts', e.attempts, 'event_id', e.event_id), 'created_at', e.received_at)
                                        order by e.received_at)
                        from public.billing_webhook_events e where e.processed_at is null and e.attempts > 0), '[]'::jsonb);
end;
$$;

create function private.ops_close_task(p_task uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_accounts();
  t public.billing_tasks;
begin
  select * into t from public.billing_tasks where id = p_task and done_at is null for update;
  if t.id is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  update public.billing_tasks set done_at = now(), done_by = v_me, note = btrim(coalesce(p_note, '')) where id = t.id;
  perform private.billing_audit('billing.close_task', 'billing_task', t.id::text, p_note, to_jsonb(t),
    (select to_jsonb(x) from public.billing_tasks x where x.id = t.id));
end;
$$;

-- The revenue view (PRD 4a): live money only; test payments and comp plans never count.
create function private.ops_revenue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := now() - interval '30 days';
begin
  perform private.require_accounts();
  return jsonb_build_object(
    'mrr', coalesce((select jsonb_object_agg(x.currency, x.mrr) from (
              select s.currency, round(sum(case p.interval when 'year' then s.period_amount / 12 else s.period_amount end), 2) as mrr
                from public.subscriptions s join public.plans p on p.id = s.plan_id
               where s.live and s.status in ('active', 'past_due') and s.gateway not in ('comp', 'none')
               group by s.currency) x), '{}'::jsonb),
    'active_by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan', p.label, 'interval', p.interval, 'audience', p.audience, 'count', x.n)
                                                 order by p.audience, p.position)
                                  from (select s.plan_id, count(*) as n from public.subscriptions s
                                         where s.live and s.status in ('active', 'past_due') and s.gateway not in ('comp', 'none')
                                         group by s.plan_id) x
                                  join public.plans p on p.id = x.plan_id), '[]'::jsonb),
    'comp_count', (select count(*) from public.subscriptions s where s.status = 'active' and s.gateway = 'comp'),
    'last_30_days', coalesce((select jsonb_object_agg(x.kind || ':' || x.currency, x.total) from (
              select pay.kind, pay.currency, sum(pay.amount - pay.refunded_amount) as total
                from public.payments pay where pay.live and pay.created_at >= v_window
               group by pay.kind, pay.currency) x), '{}'::jsonb),
    'churn_30_days', jsonb_build_object(
      'ended', (select count(*) from public.subscriptions s
                 where s.live and s.ended_at >= v_window and s.gateway not in ('comp', 'none')
                   and coalesce(s.ended_reason, '') not in ('upgraded')),
      'active_at_start', (select count(*) from public.subscriptions s
                           where s.live and s.gateway not in ('comp', 'none') and s.created_at < v_window
                             and (s.ended_at is null or s.ended_at >= v_window))),
    'hire_fees_open', (select coalesce(sum(f.amount), 0) from public.hire_fees f join public.invoices i on i.id = f.invoice_id
                        where i.live and f.status in ('invoiced', 'disputed')),
    'test_payments_30_days', (select count(*) from public.payments pay where not pay.live and pay.created_at >= v_window));
end;
$$;

-- Gateway activity for the readiness view (which adapters are configured comes from the app's environment).
create function private.ops_gateway_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_accounts();
  return coalesce((select jsonb_object_agg(x.gateway, jsonb_build_object('last_received_at', x.last_at, 'last_live', x.last_live,
                                                                         'events_24h', x.n24, 'failed', x.failed))
                     from (select e.gateway, max(e.received_at) as last_at,
                                  (array_agg(e.live order by e.received_at desc))[1] as last_live,
                                  count(*) filter (where e.received_at > now() - interval '24 hours') as n24,
                                  count(*) filter (where e.processed_at is null and e.attempts > 0) as failed
                             from public.billing_webhook_events e group by e.gateway) x), '{}'::jsonb)
         || jsonb_build_object('queue', jsonb_build_object(
              'events', (select count(*) from pgmq.q_billing_events),
              'jobs', (select count(*) from pgmq.q_billing_jobs)),
            'tax_rates', coalesce((select jsonb_agg(jsonb_build_object('province', t.province, 'label', t.label, 'rate', t.rate,
                                                                       'effective_from', t.effective_from) order by t.province, t.effective_from desc)
                                     from public.tax_rates t), '[]'::jsonb),
            'company_complete', private.company_complete(true),
            'live_mode', private.billing_live_mode());
end;
$$;

-- Lets the app decide whether this person may use the simulated gateway in production.
create function private.may_use_simulated()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or coalesce((private.config('billing.simulated_testers') ? (select auth.uid())::text), false);
$$;

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
  'ops_billing_search', 'ops_billing_subject', 'ops_grant', 'ops_revoke_grant', 'ops_quota_override', 'ops_comp_plan',
  'ops_end_subscription', 'ops_issue_licence', 'ops_void_invoice', 'ops_mark_invoice_paid', 'ops_refund', 'ops_resolve_hire_fee',
  'ops_set_tax_rate', 'ops_simulate', 'ops_billing_tasks', 'ops_close_task', 'ops_revenue', 'ops_gateway_activity', 'may_use_simulated'
]);
drop function pg_temp.expose(text[]);
