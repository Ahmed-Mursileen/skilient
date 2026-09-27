# Build plan

Vertical slice first: one student journey (signup → GitHub → venture → post → survey → chat) works end to end before anything else is widened. No calendar dates — a phase starts when the previous phase's checks pass. Verify every phase with at least two real accounts at two different universities. Work one phase (or one slice of it) per session/PR, and tick boxes here as they pass.

Legend: 📖 = PRD files to read (in `docs/prd/`), ✅ = done-when checks.

---

## Phase 0 — Foundations

📖 `07-architecture-and-tech-stack.md`, `09-design-system-and-ux.md`, `10-non-functional-requirements.md` (Performance, Observability, Security), `06-data-model.md` (Build: database workflow), `docs/setup-checklist.md`

- [x] Next.js 16 app, TS strict, pnpm, ESLint rules (no service-role imports outside allowed folders, no `getSession()` in server code)
- [x] Tailwind v4 tokens from PRD 9.2–9.4 (`app/styles/tokens.css` + `@theme inline`), fonts via `next/font`, ThemeProvider (default `system`)
- [x] `brand/` SVGs copied to `public/brand/`; favicon and app icon wired
- [x] Supabase project (Mumbai) linked; `supabase/migrations/`, `seed.sql`, pgTAP harness; Vercel project pinned to `bom1` — *linked and migrated by CI on merge to `main` (2026-09-27); Vercel function region confirmed `bom1` by Ahmed*
- [x] CI: typecheck, lint, Vitest, pgTAP on fresh `db reset`, gitleaks (blocking), `npm audit` (critical), Lighthouse CI + size-limit (report only) — *green on PR and on `main` (run 36344493529), plus Supabase advisors*
- [x] Sentry (client/server/edge), JSON logger with `request_id`, `/api/health`, `job_runs` table
- [x] `components/ui/` primitives + dev-only UI gallery in both themes
- [x] `.env.example` with names only

✅ A fresh clone + `supabase db reset` rebuilds everything · preview deploy green · every primitive renders in light and dark · axe-core clean on the gallery

*Status 2026-09-27: every box ticked. db reset + pgTAP pass in CI; every primitive renders in both themes and axe-core is clean (desktop + phone); preview deploy green (`/api/health` 200 on 723db53). Vercel function region confirmed `bom1`. Phase 0 closes when the Realtime health-check fix is on `main` and production `/api/health` returns 200.*

## Phase 1 — Identity

📖 `05-02-authentication.md`, `05-27-signup-onboarding-and-learning-the-platform.md`, `05-04-profiles.md`, `05-23-university-portal.md` (HEC seed only), `08-security-privacy-and-rls.md`, `10-…` (Security: accounts and sign-in)

- [x] HEC universities + `university_domains` seed; cached public domain list — *283 universities from `supabase/seed/hec_universities.csv` via a generated sync migration; `/api/universities/domains`. Only NUTECH's domain is verified so far (see decisions.md)*
- [x] Signup: email/password and university-only Google; Auth hook `validate_signup`; breached-password check; Turnstile — *Google needs the hook enabled in the dashboard; see decisions.md*
- [x] Email verification (code + magic link); agreement versions + acceptance + re-accept gate (template headings only)
- [x] 2FA plumbing (TOTP, `aal2` checks) ready for later required roles; new-device alert email; `security_events` — *recovery codes are an open question (decisions.md)*
- [x] Six-step onboarding wizard with resume; `proxy.ts` gates; `CurrentUserProvider` — *GitHub, skills and ventures steps are shells until phase 2/3*
- [x] Profiles: view/edit, visibility, avatar/cover with server-side image re-encode (EXIF/GPS stripped); signed-in only — *re-encode runs in a server action with sharp, not an Edge Function (decisions.md)*
- [x] `staff_roles` + `is_staff()` (no ops UI yet) — *a role counts only on an aal2 session*

✅ Two students at different universities sign up and onboard · neither can read the other's university data (pgTAP + E2E) · personal and non-university Google emails refused · sign out → sign in as another user shows zero residue

*Status 2026-09-27: every box ticked, in three stacked PRs (slice 1 database, slice 2 auth, slice 3 onboarding and profiles). Done-when: two students (NUTECH and FAST) sign up through the UI and onboard (E2E); cross-university reads are refused in pgTAP (`05_profiles_rls`) and in E2E through the UI and the API; personal and non-university Google emails are refused by the hook (pgTAP `04_signup_gate`, E2E for the callback); zero residue after switching accounts, across tabs (E2E). Hosted-project settings still to do by hand are listed in the PRs. Only NUTECH's email domain is verified; the rest need checking before public launch.*

## Phase 2 — Proof core

📖 `05-05-github-skill-extraction-and-verification.md`, `05-07-ventures-and-join-flows.md`, `05-14-contribution-log.md`, `05-15-venture-lifecycle.md`, `05-28-…` (Ventures section)

- [ ] GitHub App: install/callback with server-side identity binding; tokens in Vault; webhook route
- [ ] pgmq pipeline (discover → classify → harvest → extract → prs → level); taxonomy v1 YAML + detectors with unit tests
- [ ] L1–L2 levels, anti-gaming holds, skill drawer, Settings → GitHub
- [ ] Ventures: create, roles, visibility, invites, apply with questions, max 6 members, lifecycle state machine, deliverables (members only), updates, follows
- [ ] Contribution log (insert-only, corrections, confirmations, GitHub-sourced entries)

✅ A real GitHub account produces the expected L2 skills · spoofed `user.email` commits never count · webhook replay is idempotent · a venture completes only with ≥ 2 members, a deliverable and peer-verified contributions · a 7th member can't join under parallel accepts

## Phase 3 — Social core

📖 `05-06-…`, `05-28-feed-micro-survey-ventures-and-chat-detail.md`, `05-08-friends-and-blocking.md`, `05-09-chat.md`, `05-10-explore.md`, `05-11-notifications-requests-and-announcements.md`, `05-12-moderation-and-admin.md`, `05-26-…` (queues + moderation only)

- [ ] Posts (all types except Shipped wiring), audience, composer, images, link previews (SSRF-safe), comments, polls, events
- [ ] Micro-survey: assignment on first view, one answer per reader, tick/cross strip, public line, anti-gaming weights
- [ ] Feed algorithm: stages job, `feed_page` scoring, `feed_sessions` paging, exploration slots
- [ ] Friends, blocking, DMs, venture group chat, typing, read receipts, replies, reactions, pins, search
- [ ] Notifications (triggers, Realtime bell, email prefs + digest), explore/search
- [ ] Reports + minimal `/ops` moderation queue with `ops_audit_log`

✅ Cross-account E2E flows pass · a reader's survey question never changes and a second answer is refused · paging returns no duplicates · a non-member can't read or join a thread via direct API · unfriend/block affect only the pair

## ★ Slice checkpoint

- [ ] Signup → GitHub → venture → post → survey → chat works end to end on staging
- [ ] 10 internal testers use it for a week; no Sev 1/Sev 2 open

## Phase 4 — Trust and ranking

📖 `05-13-ranking-system-formula-v1.md`, `05-16-peer-endorsements.md`, `05-17-live-leaderboard-and-tiers.md`, `05-19-credentials.md`, `05-05-…` (L3–L4, code check)

- [ ] Endorsements with limits and ring detection; L3 from PRs/confirmations; L4 from evidence-tied endorsements and code checks (Skilient reviewers grade until teachers exist)
- [ ] Credentials upload + staff review
- [ ] Ranking SQL functions per component, nightly compute, decay with exam pauses, tiers with hysteresis, snapshots
- [ ] Leaderboard (scopes, opt-out) and `/me/score`

✅ pgTAP fixtures reproduce hand-calculated scores for 10 reference students · tiers correct on 1,000 synthetic students · decay pauses during an exam period

## Phase 5 — Verified CV

📖 `05-18-verified-cv.md`

- [ ] Snapshot builder, RFC 8785 canonical JSON, Ed25519 signing (Vault key), codes, `/verify/[code]` statuses, share links (Spark+), monthly refresh job, PDF export (entitlement stubbed until phase 10), ATS templates

✅ Tampering one byte of a PDF shows Altered · revoked shows Revoked · every template passes the ATS text test · key rotation keeps old CVs valid

## Phase 6 — Student portal and learning layer

📖 `05-25-student-portal.md`, `05-27-…` (tutorial, feedback)

- [ ] Five-area shell (sidebar + bottom tabs from `lib/nav.ts`) with tooltips; progress card; Opportunities hub; Me pages; privacy centre; notification settings; graduate state; account deletion with cooling-off
- [ ] Guided tour, first-visit tips, getting-started checklist, teaching empty states, feedback centre

✅ Every tab and Me page has loading/empty/error states · tour works by keyboard alone · "For you" never orders by sponsorship · a graduate can't post to the University Feed

## Phase 7 — Teacher portal

📖 `05-21-teacher-portal.md`

- [ ] Teacher verification, ideas, supervision, reviews, teacher endorsements, code-check grading queue with claim and 48 h fallback

✅ Parallel claims never double-assign a check · a teacher can't endorse outside reviewed/supervised ventures · CV shows the faculty badge without a score

## Phase 8 — Recruiter portal

📖 `05-20-recruiter-portal.md`

- [ ] Recruiter signup + `/org/join` + staff verification; 2FA required
- [ ] Talent index + search (Explore anonymised, full with entitlement); candidate view; contact requests; jobs + pipeline; hires + 90-day outcome; competitions; shortlists; analytics; API + webhooks

✅ Explore can't return names or photos even via direct view queries · protected attributes aren't filterable · salary-less posts refused · declined students can't be re-contacted for 90 days

## Phase 9 — University portal

📖 `05-22-multi-university-and-global-feed.md`, `05-23-university-portal.md`

- [ ] Claim flow, admin roles, ecosphere customisation (contrast-checked), student records with access log, dashboards (groups ≥ 5), announcements targeting, events + QR check-in, job fairs, hackathons, moderation hide

✅ A Basic university gets no individual records via direct RPC · every record view is logged · a job-fair queue stays consistent with 200 concurrent students

## Phase 10 — Billing

📖 `04a-business-model-and-monetisation.md`, `04b-paid-feature-implementation.md`, `05-24-billing-and-organisation-admin.md`

- [ ] B1 entitlements + quotas + registry · B2 gateways, checkout, webhooks, lifecycle · B3 add-ons, hire fees, invoices, tax · B4 sponsorship sync · B5 staff billing tools · B6 end-to-end PKR and USD

✅ Registry and concurrency tests pass · every lifecycle test passes in sandbox · real test transactions in PKR and USD

## Phase 11 — Ops portal (full)

📖 `05-26-admin-portal-skilient-ops.md`

- [ ] All queues with claiming, sanctions, appeals, view-as, org verification, university onboarding, platform config (versioned), metrics, audit log view; 2FA required

✅ Every staff write has an audit row · a moderator can't suspend beyond 7 days or open a chat outside a report · an appeal can't be decided by the original staff member

## Phase 12 — Marketing site

📖 `05-01-marketing-and-public-pages.md`

- [ ] Landing (15 sections, university email detection, focal hero motion, tier ladder), recruiters/universities/faculty pages, about, pricing, university requests, SEO

✅ Lighthouse mobile ≥ 90 · hero fits the first screen at 1280×720 and 390×844 · content visible with JavaScript off · live numbers hidden below 200

## Phase 13 — Hardening

📖 `10-non-functional-requirements.md` (all three subsections), `08-security-privacy-and-rls.md`, `04-scope-and-launch-plan.md` (launch gate)

- [ ] ASVS L1 checklist filed · ZAP baseline with no high findings · CSP clean on every screen · both design gates on every screen in `docs/screen-spec.md`
- [ ] PostHog events, replays (masked) and heatmaps; all alerts wired and tested
- [ ] k6 load test at 300 concurrent users for 30 minutes meets every performance target
- [ ] Restore drill into a scratch project

✅ Every technical item of the launch gate is green

---

## After the build (see `04-scope-and-launch-plan.md`)

- [ ] Business track complete (company, merchant accounts, agreement and privacy text, domain, 3 partner universities incl. NUTECH, ≥ 1 paying recruiter, 10+ teachers per partner)
- [ ] Closed beta at NUTECH: ≥ 200 students, 4 weeks; exit criteria met
- [ ] Launch gate passed
- [ ] Public launch: signup open to every HEC university
- [ ] Hypercare (2 weeks), then weekly reviews for 3 months
