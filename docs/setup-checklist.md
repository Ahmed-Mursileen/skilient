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
- [ ] **Optional: try a PDF export yourself** (test-only grant until phase 10). With your user id:

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

## Before phase 10 ⏳

- [ ] **Company registration** (needed by payment gateways).
- [ ] **Local PKR gateway** merchant account (Safepay or PayFast): sandbox + live keys, webhook secret; confirm recurring/saved-card support.
- [ ] **USD merchant-of-record** (Paddle or similar): confirm it accepts a Pakistani seller; sandbox + live keys.
- [ ] **Accountant**: provincial sales tax rates for `tax_rates`.

## Before phase 13

- [x] **PostHog** Cloud **EU** project: project key, host, personal API key; set billing limit to **$0**. — *done: EU, $0 limits*
- [ ] **Axiom** via the Vercel integration (30-day retention).
- [ ] **UptimeRobot** monitors on `/` and `/api/health`, alerts to your email.
- [ ] **security@** mailbox for `/.well-known/security.txt`.

## Before the closed beta ⏳

- [ ] **Resend paid plan**: the free plan's ~100 emails a day is shared by Supabase Auth (verification codes, magic links), security and notification emails; notification emails stop at 60 a day until then (decisions.md 2026-09-30).

- [ ] **Move skilient.com to the app project** (Vercel → the Skilient project → Domains; DNS at your
  provider), then set `NEXT_PUBLIC_SITE_URL=https://skilient.com` in Vercel and redeploy. CV PDFs
  exported before this point print skilient.vercel.app links and are test-only (decisions.md 2026-10-01).
- [ ] Final **user agreement** and **privacy notice** text (the app ships headings-only templates).
- [ ] **NUTECH** partnership (beta university), plus 2 more partner universities; 10+ teachers per partner.
- [ ] At least **1 paying recruiter** signed.
- [ ] **Trademark** and social handles for "Skilient".
- [ ] Recheck the landing page's three trust-gap stats against their primary reports (PRD 5.1).
