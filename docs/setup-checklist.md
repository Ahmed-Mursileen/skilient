# Setup checklist (human steps)

Claude Code can't create these accounts or keys. Do them before (or alongside) phase 0 and put every value in Vercel / Supabase / local `.env.local`, never in the repo. Items marked ⏳ take days or weeks — start them first.

## Before phase 0

- [x] **GitHub repo** for Skilient (new, empty); give the Claude Code session push access.
- [ ] **Domain** for Skilient; DNS at a provider you control.
- [x] **Vercel** project linked to the repo; functions region `bom1` (Mumbai); preview deploys per PR. — *done: `bom1`, Node 22, env vars set*
- [x] **Supabase** project in **Mumbai (`ap-south-1`)**, **Pro plan** (daily backups; free projects pause). Note the URL, publishable key (`sb_publishable_…`) and service-role key. Install the Supabase CLI locally (needs Docker). — *done on the **Free plan** by choice (decisions.md 2026-09-28): pausing accepted, no daily backups. ⚠️ Revisit before the closed beta. Storage is 1 GB in total; staff see its use from phase 4 (decisions.md 2026-09-30).*
- [ ] **GitHub repo secrets** for migrations on merge to `main` (Settings → Secrets and variables → Actions; put them on a `production` environment if you want an approval step): `SUPABASE_ACCESS_TOKEN` (a *scoped* personal access token limited to the Skilient project, not a classic full-account token), `SUPABASE_PROJECT_REF` (from the project URL), `SUPABASE_DB_PASSWORD`.
- [x] **Sentry** project (Developer plan): DSN + auth token.
- [x] **Resend**: verify the Skilient sending domain; API key; then set it as Supabase Auth custom SMTP. — *done: `send.techshiner.tech`, Supabase SMTP set*

## Before phase 1

- [x] **Google OAuth** client (Google Cloud console) → add to Supabase Auth; restrict to university domains happens in the app.
- [x] **Cloudflare Turnstile** site key + secret.
- [x] **HEC university list with email domains** (`supabase/seed/hec_universities.csv`: name, city, domains) — verify by hand. — *drafted; only NUTECH's domain verified so far, the rest before public launch*

## Before phase 2

- [x] **Skilient GitHub App**: name, homepage, callback URL `/api/github/callback`, webhook URL `/api/github/webhook`, webhook secret, private key (.pem), permissions read-only (contents, metadata, pull requests); events: push, pull_request, pull_request_review, installation_repositories.

## Phase 3 ⏳

- [x] **Notification emails** (phase 3 slice 2): *done 2026-09-30.* set three Edge Function secrets on the Supabase project (Dashboard → Edge Functions → Secrets): `RESEND_API_KEY` (the Resend key), `EMAIL_FROM` (e.g. `Skilient <notify@send.techshiner.tech>`), `APP_URL` (the production origin, no trailing slash). Until they're set the `notify-worker` answers "not configured" and notifications stay in-app only; the queue keeps them for up to 12 hours (instant) or until the next digest. It reuses the Vault secret `project_url` set for the GitHub worker.

## Phase 4

- [x] **Staff roles for Ahmed** (done 2026-09-30: two-factor on, grant run) (before slice 3's /ops trust queue): turn on two-factor for your
  Skilient account (Settings → Security), then run in the Supabase SQL editor, with the email
  you sign in to Skilient with:

  ```sql
  with me as (
    select id from auth.users where email = lower('<your Skilient sign-in email>')
  ), granted as (
    insert into public.staff_roles (user_id, role, granted_by)
    select me.id, r.role, me.id
      from me cross join (values ('trust_reviewer'::public.staff_role), ('accounts'::public.staff_role)) as r(role)
    on conflict (user_id, role) do nothing
    returning user_id, role
  )
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, after)
  select g.user_id, 'grant_staff_role', 'user', g.user_id::text,
         'Bootstrap: phase 4 trust queue and exam periods (no staff UI until phase 11)',
         jsonb_build_object('role', g.role)
    from granted g;

  -- Check: two rows.
  select s.role, s.granted_at from public.staff_roles s
    join auth.users u on u.id = s.user_id
   where u.email = lower('<your Skilient sign-in email>');
  ```

  Roles count only on a two-factor session: sign out and back in with your code afterwards.
- [ ] **NUTECH exam periods** (by hand, none seeded): enter them at `/ops/exam-periods` once slice 5 ships
  (nothing is seeded or imported).
- [ ] **Production end-to-end check: DEFERRED to just before the closed beta, not yet done**: follow `docs/phase-4-production-check.md`.
- [ ] **Review** the recognised-issuer list (slice 3) and the code-check change requests
  (slice 4) when they are sent.

## Phase 5

- [x] **`NEXT_PUBLIC_SITE_URL`** in Vercel (Production and Preview): `https://skilient.vercel.app` until
  skilient.com serves the app, then `https://skilient.com`. It is the origin printed in CV verify links
  and QR codes (decisions.md 2026-10-01). *Done by Ahmed.*
- [x] **First CV signing key** (*done 2026-09-30; backed up as `docs/signing-keys/2026-09-30.json`*) (after the slice 1 PR is merged and CI has deployed the migration and
  the `cv-sign` Edge Function): in the Supabase SQL editor run

  ```sql
  select private.cv_rotate_key();
  ```

  It should answer `rotation requested: …`. (If it says `not sent`, the Vault secret `project_url`
  from phase 2 is missing.) A few seconds later open
  `https://skilient.vercel.app/.well-known/skilient-cv-keys.json`: `keys` should list exactly one
  key with `retired_at: null`. Nobody types or sees the private key; `cv-sign` generates it straight
  into Vault. Then do the backup step below.
- [ ] **After every key rotation** (the first key included): save the key file into the repo so the
  public keys survive without database backups:

  ```bash
  curl -s https://skilient.vercel.app/.well-known/skilient-cv-keys.json > docs/signing-keys/$(date +%F).json
  git add docs/signing-keys && git commit -m "Back up CV signing keys" && git push
  ```

  (Use `https://skilient.com/...` once the domain serves the app.) Rotate only for an emergency
  (leaked key) or a test: there is no automatic rotation.
- [ ] **`CV_EXPORT_SECRET`** (after the phase 5 slices 2-3 PR is merged and CI has deployed its
  migration): the migration generates this key into Vault; copy it to Vercel so the PDF route can
  prove an export is Skilient's (decisions.md 2026-10-01). In the Supabase SQL editor run

  ```sql
  select decrypted_secret from vault.decrypted_secrets where name = 'cv_export_secret';
  ```

  and add the 64-character value in Vercel → Project → Settings → Environment Variables as
  `CV_EXPORT_SECRET`, **Sensitive**, for Production and Preview. Redeploy production. Never paste it
  anywhere else. Until it is set, PDF export answers "PDF export isn't set up yet" (nobody has the
  entitlement before phase 10 anyway).
- [x] **PDF renderer check on Vercel** (*done 2026-10-01: cold 2.7 s, warm 0.42 s, 67 KB PDF, about
  320 MB with Chromium, `bom1`; decisions.md*) (the feasibility spike's Vercel numbers): signed in to Skilient
  with your staff account and two-factor, open `https://skilient.vercel.app/api/ops/pdf-check` twice
  (the first call after a deploy is the cold start). Paste both JSON answers into the next session;
  they give PDF size, Node and Chromium memory, and timings. If `total_ms` is over 10,000 when warm,
  or the call fails, say so before phase 10 turns export on.
- [ ] **Optional: try a PDF export yourself.** *Retired in phase 10: `entitlements.test_grants` no longer exists. Start the free trial at `/settings/billing`, or give yourself a grant of `cv.pdf_export` at `/ops/billing`.* (Old steps, kept for the record:) With your user id:

  ```sql
  insert into public.platform_config (key, version, value, reason)
  select 'entitlements.test_grants', max(version) + 1,
         jsonb_build_object('cv.pdf_export', jsonb_build_array('<your user id>'),
                            'cv.templates', jsonb_build_array('<your user id>')),
         'Ahmed trying PDF export'
    from public.platform_config where key = 'entitlements.test_grants';
  ```

  The insert itself returns no rows. To confirm the grant, run
  `select value from public.platform_config where key = 'entitlements.test_grants' order by version desc limit 1;`
  (your id should be listed under both keys). Export needs `CV_EXPORT_SECRET` in Vercel first (the
  step above); without it the button answers "PDF export isn't set up yet".
  Export at `/me/cv`, then check the file at `/verify/<code>`. PDFs printed before skilient.com serves
  the app carry skilient.vercel.app links and are test-only. Remove the grant afterwards the same way
  with `'{}'::jsonb` as the value.

## Phase 8

Recruiter portal (decisions.md 2026-10-03). Nothing here is needed to merge; it is how you try the portal on the live project.

- [ ] **Create a test recruiter.** Use a company email you control: not Gmail, Outlook or another webmail address, and not a university
  address (the signup refuses both). Then:
  1. Open `/signup/recruiter` (or the "Hiring?" link on `/signup`), sign up, and enter the 6-digit code from the email.
  2. You land on **Settings → Security**: choose **Set up two-factor**, scan the code, confirm, and save the backup codes. The
     recruiter portal needs two-factor and shows nothing without it.
  3. Open `/recruit`: it sends you to `/org/join`. Fill in the company (the website's domain must match your email's domain, for
     example `https://www.yourcompany.com` for `you@yourcompany.com`) and send it for verification. You can build the company page
     meanwhile; search, contact requests and jobs stay locked until it is verified.
- [ ] **Verify the company** with your own staff account (staff roles and two-factor are already on, phase 4): open `/ops/orgs`,
  choose the company, and press **Verify**. Reload `/recruit` as the recruiter: the banner is gone.
- [ ] **Give the company test entitlements.** *Retired in phase 10: buy a plan on the simulated gateway at `/org/billing`, or give a comp plan at `/ops/billing`.* (Old steps, kept for the record:) In the
  Supabase **SQL editor** run the statement below. Find the company id first:

  ```sql
  select id, name, domain, status from public.organizations order by created_at desc;
  ```

  Then, with that id in place of `<org id>`:

  ```sql
  insert into public.platform_config (key, version, value, reason)
  select 'entitlements.test_grants', c.version + 1,
         c.value || jsonb_build_object(
           'talent.full_profile', jsonb_build_array('<org id>'),
           'saved_searches',      jsonb_build_array('<org id>'),
           'analytics',           jsonb_build_array('<org id>'),
           'competitions.create', jsonb_build_array('<org id>'),
           'api.access',          jsonb_build_array('<org id>')),
         'Ahmed testing phase 8 recruiter features'
    from public.platform_config c
   where c.key = 'entitlements.test_grants'
   order by c.version desc
   limit 1;
  ```

  The insert returns no rows. It keeps any other grants already there (for example the CV ones). Check it:

  ```sql
  select value from public.platform_config where key = 'entitlements.test_grants' order by version desc limit 1;
  ```

  (the company id should appear under all five keys). `/org/plan` on the company shows "Included" for each. Unknown keys are
  denied, and a grant only counts for a **verified** company. To see company names in "Which companies viewed my profile" as a
  student, add `'privacy.viewer_names', jsonb_build_array('<student user id>')` to the same `jsonb_build_object`. To remove the
  grants, run the same statement with `c.value - 'talent.full_profile' - 'saved_searches' - 'analytics' - 'competitions.create' -
  'api.access'` in place of the `||` expression. Phase 10 deletes this mechanism.
- [ ] **Try it as a student**: with a test student, turn on **recruiter visibility** (Settings → Profile), set availability and city
  (Settings → Privacy), then search for them from the company's **Talent** page. Without the grant the rows are anonymised; with it
  they have names and links.
- [ ] **Optional: `GITHUB_READ_TOKEN`** (Supabase → Edge Functions → Secrets), a read-only fine-grained token with no repository access
  (public data only). Without it the `competition-freeze` function reads public repositories unauthenticated (60 requests an hour per
  address), which is enough for a few teams.
- [ ] **Teammate invites** email through Resend (`RESEND_API_KEY` and `EMAIL_FROM` in Vercel are already set for the app's security
  notices). Without them the admin still sees the invite link on screen.
- [ ] **If a recruiter loses their authenticator**, follow `docs/recruiter-2fa-recovery.md` (the staff reset is phase 11).

## Phase 9

University portal (decisions.md "Phase 9"). Nothing needs a new key or secret.

- [ ] **First university owner (claim).** The official signs up at `/signup?role=university_admin` with an email on a
      `faculty` or `both` domain of their university, confirms it, turns on two-factor in Settings → Security, and sends the
      authorisation letter (PDF, up to 5 MB) at `/uni/claim`. An `accounts` staff member (two-factor) opens
      `/ops/universities`, checks the letter against the university's public pages and records the decision with a reason.
      If the official's email domain isn't listed yet, add it first (below).
- [ ] **Add a domain by hand** (only when no owner exists yet to ask for it; owners use Settings → Domains). Public webmail
      domains are refused by a trigger. In the SQL editor:
      ```sql
      insert into public.university_domains (university_id, domain, kind, source)
      select id, 'staff.example.edu.pk', 'faculty', 'ops' from public.universities where slug = 'example-university';
      ```
- [ ] **Test plans (optional, never in production).** *Retired in phase 10: issue a licence or a comp plan at `/ops/billing` instead.* (Old steps:) A claimed university's licence level until billing (phase 10):
      ```sql
      insert into public.platform_config (key, version, value, reason)
      select 'uni.test_plans', max(version) + 1,
             (select value from public.platform_config where key = 'uni.test_plans' order by version desc limit 1)
               || jsonb_build_object((select id::text from public.universities where slug = 'nutech'), 'growth'),
             'Phase 9 test plan for NUTECH'
        from public.platform_config where key = 'uni.test_plans';
      ```
      Levels: `basic`, `growth`, `campus`; any other value, or an unclaimed university, is `free`. To remove it, insert a new
      version whose value is the latest value minus that key (`value - '<university id>'`).
- [ ] **Test grant for a Pro student's record-viewer list (optional):** *Retired in phase 10: use the trial or an `/ops/billing` grant.* (Old steps:)
      ```sql
      insert into public.platform_config (key, version, value, reason)
      select 'entitlements.test_grants', max(version) + 1,
             (select value from public.platform_config where key = 'entitlements.test_grants' order by version desc limit 1)
               || jsonb_build_object('privacy.record_viewers', jsonb_build_array('<student user id>')),
             'Phase 9 test grant'
        from public.platform_config where key = 'entitlements.test_grants';
      ```
- [ ] **Disputes** (two claims for one university, or an owner who left): follow `docs/university-claim-disputes.md`.
- [ ] Before launch: the nightly `uni-stats` job (03:37 PKT) fills the dashboards; nothing shows until its first run.

## Phase 10

Billing (decisions.md "Phase 10"). It runs on the **simulated gateway** until the company is registered and the merchant
accounts exist: no money moves, every payment and invoice is marked TEST and never counts as revenue.

- [ ] **Vercel env vars** (Settings → Environment Variables, Production and Preview, then redeploy):
      `SIMULATED_GATEWAY_SECRET` = the output of `openssl rand -hex 32` (**Sensitive**), `BILLING_GATEWAY_LOCAL=simulated`,
      `BILLING_GATEWAY_MOR=simulated`. Without the secret, checkout answers "Payments aren't available yet".
- [ ] **Who may use test payments in production.** Staff always may. To let a tester (for example yourself as a student), add
      their user id:
      ```sql
      insert into public.platform_config (key, version, value, reason)
      select 'billing.simulated_testers', max(version) + 1,
             (select value from public.platform_config where key = 'billing.simulated_testers' order by version desc limit 1)
               || jsonb_build_array('<user id>'),
             'Ahmed testing billing'
        from public.platform_config where key = 'billing.simulated_testers';
      ```
      (Previews and local runs let everyone use the simulated gateway.)
- [ ] **The billing worker** deploys with the other Edge Functions on merge; its Vault secret `billing_worker_secret` is generated by
      the migration and it reuses `project_url`. Nothing to type. Check it once: Supabase → Edge Functions → `billing-worker` shows
      deployed, and `select * from cron.job where jobname like 'billing%';` lists `billing-events`, `billing-tick`, `billing-worker`,
      `billing-purge` (and `sponsorship-sync`).
- [ ] **Company details on invoices** (when the company exists). Until legal name, NTN and address are set every invoice says
      DRAFT; STRN is needed for tax invoices; bank details print on organisation and university invoices:
      ```sql
      insert into public.platform_config (key, version, value, reason)
      select 'billing.company', max(version) + 1, jsonb_build_object(
               'legal_name', 'Skilient (Private) Limited', 'trading_name', 'Skilient',
               'ntn', '<NTN>', 'strn', '<STRN>', 'address', '<registered address, city>',
               'email', 'billing@skilient.com', 'phone', '<phone>',
               'bank', jsonb_build_object('account_title', '<account title>', 'bank_name', '<bank>', 'iban', '<IBAN>',
                                          'swift', '<SWIFT>', 'branch', '<branch>')),
             'Company registered'
        from public.platform_config where key = 'billing.company';
      ```
      Issued invoices never change; only new ones carry the details.
- [ ] **Sales tax rates** (from the accountant): `/ops/billing?tab=gateways` → "Sales tax rates", one row per province with the
      date it applies from (e.g. Punjab, "Punjab sales tax on services", 16, from 1 July). PKR invoices to organisations and
      universities in a province with no rate say "tax rate isn't set" and are drafts. Students' prices include tax (receipts).
- [ ] **First manual grants** (launch partners, Enterprise): `/ops/billing` → find the account → "Give a comp plan" (plan and
      months, e.g. Growth for 6 months) or "Add grant" for one key with an expiry. Both need a reason and are audited. Prefer the
      page: the SQL below does the same for Growth for six months but writes no audit row, so keep it for emergencies:
      ```sql
      insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
      select 'org', '<org id>', g.key, g.value, 'admin', now() + interval '6 months', 'Launch partner: Growth free for 6 months'
        from public.plans p cross join lateral jsonb_each(p.grants) g where p.id = 'recruiter_growth_monthly';
      ```
- [ ] **University licences**: when a university's owner asks (or signs a PO), `/ops/billing?tab=gateways` → "Issue a university
      licence" with its id, level, start date and PO number. It is active at once; the invoice is due in 30 days; mark it paid with the
      bank reference when the transfer arrives (account page → Invoices → Mark paid). Unpaid 14 days after the due date, it lapses.
- [ ] **Billing live mode** (only after a real gateway is live, below): hiring-fee and licence invoices are TEST until then.
      ```sql
      insert into public.platform_config (key, version, value, reason)
      select 'billing.live_mode', max(version) + 1, 'true', 'Real gateway live' from public.platform_config where key = 'billing.live_mode';
      ```

### Switching to a real gateway

Do this once per gateway when its merchant account exists. Safepay takes PKR (students, organisations, university pay links);
Paddle takes USD from organisations. Nothing in the lifecycle changes: only env vars and the webhook URL.

1. **Sign up and get sandbox keys.**
   - Safepay: <https://getsafepay.com> → merchant sign-up (needs the company's NTN and bank account). In the **sandbox** dashboard:
     Developers → API keys gives the **API key** (`sec_…`, the "public/client" key the SDK calls `api_key`) and the **secret key**;
     Developers → Webhooks gives the **webhook shared secret**. Ask Safepay support to confirm, in writing: JazzCash and Easypaisa on
     hosted checkout, saved cards (tokenisation) for renewals, and the refund API.
   - Paddle: <https://www.paddle.com> → sign up for Paddle Billing; **first confirm they onboard a Pakistan-registered seller**.
     In the **sandbox** (sandbox-vendors.paddle.com): Developer tools → Authentication → **API key**; Checkout → Checkout settings →
     set a **default payment link** (your site); Developer tools → Notifications → **New destination** (below) gives the **secret key**.
2. **Register the webhook URLs** (the gateways call these; replace the host for previews):
   - Safepay: `https://skilient.com/api/billing/webhook/safepay`
   - Paddle: `https://skilient.com/api/billing/webhook/paddle`, events `transaction.completed`, `transaction.payment_failed`,
     `adjustment.created`, `adjustment.updated`.
3. **Set the env vars** (sandbox values first), as **Sensitive**:
   - Vercel (Production and Preview): `SAFEPAY_ENVIRONMENT=sandbox`, `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`,
     `SAFEPAY_WEBHOOK_SECRET`; `PADDLE_ENVIRONMENT=sandbox`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`.
   - Supabase → Edge Functions → Secrets (for `billing-worker`'s renewals and refunds): the same six, plus `BILLING_PRODUCTION=1`
     on the production project only.
4. **Check readiness**: `/ops/billing?tab=gateways` lists Safepay and Paddle as configured, mode `sandbox`, nothing missing.
5. **Flip the one setting**: in Vercel set `BILLING_GATEWAY_LOCAL=safepay` (and/or `BILLING_GATEWAY_MOR=paddle`), redeploy. From now
   on production refuses the simulated gateway (unless `BILLING_ALLOW_SIMULATED=1`), and checkouts open the gateway's page.
6. **Sandbox test** (B6 below, with sandbox cards): run the checklist; then save one real delivery of each webhook (body only, from
   the gateway's delivery log) over the files in `tests/fixtures/billing/<gateway>/`, run `pnpm test`, and fix anything marked
   `CONFIRM` in `supabase/functions/_shared/billing/safepay.ts` / `paddle.ts` that the real bodies contradict.
7. **Go live**: replace the sandbox keys with live keys, set `SAFEPAY_ENVIRONMENT=production` / `PADDLE_ENVIRONMENT=production`
   (Vercel and Supabase), point the live dashboards' webhooks at the same URLs, redeploy, then turn on billing live mode (above).

### B6: real test transactions (deferred until the merchant accounts exist)

With sandbox keys set (steps 1–5), as a test student, a test organisation and a test university owner:

- [ ] Student Pro monthly in **PKR** by card on Safepay sandbox → return page says "Payment confirmed" within a minute; `/settings/billing`
      shows Active and a receipt; `/ops/billing?tab=gateways` shows Safepay's last webhook time.
- [ ] The same by **JazzCash/Easypaisa** (if Safepay's sandbox offers them) → prepaid period, renewal reminders scheduled.
- [ ] A **failed** sandbox card → "didn't go through", nothing charged.
- [ ] Organisation **Starter in USD** on Paddle sandbox → Active; the payment shows Paddle's invoice number; no Skilient invoice.
- [ ] A Paddle **renewal** (sandbox: change the subscription's next billed date) → the period moves on.
- [ ] A **refund** from `/ops/billing` (Paddle) → payment Refunded, plan ends, credit note for PKR payments.
- [ ] A **hiring-fee invoice** paid by its pay link on Safepay → fee Paid.
- [ ] Resend one webhook from each dashboard → `/ops/billing` shows no new payment (replays change nothing).
- [ ] Tick B6 in `docs/build-plan.md` and note the date in `docs/decisions.md`.

## Phase 11

Ops portal (decisions.md "Phase 11").

- [ ] **Make yourself super admin** (slice 1; today your account holds trust reviewer and accounts only). Staff roles in `/ops/staff`
      need a super admin, so the first one is granted in the Supabase SQL editor. Two-factor must already be on for the account:

  ```sql
  with me as (
    select u.id from auth.users u
     where u.email = lower('<sign-in email>')
       and exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
  ), granted as (
    insert into public.staff_roles (user_id, role, granted_by)
    select me.id, 'super_admin', me.id from me
    on conflict (user_id, role) do nothing
    returning user_id
  )
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  select g.user_id, 'staff.grant', 'user', g.user_id::text, 'Bootstrap: first super admin (SQL editor)',
         jsonb_build_object('roles', '[]'::jsonb), jsonb_build_object('roles', jsonb_build_array('super_admin'))
    from granted g;

  -- Check: one row. If none, the email is wrong or two-factor isn't on yet.
  select s.role from public.staff_roles s join auth.users u on u.id = s.user_id
   where u.email = lower('<sign-in email>') and s.role = 'super_admin';
  ```

  Sign out and back in with your code afterwards; every later role change goes through `/ops/staff`.
- [ ] **Old emergency bans** (slice 2). If anyone was banned by hand before phase 11, turn each `emergency_ban` audit row that is
      still in force into a real ban so it shows in `/ops/sanctions`, can be appealed and lifted. Run in the SQL editor; it changes
      nothing when there are none:

  ```sql
  -- What there is: bans recorded by hand and not undone since.
  select l.target_id::uuid as user_id, l.reason, l.created_at, u.banned_until
    from public.ops_audit_log l
    join auth.users u on u.id = l.target_id::uuid
   where l.action = 'emergency_ban'
     and not exists (select 1 from public.ops_audit_log x where x.action = 'emergency_unban' and x.target_id = l.target_id and x.created_at > l.created_at)
     and u.banned_until > now();

  -- Turn them into sanctions (staff_id = whoever recorded the ban; they must hold super_admin).
  with old as (
    select distinct on (l.target_id) l.target_id::uuid as user_id, l.staff_id, l.reason, u.banned_until
      from public.ops_audit_log l
      join auth.users u on u.id = l.target_id::uuid
     where l.action = 'emergency_ban'
       and not exists (select 1 from public.ops_audit_log x where x.action = 'emergency_unban' and x.target_id = l.target_id and x.created_at > l.created_at)
       and u.banned_until > now()
       and not exists (select 1 from public.sanctions s where s.user_id = u.id and s.kind = 'ban' and s.lifted_at is null)
     order by l.target_id, l.created_at desc
  ), added as (
    insert into public.sanctions (user_id, kind, until, reason, staff_id)
    select o.user_id, 'ban', case when o.banned_until > now() + interval '100 years' then null else o.banned_until end,
           left('Emergency ban before phase 11: ' || o.reason, 2000), o.staff_id
      from old o
    returning id, user_id, staff_id, until
  )
  insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, before, after)
  select a.staff_id, 'sanction.ban', 'user', a.user_id::text, 'Converted from an emergency ban (setup checklist, phase 11)',
         jsonb_build_object('via', 'supabase_dashboard'), jsonb_build_object('sanction', a.id, 'until', a.until)
    from added a;
  ```

- [ ] **A second super admin** (before the closed beta). An appeal on a super admin's decision needs a different super admin, and
      the last one can't be removed. Once the person has a Skilient account with two-factor on, grant it at `/ops/staff`.

## Phase 12

Marketing site (`docs/marketing-design-plan.md`, decisions.md "phase 12"). Later slices add to this list.

- [ ] **Closed beta signup** (slice 1). After this migration reaches the hosted project, students and faculty can sign up only at
      NUTECH. Existing accounts elsewhere keep working. Open another university at `/ops/universities/<id>` → Signup → Open signup.
      At public launch use `/ops/universities` → Public launch → Open every university. Both need accounts staff with two-factor.
- [ ] **Request emails** (slice 1). "Request it" sends a confirmation email through the app's Resend sender (`RESEND_API_KEY`,
      `EMAIL_FROM`, already set for security emails). Send yourself one from the landing page and check that the confirm and
      unsubscribe links work.
- [ ] **Turnstile on the request form** (slice 1). It uses the existing `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`. Without
      JavaScript the form can't pass Turnstile in production, so such visitors are asked to turn JavaScript on.
- [ ] **Recheck the captures** (any slice). Product captures are taken from the app with sample content by
      `pnpm build && pnpm marketing:captures` (local stack). Re-run after a visible change to the feed, then commit the new files.
- [x] **Higgsfield art** (slice 3). Made with the free plan's `z_image` model (about 1.5 credits in all); the prompts are in
      `content/art.json` and inside each file. To redo a piece, generate it in the same style and replace it under `public/marketing/art/`.
- [ ] **University leads** (slice 3). "Talk to us" on `/universities` lands in `/ops/leads` for accounts staff; nobody is emailed.
      Check that queue regularly until an alert exists. It uses the same Turnstile keys as the request form.
- [ ] **About page content** (slice 3). `/about` shows only the story and values. Send the founders' names and roles, the
      incubation, the award and any real photos to add them; also review the story wording in `content/marketing.ts` (`aboutPage`).
- [ ] **Placeholder prices** (slice 3). `/pricing` shows the `plans` table and `billing.*` config as they are. Change prices at
      `/ops/config/plans` before launch, after the pricing interviews.

## Before phase 13

- [x] **PostHog** Cloud **EU** project: project key, host, personal API key; set billing limit to **$0**. — *done: EU, $0 limits*
- [ ] **Axiom** via the Vercel integration (30-day retention). Needs Vercel Pro (the integration uses Log Drains, Pro only);
      deferred until the Pro upgrade below. Until then: Vercel → project → Logs (about an hour of history on Hobby).
- [ ] **UptimeRobot** monitors on `/` and `/api/health`, alerts to your email.
- [ ] **security@** mailbox for `/.well-known/security.txt`.

## Before the closed beta ⏳

- [ ] **Vercel Pro**: Hobby is for non-commercial use only, and Skilient takes payments; Pro also unlocks Log Drains, so install
      Axiom (above) right after upgrading.
- [ ] **Resend paid plan**: the free plan's ~100 emails a day is shared by Supabase Auth (verification codes, magic links), security and notification emails; notification emails stop at 60 a day until then (decisions.md 2026-09-30).

- [ ] **Move skilient.com to the app project** (Vercel → the Skilient project → Domains; DNS at your
  provider), then set `NEXT_PUBLIC_SITE_URL=https://skilient.com` in Vercel and redeploy. CV PDFs
  exported before this point print skilient.vercel.app links and are test-only (decisions.md 2026-10-01).
- [ ] Final **user agreement** and **privacy notice** text (the app ships headings-only templates).
- [ ] **NUTECH** partnership (beta university), plus 2 more partner universities; 10+ teachers per partner.
- [ ] At least **1 paying recruiter** signed.
- [ ] **Trademark** and social handles for "Skilient".
- [ ] Recheck the landing page's three trust-gap stats against their primary reports (PRD 5.1).
