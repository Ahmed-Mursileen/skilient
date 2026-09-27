## 11. Build sequence

Build order decided 2026-09-25: **vertical slice first**. One student journey (signup → GitHub → venture → post → survey) works end to end before any other portal is built; everything else widens from that slice. No calendar dates: each phase starts when the previous phase's "done when" passes. Every phase is verified with real accounts (at least two, at different universities) before the next starts. One phase may be split into several pull requests, but a phase is only done when all its checks pass together.

| Phase | Scope | PRD sections | Done when |
| --- | --- | --- | --- |
| 0. Foundations | Repo, TS strict, Tailwind v4 tokens and fonts, brand SVGs, Supabase project (Mumbai) with migrations in the repo, Vercel (`bom1`), CI (typecheck, lint, pgTAP, gitleaks), RLS test harness, Sentry, JSON logging, `/api/health`, `.env.example`, UI gallery | 7, 9, Security, Observability | A fresh clone plus `supabase db reset` rebuilds everything; the preview deploy is green; every primitive renders in light and dark |
| 1. Identity | Signup (email and university Google), agreement acceptance, email verification, 2FA plumbing, 6-step onboarding, profiles and privacy basics, HEC universities and domains seed, `proxy.ts` gates, `staff_roles` | 5.2, 5.4, 5.27 | Two students at different universities sign up and onboard; neither can read the other university's data; a personal email is refused |
| 2. Proof core | GitHub App connect and identity binding, import pipeline, taxonomy v1, L1–L2 levels, skill drawer, ventures with roles, visibility and lifecycle, contribution log | 5.5, 5.7, 5.14, 5.15, 5.28 (ventures) | A real GitHub account produces correct L2 skills; spoofed commits never count; a venture completes with peer-verified contributions |
| 3. Social core | Feed algorithm, stages and micro-survey, comments, polls and events, chat (DM and venture group), friends and blocking, notifications and email prefs, explore, reports with a minimal `/ops` moderation queue | 5.6, 5.8–5.12, 5.28 | Cross-account E2E flows pass; a survey question never changes for a reader; a non-member can't read a thread |
| **Slice checkpoint** | The student journey end to end: signup → GitHub → venture → post → survey → chat | — | 10 internal testers use it for a week with no Sev 1 or Sev 2 bugs open |
| 4. Trust and ranking | Peer endorsements, L3–L4, code checks (Skilient reviewer grading until teachers exist), credentials, ranking jobs, decay, tiers, leaderboard, score page | 5.13, 5.16, 5.17, 5.19 | pgTAP fixtures match hand-calculated scores for 10 reference students; tiers assign correctly on 1,000 synthetic students |
| 5. Verified CV | Snapshot, canonical JSON, signing, verify page, share links, PDF export (entitlement stubbed until phase 10) | 5.18 | Tampering one byte shows Altered; every template passes the ATS text test |
| 6. Student portal | Shell with five areas, progress card, Opportunities hub, Me pages, privacy centre, graduate state, account deletion, tour, tooltips, first-visit tips, checklist, feedback centre | 5.25, 5.27 | Every page has loading, empty and error states; the tour works by keyboard alone |
| 7. Teacher portal | Teacher verification, project ideas, supervision, reviews, teacher endorsements, code-check grading queue | 5.21 | Parallel claims never double-assign a check; the CV shows the faculty badge without a score |
| 8. Recruiter portal | Org signup and verification, talent search (Explore and full), contact requests, jobs and pipeline, hires and 90-day outcome, competitions, shortlists, analytics, API | 5.20 | Explore can't return names even via direct queries; salary-less posts are refused |
| 9. University portal | Claim, roles, ecosphere customisation, student records, dashboards, announcements targeting, events and check-in, job fairs, hackathons | 5.22, 5.23 | A Basic university gets no individual records via direct RPC; a job-fair queue stays consistent with 200 concurrent students |
| 10. Billing | B1–B6 from 4b: entitlements, gateways, checkout, invoices and tax, sponsorship, staff billing tools | 4a, 4b, 5.24 | Real test transactions in PKR and USD; registry and concurrency tests pass |
| 11. Ops portal (full) | All queues, sanctions, appeals, view-as, org verification, platform config, metrics | 5.26 | Every staff write has an audit row; a moderator can't suspend beyond 7 days |
| 12. Marketing site | Landing, recruiters, universities, faculty, about, pricing, university requests | 5.1 | Lighthouse mobile ≥ 90; content visible with JavaScript off |
| 13. Hardening | ASVS L1 checklist, ZAP scan, CSP on every screen, both design gates on every screen, accessibility pass, PostHog and alerts wired, load test at 300 concurrent users, restore drill | Performance, Observability, Security | Every technical item in the launch gate (section 4) is green |

After phase 13: closed beta at NUTECH → fixes → launch gate → public launch (section 4). Each trust phase depends on the one before it, because the CV and ranking are only as trustworthy as their inputs.

**Rebrand to Skilient** (do this in milestone 0, before any user-facing copy ships)

- [ ] Register the domain and point Vercel and DNS at it; redirect `techshiner.tech` to it
- [ ] Verify the new sender domain in Resend and switch Supabase Auth SMTP from team@techshiner.tech
- [ ] Register the Skilient GitHub App (name, callback and webhook URLs) and update Supabase Auth site and redirect URLs
- [ ] Replace logos and favicon (`public/logo-*`, `app/logo-full-light.png`, `app/favicon.ico`), app metadata and OG image
- [ ] Replace "TechShiner" in UI copy, email templates, announcement categories and the `package.json` name
- [ ] Rename the repo and docs (`docs/techshiner-*.md`, `.claude/company-context.md`, `CLAUDE.md`) and update internal links
- [ ] Check trademark and social handle availability for "Skilient"
