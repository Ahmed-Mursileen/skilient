## 10. Non-functional requirements

Targets are sized for launch capacity (5,000 accounts, 500 daily actives, 300 online at peak; see Performance below); don't build caching or queues beyond what that needs.

| Area | Requirement |
| --- | --- |
| Performance | See "Performance (decided 2026-09-25)" directly below this table: targets, budgets, region, capacity and monitoring. |
| Scalability | Cursor pagination everywhere lists can grow (feed 20/page, notifications 50, explore 20); add indexes on every foreign key and on `posts(university_id, created_at)` |
| Sessions | `proxy.ts` refreshes tokens proactively via `getClaims()`; auth decisions use `getUser()`, never `getSession()` |
| Background jobs | GitHub import runs as queued, idempotent jobs and never blocks a request; the UI shows live progress. First skills within 5 min for 90% of students |
| Email | Resend configured as Supabase custom SMTP before any real signup test; sender domain verified on the Skilient domain. The reference build's `/api/waitlist` is removed; "Request your university" (5.1) replaces it. |
| SEO | Add `metadata` (title, description, Open Graph image) to the root layout and marketing pages; the reference build has none. Signed-in pages are `noindex` |
| Observability | See "Observability, monitoring and analytics (decided 2026-09-25)" below this table. |
| Reliability | Chat shows a "reconnecting" state on network loss; every mutation returns a user-visible error on failure |
| Testing | Lint + typecheck in CI; Playwright E2E for the cross-account flows in section 11 (two real accounts); RLS tests per table under an authenticated role |
| Config | Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_` format), `SUPABASE_SERVICE_ROLE_KEY` (server only), `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `RESEND_API_KEY`, Google OAuth client id and secret (in Supabase Auth), gateway keys and webhook secrets, `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_PERSONAL_API_KEY`; commit a `.env.example` with names only |
| Dependencies | Pin versions and read changelogs before upgrades (a lucide-react bump once removed an icon mid-build) |

### Performance (decided 2026-09-25)

**Baseline:** a mid-range Android phone (Redmi Note class) on 4G. Every flow must also work on 3G, only slower. Targets are measured on real users at p75 unless noted.

| Metric | Target |
| --- | --- |
| Largest Contentful Paint | ≤ 2.5 s on 4G |
| Interaction to Next Paint | ≤ 200 ms |
| Cumulative Layout Shift | ≤ 0.1 |
| Server response (TTFB) from Pakistan | ≤ 600 ms |
| Feed first page visible | ≤ 1.5 s |
| Next feed page | ≤ 400 ms |
| Survey tick/cross | Shown instantly (optimistic); saved ≤ 500 ms |
| Chat message delivered | ≤ 1 s p95 |
| Search results | ≤ 300 ms p95 |
| Notification badge update | ≤ 2 s |
| CV PDF | ≤ 10 s p95 |
| First GitHub skills | ≤ 5 min for 90% of students |

**Budgets (soft):** JavaScript (compressed, first load) marketing ≤ 90 KB, app shell ≤ 170 KB, each extra route ≤ 50 KB; fonts: the section 9.2 set only — Spectral 500/600, Barlow 400/500/600, JetBrains Mono 400 — Latin subset, self-hosted via `next/font` (Montserrat is never downloaded — the wordmark is SVG); images AVIF/WebP, responsive sizes, lazy below the fold, one priority image per page; landing first visit ≤ 1 MB. Budgets have **leeway**: CI reports them on every pull request and flags anything more than 10% over, but never blocks a merge. Overages are reviewed in the weekly performance check and fixed or accepted with a written reason.

**Region:** Supabase project in **Mumbai (`ap-south-1`)** and Vercel functions pinned to **`bom1`** (Mumbai), co-located so every database round trip stays inside the region (roughly 40–70 ms from Pakistan). The rebuild creates a new Supabase project in this region.

**Server and database**

- At most 3 database round trips per page; independent reads run in parallel.
- `feed_page` ≤ 150 ms in the database; other reads ≤ 50 ms. RLS policies wrap `auth.uid()` as `(select auth.uid())` so it's evaluated once per query; every foreign key and filter column is indexed.
- Edge Functions and jobs connect through the Supavisor pooler.
- Heavy work runs as jobs, never in a request: ranking, feed stages, quality index, GitHub import, emails, PDF generation.
- Caching: marketing and `/verify/[code]` pages are static and served from the CDN; user-specific data is never shared-cached; the university domain list is cached for 1 hour.
- Realtime: at most 3 channels per open tab (open chat thread, notifications, feed "new posts" pill).
- No video anywhere, so no transcoding pipeline; images only.

**Capacity at launch:** 5,000 accounts, 500 daily active users, 100 online at once. Busy moments (results day, a job fair, a hackathon deadline) are assumed to bring up to 3× the normal load — **300 online at once** — and the system must meet every target above at that level.

**Load test before launch:** k6 script replaying a busy-hour mix at 300 concurrent users for 30 minutes: feed scrolling and paging, survey answers, comments, chat, search, a job-fair queue. Launch requires all targets met with no errors above 0.1%.

**Monitoring:** Vercel Speed Insights (real users, per route) with an alert when p75 LCP or INP misses its target for 24 hours; `pg_stat_statements` reviewed weekly, and any query over 100 ms p95 gets a ticket; job durations and queue backlogs shown in `/ops`; Lighthouse CI and `size-limit` reports on every pull request (report-only, per the leeway rule).

**Not at launch:** data-saver mode, video in posts or chat.

### Observability, monitoring and analytics (decided 2026-09-25)

Everything runs on free tiers at launch volume (5,000 accounts, 500 daily actives). Each paid tool has its billing limit set to $0 or its plan capped, so nothing can charge without a deliberate change. Free-tier quotas below are as published at the time of writing; confirm them at setup.

| Need | Tool | Free-tier fit and settings |
| --- | --- | --- |
| Errors | **Sentry** (Developer plan) | Browser, server and Edge Functions via `@sentry/nextjs`; \~5,000 errors/month; release tracking and source maps; personal data scrubbed before sending |
| Logs | **Axiom** (Vercel integration log drain) | 30-day retention; structured JSON lines from every server action and job |
| Product analytics, session replay, heatmaps | **PostHog Cloud (EU)** | \~1M events and \~5,000 recordings a month free; billing limit $0; heatmaps included |
| Web traffic and speed | **Vercel Analytics + Speed Insights** | Cookieless page views; real-user Core Web Vitals per route |
| Uptime | **UptimeRobot** (free) | `/` and `/api/health` every 5 minutes |
| Database, auth, Realtime, Edge Function logs | **Supabase dashboard** | Built-in metrics and logs |

**Errors and logs**

- Every server action and job writes one JSON log line: `request_id`, action or job name, internal user id (uuid only), duration, outcome, error code. The `request_id` is returned to the browser and shown in error toasts ("Ref: 7f3a…") so a user report maps to a log line.
- Sentry scrubs names, emails, message and post bodies, and query strings before sending; it groups by release and alerts on new issues.
- `security_events` table: failed sign-ins, password resets, staff sign-ins, agreement acceptances, permission-denied spikes. Separate from `ops_audit_log`.

**Monitoring**

- `/api/health` checks the database (simple query), Storage and Realtime and returns 200 or 503.
- `job_runs(job, started_at, finished_at, status, rows, error)` written by every pg\_cron job and Edge Function worker; a `job-watchdog` job (every 10 minutes) flags failures, runs longer than twice their median, and missed schedules.
- External services: payment webhook failures and signature failures, Resend bounce rate, GitHub App rate-limit headroom.
- No public status page at launch.

**Alerts — email only**, to the founder (on call at launch). Sentry, Axiom, UptimeRobot and Supabase send their own emails; `job-watchdog` and the service checks send through Resend.

| Alert | Fires when |
| --- | --- |
| Site down | 2 failed uptime checks in a row |
| Server errors | 5xx above 1% of requests for 5 minutes (Axiom monitor) |
| New error | Sentry sees a new issue in production |
| Job failed or missed | Any scheduled job (`job-watchdog`) |
| Payments | A gateway webhook fails or a signature check fails |
| Database | CPU above 80% for 10 minutes, or connections above 80% of the limit |
| Storage | Above 80% of the plan quota |
| Email | Bounce rate above 5% over a day |
| GitHub | Rate-limit headroom below 20% |
| Performance | p75 LCP or INP over target for 24 hours |

**Product analytics (PostHog)**

- Identity: `posthog.identify(user.id)` with the internal uuid only, plus non-identifying properties (role, university id, plan, tier, signup week). Never names, emails, usernames or content.
- Events: sent server-side from server actions with `posthog-node` (reliable, not blocked by ad blockers) plus page views and view-only events from `posthog-js`. Autocapture is **off**; only the named events count against the quota. Event list (\~30): signup funnel steps, onboarding steps, GitHub connected, first L2 skill, tour completed or skipped, post created, survey answered, comment added, venture created / joined / completed, chat message sent, contact request sent / accepted, application stage changed, hire confirmed, subscription started / cancelled, feedback sent, plus the landing events.
- Dashboards in PostHog: activation (onboarding done plus GitHub connected or venture joined within 7 days), DAU/WAU/MAU, D1/D7/D30 retention by signup cohort, signup funnel, survey answer rate, feed health (share of posts reaching Full), time to first recruiter contact, Pro conversion. All filterable by university.
- Business metrics (MRR by stream, hires, evidence levels, rank distribution, queue backlogs) stay in our own database and show in `/ops/metrics`.

**Session replays and heatmaps (free tier only)**

- Replays sampled at **20% of sessions** (about 3,000 a month at 500 daily actives, under the free 5,000) and capped by the $0 billing limit; if the quota runs out, recording simply stops until next month.
- Privacy masking by default: all inputs masked; all text masked inside post bodies, comments, chat, CV, profile "about", survey strip and any element marked `data-ph-mask`; images in posts and chat blocked.
- Never recorded: `/chat/*`, `/settings/billing`, `/ops/*`, `/signin`, `/signup`, password reset pages.
- Heatmaps enabled on marketing pages, Home, Opportunities and onboarding.
- Recordings are kept for PostHog's free retention (currently 30 days) and viewed only by Skilient staff; never shared with universities or recruiters.

**Privacy rules**

- PostHog project in the EU region; no content, names or emails leave our systems for analytics.
- Universities and recruiters never see raw events, replays or heatmaps; university dashboards use our own aggregates only.
- Analytics, replays and error tracking are named in the user agreement (heading 11, "Account deletion and data retention", in 5.27) and in the privacy notice, including that sessions may be recorded with content masked.
- A user's PostHog person and recordings are deleted through the PostHog API when their account deletion completes (5.25).

**Incidents:** Sev 1 (site down or data exposed) — respond within 30 minutes, written postmortem in `.claude/wiki/incidents/YYYY-MM-DD-slug.md`; Sev 2 (signup, feed, chat or payments broken) — within 2 hours; Sev 3 — next working day.

**Build notes**

- `instrumentation.ts` + `sentry.*.config.ts`; `lib/log.ts` (JSON logger with `request_id` from a header set in `proxy.ts`); `lib/analytics.ts` wraps `posthog-node` with a typed event map so unknown events fail typecheck; `PostHogProvider` client component with `autocapture: false`, `session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask], .post-body, .chat, .cv' }`, `enable_heatmaps: true`, and a route blocklist that calls `stopSessionRecording()`.
- Env vars: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build only), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (EU), `POSTHOG_PERSONAL_API_KEY` (server, for deletion), Axiom via the Vercel integration.
- **Done when:** a thrown error in each runtime reaches Sentry with its release and no personal data; a log line can be found in Axiom by `request_id`; stopping the database turns `/api/health` red and emails an alert within 10 minutes; a failed job emails within 10 minutes; PostHog shows the named events only (autocapture off); a replay of a feed session shows masked post text and no chat; account deletion removes the PostHog person.

### Security (decided 2026-09-25)

Main risks: cross-university data leaks, recruiters scraping students, account takeover, rank gaming (5.13), staff misuse (5.26), payment fraud (4b.12), abuse and spam, and the reference-build bugs found in the audit. This section complements the RLS matrix and 4b.12.

**Accounts and sign-in**

- Passwords ≥ 10 characters, checked against a breached-password list (5.27).
- Failed sign-ins: after 5 failures in 15 minutes for an account or IP, Turnstile is required; after 10, the account is locked for 15 minutes and the owner is emailed.
- **Two-factor (TOTP authenticator app): required** for recruiters, university admins and Skilient staff; **optional** for students and faculty (Settings → Security). Recovery codes shown once at setup. Required roles can't reach their portals until enrolled (`aal2` checked in `proxy.ts` and in RLS helpers for their data).
- Sessions: rotating refresh tokens, 30-day lifetime; "Sign out of all devices" in settings; a password change ends every other session.
- **New-device sign-in alert:** an email (device, browser, approximate location, time) with a "This wasn't me" link that signs out all sessions and starts a password reset.
- Email change: confirmed from both the old and the new address.

**Who can see what**

- RLS on every table, default deny. An automated RLS test suite per table asserts that another university's student, a stranger, a recruiter without entitlement and a signed-out visitor are each refused.
- Every `security definer` function checks `auth.uid()` and sets a fixed `search_path`. The service-role key is used only in Edge Functions and jobs, never in pages or server actions that act for a user.
- Recruiter access to student data only through functions that check entitlement and quota (4b); the recruiter API only covers students who interacted with that organisation; API keys stored hashed, scoped, rate-limited and revocable.
- **Profiles are visible only to signed-in users.** No public profile pages, no profile URLs in the sitemap; `noindex` on all signed-in routes. Verified CV share links (5.18) and `/verify/[code]` stay public.
- Anti-scraping: students may open 300 profiles a day, recruiters per plan; search is capped at 20 results per page and 60 searches an hour; usernames can't be enumerated sequentially (profile lookups by exact username only, no incremental ids exposed).

**Web application**

- Headers (set in `next.config.ts` and `proxy.ts`): Content-Security-Policy with per-request nonces (scripts only from self, Supabase, PostHog, Sentry, Turnstile and the payment gateways; no inline scripts without the nonce), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera, microphone and geolocation, `X-Content-Type-Options: nosniff`.
- Cookies HttpOnly, Secure, SameSite=Lax; server actions keep Next.js's origin check.
- User content (posts, comments, chat, bios) is rendered as text, never as HTML; links get `rel="noopener nofollow ugc"`.
- **Image uploads are re-encoded server-side** (Edge Function with an image library): EXIF and GPS data stripped, type detected from file bytes, max 6,000 × 6,000 px; anything that fails to decode is rejected.
- Link previews are SSRF-protected (5.28).
- **Cloudflare Turnstile** (free, usually invisible) on signup, on sign-in after failures, on "Request your university" and on the university and recruiter contact forms; verified server-side.
- Rate limits through `rate_limit_events` on every write action (values in each feature section).

**Secrets and dependencies**

- Secrets in Vercel environment variables and Supabase Vault; the GitHub App private key and payment keys rotated every 6 months or at once on suspicion.
- `gitleaks` in CI **blocks** any commit containing a secret (the one hard CI block, since a leaked key can't be taken back).
- Dependabot weekly update pull requests; `npm audit` fails CI on critical vulnerabilities only; lockfile committed and versions pinned.

**Data protection**

- TLS everywhere; Supabase encrypts data at rest.
- Private buckets (`cv-exports`, `feedback`, org verification documents, chat media) served only through signed URLs that expire in 5 minutes.
- **Backups:** Supabase's included daily backups, kept 7 days (on the Supabase Pro plan, which production needs anyway because free projects pause); no paid point-in-time recovery at launch. One full restore drill into a scratch project before launch, documented in the wiki.
- Retention: security events 1 year, logs 30 days, analytics events 13 months, deleted accounts purged after the 14-day cooling-off (5.25).
- Legal posture: follow the principles of Pakistan's draft Personal Data Protection Bill (collect only what's needed, state purposes, allow deletion); PECA 2016 governs content moderation and takedowns.

**Testing before launch (free route, no paid pen test)**

- OWASP ASVS Level 1 checklist completed and filed in the wiki.
- OWASP ZAP baseline scan against staging in CI (weekly and before launch), no high findings open.
- Security review of every migration and server action (Claude Code `/security-review` on each pull request that touches them).
- RLS test suite green.
- Every reference-build bug fixed with a regression test: `github-sync` trusting a client-supplied user; the GitHub token exposed in the client session; over-broad unfriend and block deletes; chat RLS `USING (true)`; invite joins keyed by owner instead of post.

**Reporting and response**

- `/.well-known/security.txt` and a security@ mailbox; no bug bounty at launch.
- A data breach is a Sev 1 (observability section): contain, then tell affected users within 72 hours what happened and what to do; postmortem in the wiki.

**Build notes**

- `lib/security/headers.ts` (CSP builder with nonce), `lib/security/turnstile.ts` (server verification), `lib/security/rate-limit.ts` (wrapper over `rate_limit_events`), `supabase/functions/image-ingest` (re-encode and strip metadata, then move to the final path), `security_events(user_id, kind, ip_hash, user_agent, meta, created_at)`, `user_devices(user_id, device_hash, first_seen_at, last_seen_at)` for new-device alerts.
- CI jobs: `gitleaks` (blocking), `npm audit --audit-level=critical`, RLS tests (`supabase test db` with pgTAP), ZAP baseline (weekly).
- **Done when:** every table has RLS and a passing refusal test; a recruiter or university admin without two-factor can't open their portal; an uploaded photo's GPS data is gone; a signed-out visitor can't open any profile; CSP reports no violations on every screen in the Screen spec; the ASVS L1 checklist is complete; the restore drill succeeded.

#### Build: quality, observability and delivery

- **CI (GitHub Actions) on every PR:** typecheck, ESLint, unit tests (Vitest), pgTAP against a fresh database, Playwright E2E against the preview deployment and its Supabase branch, visual regression on the UI gallery, gitleaks (blocking), `npm audit` (critical only); Lighthouse CI and bundle-size budgets report only (Performance leeway rule).
- **E2E suite:** multi-account scenarios with seeded test users created through the GoTrue admin API in a disposable project: signup and onboarding, join and chat, friends and block, report and suspend, GitHub import with a fixture App installation, CV export and verify, recruiter plans and credits, billing lifecycle in gateway sandboxes, job fair queue.
- **Errors and logs:** Sentry for Next.js (client, server, edge) and Edge Functions, with user id and action name tags (no personal data in breadcrumbs); structured JSON logs from Edge Functions.
- **Product analytics:** PostHog (self-serve cloud, EU region) with a typed `track(event, props)` wrapper; events defined for every success metric in section 3 (signup, onboarding complete, GitHub connected, venture joined, contribution logged, CV exported, contact request sent, plan purchased); no PII in properties.
- **Uptime:** UptimeRobot on `/` and `/api/health` every 5 minutes; alerts to the founder's email (see "Observability, monitoring and analytics").
- **Backups:** Supabase's included daily backups (7 days, Pro plan), no paid point-in-time recovery; one restore drill before launch, then one every quarter.
- **Release:** merges to `main` deploy to staging automatically; production deploys are promoted manually after the staging E2E run passes; database migrations run before the app deploy.
