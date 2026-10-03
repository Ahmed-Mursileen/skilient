# Phase 13: questions for Ahmed

One list for the whole phase (CLAUDE.md). Each has a recommended default. Slice 1 is built on the defaults marked
**(slice 1)**; answering differently changes it in a follow-up. Answered items move to `docs/decisions.md`.

## Open

### Analytics (slice 1)

1. **(slice 1) Server events path.** PRD 10 says `posthog-node` from server actions. Recommended: a transactional outbox
   instead (database triggers → pgmq `analytics` → `analytics-worker` → PostHog batch API). It also catches events that
   happen in jobs and webhooks (subscription started, first L2 skill, venture completed), never adds time to a request,
   and only ids and enums leave the database. *Default: outbox.*
2. **(slice 1) Replay masking.** PRD masks text in posts, comments, chat, CV, "about" and the survey strip, but also says no
   names leave our systems, and names appear on almost every screen. Recommended: mask **all** text and inputs and block
   every user-uploaded image (avatars, post and chat images); replays still show layout, clicks and navigation.
   *Default: mask everything.*
3. **(slice 1) Same-origin proxy.** Send PostHog traffic through `/ingest` on our domain (CSP stays `'self'`, ad blockers
   don't drop events). Turn on "Discard client IP data" in PostHog. *Default: yes.*
4. **(slice 1) Storage for signed-out visitors.** `localStorage` only, no analytics cookie, no consent banner (analytics are
   named in the privacy notice); reset on sign-out. *Default: yes.*
5. **(slice 1) Never-recorded routes.** PRD list (`/chat`, `/settings/billing`, `/ops`, `/signin`, `/signup`, password
   reset) plus every page that carries a secret or token: `/settings/security`, `/settings/account`, `/billing`,
   `/org/billing`, `/uni/billing`, `/auth`, venture chat, CV share links, invite and join links, request confirm and
   unsubscribe, `/verify/[code]`, event check-in. *Default: yes.*
6. **(slice 1) Quota guard.** At 500 daily actives the event list lands near the free 1M a month (survey answers and chat
   messages are the biggest). Staff can mute an event in `/ops/config` (`analytics.muted_events`) without a deploy.
   *Default: send everything, mute only if the quota nears its limit.*
7. **PostHog dashboards.** The eight PRD dashboards are defined in `docs/analytics.md`; you build them in the PostHog UI
   (about 20 minutes), or I add a script that creates them through the API. *Default: you build them from the doc.*

### Alerts (slice 2)

8. **Alert recipient.** One address in `/ops/config` (`alerts.recipients`), set by you after deploy. *Default: yes.*
9. **Performance alert.** Speed Insights has no alerting on our plan. Recommended: our own sampled web-vitals beacon (10% of
   page loads, kept 14 days) checked daily by `job-watchdog` against the p75 targets; Speed Insights stays for dashboards.
   *Default: yes.*
10. **Database CPU alert.** CPU isn't visible from SQL. Recommended: Grafana Cloud (free) scrapes Supabase's metrics
    endpoint with a dedicated, revocable secret key and alerts on CPU > 80% for 10 minutes (the same account runs k6).
    Connections are also checked from SQL by the watchdog. *Default: Grafana Cloud.*
11. **Email bounce rate.** Resend webhook (`email.delivered`, `email.bounced`) → `/api/resend/webhook` (signed) → daily
    counts → alert above 5%. *Default: yes.*
12. **5xx alert before Vercel Pro.** The Axiom monitor needs Vercel Pro. Until then: a Sentry alert on error volume.
    *Default: interim Sentry alert.*

### Security (slice 3)

13. **ZAP target.** There is no staging. Run the ZAP baseline in CI against the production build on the local stack
    (weekly, manual, and on pull requests that touch `proxy.ts`, `next.config.ts` or `lib/security/`), plus one manual
    run against production before launch. *Default: yes.*
14. **Where to file.** There is no wiki: ASVS checklist in `docs/security/asvs-l1.md`, incident postmortems in
    `docs/incidents/`. *Default: yes.*
15. **CSP reports.** `report-to` → `/api/csp-report` (rate-limited, logged, sampled to Sentry). *Default: yes.*

### Restore drill and load test (slices 4–5)

16. **Supabase plan for the drill.** The Free plan has no daily backups. Recommended: run the drill now as a logical dump
    (GitHub workflow: production → scratch), and repeat it from a daily backup once you move to Pro before the beta.
    *Default: yes.*
17. **Load-test target.** Never production. A scratch Supabase project on the compute size production will launch on, with a
    Vercel preview pointed at it; synthetic data (5,000 accounts over 3 universities, about 20,000 posts, chats, one job
    fair). If a target misses only from CPU, re-run one size up and record the cost. *Default: yes, Micro first.*
18. **k6 runner.** Grafana Cloud k6 free tier (500 VU-hours a month; one run is about 160) from its Mumbai load zone, if
    the free tier allows 300 users in one test; otherwise k6 on a short-lived Mumbai VM. *Default: Grafana Cloud.*

### Design gates (slices 6–8)

19. **Depth.** Polish screens that pass; redesign only a screen that fails Gate A. Include the deferred phase 8 candidate
    drawer; keep move buttons for shortlist order (no drag). *Default: yes.*
20. **Slice order.** Analytics, alerts, security, restore drill, load test, then the three design-gate slices.
    *Default: as listed in `docs/hardening-plan.md`.*

## Answered

None yet.
