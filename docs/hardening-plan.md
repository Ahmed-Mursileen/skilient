# Phase 13 — Hardening plan

Sources: build plan "Phase 13", PRD 10 (all three subsections), PRD 8, PRD 4 (launch gate), decisions.md up to
2026-10-03. Questions for Ahmed are in `docs/phase-13-questions.md`; accounts and keys in `docs/setup-checklist.md`
"Phase 13".

## What already exists (audit, 2026-10-03)

| Area | State |
| --- | --- |
| CSP | Per-request nonce CSP with `'strict-dynamic'` in `proxy.ts` (`lib/security/headers.ts`); static headers (HSTS preload, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `nosniff`) in `next.config.ts`. 33 E2E specs collect CSP violations with `watchConsole()`. **Missing:** a `report-to` endpoint (production violations are invisible), a sweep that visits every screen in `docs/screen-spec.md` for every role, and coverage with PostHog loaded (CI never loads a third-party script). |
| Errors | Sentry client/server/edge with personal data scrubbed (`lib/sentry-scrub.ts`); marketing pages load the SDK only on an error. **Missing:** Sentry in Edge Functions (workers log JSON lines only) and the alert rules themselves (dashboard). |
| Logs | JSON lines with `request_id` (`lib/log.ts`). Axiom waits for Vercel Pro (decisions 2026-10-02). |
| Product analytics | **None.** No `posthog-js`, no events, no replays or heatmaps. Vercel Analytics + Speed Insights render on Vercel only. |
| Monitoring | `/api/health` (database, storage, Realtime). `job_runs` exists and about 15 SQL jobs write it; the queue workers don't. `/ops/metrics` shows queue backlogs hourly. **Missing:** `job-watchdog`, every service check (payments, bounces, GitHub headroom, database, storage), every alert email, UptimeRobot. |
| Security tests | RLS everywhere with refusal tests (`00_rls_everywhere`), advisors fail on warn, gitleaks blocking, `pnpm audit` critical. **Missing:** ASVS L1 checklist, ZAP baseline, `/.well-known/security.txt`. |
| Performance | Lighthouse CI on the 8 marketing URLs and one total size-limit entry, both report-only. **Missing:** k6 script, load data, a run at 300 users. |
| Backups | Supabase is on the **Free plan** (decisions 2026-09-28): no daily backups. CV signing keys are backed up in `docs/signing-keys/`. **Missing:** restore drill and runbook. |
| Design gates | Phases 6–11 ran axe in both themes instead of the two gates and deferred the visual pass to "phase 14", which is this phase. Phase 12 ran Gate B on the marketing pages. |

## Slices (one PR each)

1. **Product analytics (PostHog).** Typed event registry; server-side events through a transactional outbox (triggers →
   pgmq `analytics` → `analytics-worker` Edge Function → PostHog EU batch API), so jobs and webhooks are covered and nothing
   sits in a request; `posthog-js` loaded lazily through a same-origin `/ingest` proxy with autocapture off, replays sampled
   at 20% with all text and inputs masked and user images blocked, never on the PRD's blocklisted routes, heatmaps kept on
   the PRD's pages only; identify with the uuid plus role and university; the five landing events; PostHog person, events
   and recordings deleted when an account is deleted; `analytics.muted_events` in `/ops/config` as a quota guard; dashboard
   definitions in `docs/analytics.md`. Tests: pgTAP, worker against a fake PostHog, unit, and an E2E run with PostHog loaded
   (no personal data in any payload, CSP clean).
2. **Alerts and monitoring.** `job-watchdog` (every 10 min: failed, slow and missed runs from `cron.job_run_details` and
   `job_runs`; stuck queues), service checks (payment webhook and signature failures, Resend bounce rate via its webhook,
   GitHub rate-limit headroom, database connections, storage quota, real-user LCP/INP), alert emails through the notify
   worker with a cooldown, Sentry in Edge Functions, and a written test for every alert in the PRD table (fired once on
   purpose, timings recorded) in `docs/alerts.md`.
3. **Security verification.** ASVS L1 checklist (`docs/security/asvs-l1.md`), ZAP baseline workflow (weekly, manual and
   before launch) with no high findings, CSP `report-to` endpoint, a CSP sweep over every screen for every role,
   `/.well-known/security.txt`, the reference-build regression list re-checked, fixes for anything found.
4. **Restore drill.** A manual GitHub workflow that dumps production and restores it into the scratch project, then checks
   row counts, migrations, RLS and `/api/health`; runbook `docs/restore-drill.md` (Vault secrets and Storage files are not in
   a database backup, so the runbook re-installs the CV signing key and copies buckets).
5. **Load test.** k6 busy-hour mix (feed scroll and paging, survey answers, comments, chat, search, job-fair queue) with
   thresholds mapped to every PRD 10 target, synthetic load data on the scratch project, a 300-user 30-minute run, fixes
   from `pg_stat_statements`, results in `docs/load-test.md`.
6. **Design gates A: public, auth and onboarding, core app, ventures, social, feed and chat** (screen spec 3.1–3.5,
   3.12, 3.13).
7. **Design gates B: trust and CV, student portal, plans, billing, competitions and fairs** (3.6, 3.9, 3.10).
8. **Design gates C: recruiter, teacher, university and Skilient ops** (3.7, 3.8, 3.11), then the phase wrap-up: launch
   gate technical items checked, build plan ticked.

Each design-gate slice runs Gate A (impeccable critique plus the taste pre-flight) and Gate B (audit, polish, craft floor)
per screen at 390 and 1280 px in both themes, fixes what fails, and logs one row per screen in `docs/design-gates.md`.

## Done-when mapping

| Build-plan check | Slices |
| --- | --- |
| ASVS L1 filed · ZAP no highs · CSP clean on every screen | 3 (CSP with PostHog loaded starts in 1) |
| Both design gates on every screen | 6, 7, 8 |
| PostHog events, masked replays, heatmaps | 1 |
| All alerts wired and tested | 2 |
| k6 at 300 users for 30 minutes meets every target | 5 |
| Restore drill into a scratch project | 4 |
