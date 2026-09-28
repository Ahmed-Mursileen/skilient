# Setup checklist (human steps)

Claude Code can't create these accounts or keys. Do them before (or alongside) phase 0 and put every value in Vercel / Supabase / local `.env.local`, never in the repo. Items marked ⏳ take days or weeks — start them first.

## Before phase 0

- [x] **GitHub repo** for Skilient (new, empty); give the Claude Code session push access.
- [ ] **Domain** for Skilient; DNS at a provider you control.
- [x] **Vercel** project linked to the repo; functions region `bom1` (Mumbai); preview deploys per PR. — *done: `bom1`, Node 22, env vars set*
- [x] **Supabase** project in **Mumbai (`ap-south-1`)**, **Pro plan** (daily backups; free projects pause). Note the URL, publishable key (`sb_publishable_…`) and service-role key. Install the Supabase CLI locally (needs Docker). — *done on the **Free plan** by choice (decisions.md 2026-09-28): pausing accepted, no daily backups. ⚠️ Revisit before the closed beta.*
- [ ] **GitHub repo secrets** for migrations on merge to `main` (Settings → Secrets and variables → Actions; put them on a `production` environment if you want an approval step): `SUPABASE_ACCESS_TOKEN` (a *scoped* personal access token limited to the Skilient project, not a classic full-account token), `SUPABASE_PROJECT_REF` (from the project URL), `SUPABASE_DB_PASSWORD`.
- [x] **Sentry** project (Developer plan): DSN + auth token.
- [x] **Resend**: verify the Skilient sending domain; API key; then set it as Supabase Auth custom SMTP. — *done: `send.techshiner.tech`, Supabase SMTP set*

## Before phase 1

- [x] **Google OAuth** client (Google Cloud console) → add to Supabase Auth; restrict to university domains happens in the app.
- [x] **Cloudflare Turnstile** site key + secret.
- [x] **HEC university list with email domains** (`supabase/seed/hec_universities.csv`: name, city, domains) — verify by hand. — *drafted; only NUTECH's domain verified so far, the rest before public launch*

## Before phase 2

- [x] **Skilient GitHub App**: name, homepage, callback URL `/api/github/callback`, webhook URL `/api/github/webhook`, webhook secret, private key (.pem), permissions read-only (contents, metadata, pull requests); events: push, pull_request, pull_request_review, installation_repositories.

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

- [ ] Final **user agreement** and **privacy notice** text (the app ships headings-only templates).
- [ ] **NUTECH** partnership (beta university), plus 2 more partner universities; 10+ teachers per partner.
- [ ] At least **1 paying recruiter** signed.
- [ ] **Trademark** and social handles for "Skilient".
- [ ] Recheck the landing page's three trust-gap stats against their primary reports (PRD 5.1).
