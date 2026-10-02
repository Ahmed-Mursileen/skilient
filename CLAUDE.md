# CLAUDE.md — Skilient

Skilient is a university-gated social platform for Pakistani students: they prove skills through real project work (GitHub evidence, ventures, peer and faculty verification) and turn that proof into a signed, verifiable CV that recruiters trust. Recruiters, faculty and universities each have their own portal. The whole platform launches once, complete.

## Where the spec lives

- `docs/prd/` — the PRD, one file per section. **Start with `docs/prd/README.md`** (index). Read only the sections the current phase lists.
- `docs/screen-spec.md` — every screen: route, layout, key elements, states, and the two design gates.
- `docs/build-plan.md` — the phases, in order, each with its PRD sections and "done when" checks. **This is the source of truth for what to build next.**
- `docs/decisions.md` — every product decision so far, dated, with reasons. Append new ones.
- `docs/setup-checklist.md` — accounts and keys a human must create; never invent values.
- `brand/` — final logo SVGs (Editorial: ink #0E0D0B, vermillion #C03910). Copy into `public/brand/` in phase 0.
- `design/tokens-figma-ramps.json` — colour ramps from the Figma frames; semantic tokens are in PRD section 9.
- `docs/reference/` — the original Figma frames (PDF).

Precedence when documents disagree: a feature section (5.x) beats section 6 (data model); 5.28 beats 5.6/5.7/5.9/5.15; 5.27 replaces 5.3; `docs/decisions.md` (newest entry) beats everything. If still unclear, ask — don't guess.

## Stack (fixed — don't swap without asking)

Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 (CSS-first, `@theme inline`, no config file), Supabase (Postgres + RLS, Auth with PKCE via `@supabase/ssr`, Realtime, Storage, Edge Functions, pg_cron, pgmq, Vault), Vercel (`bom1`), Supabase region Mumbai (`ap-south-1`), Resend, Sentry, PostHog (EU), Axiom, Cloudflare Turnstile. pnpm, Node 22. Fonts: Spectral (display, h1, h2), Barlow (h3 down, body), JetBrains Mono (code/data only), self-hosted via `next/font`; Montserrat only inside the wordmark SVG. Icons: Phosphor.

## Never

- No AI/LLM API anywhere in the product (no Claude, OpenAI, etc.). Summaries, questions and grading are templates or humans.
- No likes, reactions, saves or share-to-chat on posts. No video anywhere. No public profile pages.
- Never sell rank or visibility; never order search, leaderboards or "For you" by payment.
- No service-role key in pages, client code, or server actions acting for a user (only Edge Functions, jobs, billing worker).
- No table without RLS (default deny) and a pgTAP refusal test. No `getSession()` in server code; use `getUser()`.
- Never trust a user id, GitHub username, price or entitlement from the client.
- No schema changes outside `supabase/migrations/`; never edit the database by hand.
- Never commit secrets (gitleaks blocks it).

## Skills

Use the Postgres best-practices skill for every migration, RLS policy and query; the PRD and decisions.md take precedence where they differ.

## How to work

1. At the start of a session: read this file, `docs/build-plan.md`, and only the PRD sections for the current phase.
2. Work one phase (or one slice of a phase) per session/PR. Don't start the next phase until the current one's "done when" checks pass.
3. Every server action: Zod input, `getUser()`, explicit ownership check, `{ count: "exact" }` write check, typed error, JSON log line with `request_id`.
4. Every screen: loading, empty and error states; light and dark; keyboard-operable; passes the design gates in `docs/screen-spec.md`.
5. Before finishing: typecheck, lint, unit tests, pgTAP, and the phase's E2E tests all green. Tick the phase's boxes in `docs/build-plan.md`.
6. Log any decision or deviation in `docs/decisions.md` (dated one-liner + why). If the spec is ambiguous or two sections conflict, ask the owner (Ahmed) instead of picking.

## Working efficiently (token discipline)

Quality rules above still apply in full; these rules only cut waste.

**Reading**
- Read only the PRD sections the current slice needs. Use grep or line offsets instead of whole files once you know where something is.
- Don't re-read files you've already read in this session unless they changed.
- Pipe long command output through `tail -n 40` or `grep`; never paste full logs, full test output or full diffs.

**Planning and questions**
- Ask all questions for a phase in ONE list at planning time, each with a recommended default. After Ahmed answers, build on those answers without asking again. If something new comes up mid-slice, pick the safest default, log it in docs/decisions.md, and list it in the final report.

**Building and testing**
- One slice per session. When a slice is merged, the next slice starts in a fresh session.
- Locally, run typecheck, lint and only the tests for the code you changed. The full suite runs in CI.
- Prefer fewer, larger slices when a phase's pieces are small.

**CI**
- Push when local checks pass, then STOP. Do not poll, wait for or re-run CI. If CI fails, Ahmed pastes back the failing lines; fix only those.
- Never loop on a failing check more than twice. Stop and report what's failing and your best guess why.

**Reporting**
- Final report per slice: at most 15 lines. What changed, what Ahmed must do by hand, and anything failing or deferred. No recap of the plan.
- Put detail in the repo (docs/decisions.md, checklists), not in chat.

**Tools**
- No subagents, parallel reviews or extra verification passes unless Ahmed asks.

## Commands

```bash
pnpm dev            # dev server (UI gallery at /ui)
pnpm build          # production build (ENABLE_UI_GALLERY=1 keeps /ui)
pnpm lint           # ESLint, zero warnings (includes the service-role / getSession / REST guards)
pnpm typecheck      # next typegen && tsc --noEmit
pnpm test           # Vitest (tests/unit)
pnpm test:e2e       # Playwright + axe against `pnpm start` on :3100 (build first)
pnpm size           # size-limit report
pnpm db:start       # supabase start: local stack (Docker)
pnpm db:reset       # supabase db reset: rebuild local DB from migrations + seed
pnpm db:test        # supabase test db: pgTAP (supabase/tests)
pnpm db:types       # regenerate types/database.ts (CI fails if stale)
```

Supabase CLI: Ahmed doesn't run it locally. CI runs the local stack for pgTAP, the stale-types check and `supabase db advisors --fail-on warn` on every PR, and on merge to `main` links the hosted project (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` repo secrets) and runs `supabase db push`. The `db:*` scripts are for sessions or machines that have Docker. In cloud sessions, `.claude/hooks/session-start.sh` runs `pnpm install`, starts Docker and sets `PW_CHROMIUM_PATH`; run `pnpm db:start` yourself when a task touches the database (about a minute, longer on a fresh container). The hook does nothing on local machines.

Local setup: `cp .env.example .env.local`, then `pnpm db:start` and fill `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `pnpm exec supabase status`. If Playwright's own browser isn't installed, set `PW_CHROMIUM_PATH` to a local Chromium.

Next.js 16 differs from older versions (`proxy.ts`, not `middleware.ts`; async `cookies()`); its docs ship in `node_modules/next/dist/docs/` (see `AGENTS.md`). Read them before using an API you're unsure of.

## Code map (phase 0)

- `app/styles/tokens.css`: every PRD 9 token as CSS variables (`:root`/`.light`, `.dark`). `app/globals.css` maps them with `@theme inline`. Utilities: `bg-bg-surface`, `text-text-primary`, `text-text-error`, `border-border-default`, `bg-primary`, `text-h3`, `font-display`, `rounded-lg`, `shadow-2`.
- `components/ui/`: primitives (import from `@/components/ui`). `app/(dev)/ui`: gallery.
- `lib/supabase/{client,server,proxy,service}.ts`, `lib/log.ts` (JSON lines), `lib/request-id.ts`, `lib/health.ts`, `lib/sentry-scrub.ts`, `lib/security/headers.ts`, `lib/motion.ts`, `lib/hooks/`.
- `proxy.ts`: mints `x-request-id` and refreshes the session with `getClaims()`.
- `supabase/migrations/`, `supabase/tests/` (pgTAP; `00_rls_everywhere` fails if any public table lacks RLS), `supabase/seed.sql`.

## Code map (phase 1)

- Database: `supabase/migrations/*_identity.sql`. Security-definer functions live in the unexposed `private` schema; `public` wrappers are security invoker. HEC list: edit `supabase/seed/hec_universities.csv`, then `pnpm universities:sync` (writes a new sync migration; a unit test fails if you forget).
- Auth hook: `public.hook_before_user_created` → `private.validate_signup`; `private.handle_new_user` creates profile, onboarding state and acceptance. Email templates in `supabase/templates/`.
- Gates: `lib/auth/gate.ts` (pure decision table, unit-tested) used by `proxy.ts` (nonce CSP + `getUser()` + `my_gate_state()`) and `/auth/callback`.
- Server actions: `lib/actions/{auth,mfa,agreement,onboarding,profile}.ts`, each via `actionContext()` (`lib/actions/context.ts`) returning `ActionResult` (`lib/actions/result.ts`).
- Identity on the client: `useCurrentUser()` from `components/providers/current-user-provider.tsx`; sign-out goes through `components/auth/sign-out-button.tsx` (clears state in every tab).
- Security helpers: `lib/security/{turnstile,hibp,hash,rate-limit,request-meta,headers}.ts`; images: `lib/images/reencode.ts`.
- E2E fixtures: `tests/e2e/support.ts` (Auth admin API on the local stack, Mailpit reader, TOTP).

## Code map (phase 2)

- GitHub: `supabase/migrations/*_github_connect.sql` (accounts, installations, repos, sync jobs, webhook deliveries, pgmq queue `github_jobs`, cron wake). Edge Functions `supabase/functions/github-link` (ticket → identity binding) and `github-worker` (queue stages); their logic is in `supabase/functions/_shared/github/` (web APIs only, `.ts` imports) and is tested from Node by `pnpm test:worker` against the local DB with a fake GitHub.
- App side: `/api/github/callback` (state check → ticket → `github-link`), `/api/github/webhook` (signature, trim, record once), `lib/actions/github.ts`, `lib/data/github.ts`, `components/github/*`, Settings → GitHub.

## Code map (phase 3)

- Friends and blocks: `supabase/migrations/*_friends_blocks.sql` (`friend_requests`, `friendships`, `blocks`, `ops_audit_log`; `private.is_friend_of/is_blocked_with` for the caller, `private.are_friends/is_blocked(a, b)` for definer code). Actions `lib/actions/friends.ts`, reads `lib/data/friends.ts`, UI `components/friends/*`, `/friends`.
- Actions that call one SQL function share `lib/actions/rpc.ts` (`signedIn`, `call`, SQL error code → typed refusal).
- Emergency bans until phase 11: `docs/emergency-ban.md`.
- Notifications: `supabase/migrations/*_notifications.sql` (`notifications` written only by `private.notify()` from triggers; `notification_types`/`notification_categories` lookup; `notification_prefs` per category; pgmq `notification_emails`). Worker `supabase/functions/notify-worker` with logic in `_shared/notify/` (wording in `describe.ts` is shared with `/notifications`), tested by `pnpm test:worker` with a fake Resend. UI: bell `components/notifications/`, `/notifications`, `/settings/notifications`. New notification types: insert into `notification_types` and add wording to `describe.ts`.
- Posts: `supabase/migrations/*_posts.sql` (`posts`, `post_media`, `post_events`/`event_rsvps`, `post_polls`/`poll_options`/`poll_votes`, `venture_update_media`; `private.can_view_post()`; `post_cards(ids)` builds every card in one call; `list_posts()` is the newest-first list until the ranked feed). Actions `lib/actions/posts.ts`, reads `lib/data/posts.ts`, UI `components/posts/*`, `/feed`, `/post/[id]`, profile Activity tab. Images: browser `lib/images/downscale.ts` then server `lib/images/content-images.ts` (sharp `reencodeToFit`, bucket `post-media`).
- Comments, hides, mutes, link previews: `supabase/migrations/*_comments_links.sql` (`post_comments` one level deep, `post_hides`, `user_mutes`, `link_previews` cache; `posts.link_url` set by trigger, which queues pgmq `link_previews`). Edge Function `supabase/functions/link-preview` with the SSRF guard in `_shared/links/ssrf.ts` (unit-tested) and the worker in `_shared/links/worker.ts` (`pnpm test:worker`). UI `components/posts/comments.tsx`, `viewer-actions.tsx`.
- Micro-survey and config: `supabase/migrations/*_micro_survey.sql` (`platform_config` + `private.config(key)`; `micro_survey_dimensions/questions/assignments/responses`, `post_views`, `post_survey_counts`, `post_stats` kept by triggers; `survey_for_posts(ids)` assigns and returns the strip; `answer_survey`; `post_insights` behind `private.has_entitlement()`, a stub until phase 10). Client: `components/posts/view-tracker.ts` (qualified views), `survey-strip.tsx`, `insights-button.tsx`. Client-safe post constants live in `lib/posts/constants.ts` (not `lib/data/*`, which is server-only).
- Ranked feed: `supabase/migrations/*_feed_ranking.sql` (`private.compute_stage` + the `feed-stage` cron job, `private.feed_score(post, viewer)`, `private.build_feed`, `feed_page(audience, filter, cursor)` with `feed_sessions`, `pinned_announcement()`, `followed_venture_updates()`). App: `getFeed()` in `lib/data/posts.ts`, `components/posts/new-posts-pill.tsx`, `followed-updates.tsx`. Format dates on the server (`lib/format/time.ts` in data modules) and pass labels to client components.
- Chat: `supabase/migrations/*_chat.sql` (`chat_threads` dm/group, `chat_thread_members` with `last_read_at`/`muted_until`, `chat_messages`; no insert policies, writes only through `get_or_create_dm`, `send_message`, …; venture group chats follow `venture_members` by trigger; private bucket `chat-media/{thread}/`). Actions `lib/actions/chat.ts`, reads `lib/data/chat.ts` (signed image URLs), UI `components/chat/*` (Realtime `postgres_changes` after `realtime.setAuth()`), `/chat`, `/chat/[threadId]`, `/ventures/[id]/chat`.
- Chat extras and Explore: `supabase/migrations/*_chat_extras_explore.sql` (`chat_messages.reply_to_id/link_url/search`, `message_reactions`, `chat_pins`, `profiles.chat_read_receipts`, `realtime.messages` policies for the private `thread:{id}` broadcast channel, `search_chats`, `search_people`, `search_ventures`, `private.prefix_tsquery`). Client-safe chat constants in `lib/chat/constants.ts`. Explore: `lib/data/explore.ts`, `lib/explore/href.ts` (URL state), `components/explore/*`, `/explore`; `/settings/chat`.
- Reports and /ops: `supabase/migrations/*_reports.sql` (`report_cases` one per target, `reports` one per reporter and target, `report_messages` copied chat context, `sanctions`, `posts.removed_at`; `submit_report`, staff `ops_queue`/`ops_case`/`claim_case`/`resolve_case` all behind `private.require_moderator()` and writing `ops_audit_log`). App: `components/reports/report-button.tsx` (posts, comments, messages, profiles, ventures), `lib/actions/reports.ts`, `lib/actions/ops/moderation.ts`, `lib/data/ops.ts`, `/ops` (404 unless moderator; proxy requires two-factor), `/ops/reports/[id]`, `/moderation/[id]` for the owner.
- Phase 3 answers: `supabase/migrations/*_phase3_answers.sql`. Unused image files are deleted by the `storage-cleanup` Edge Function (logic in `_shared/storage/cleanup.ts`, `pnpm test:worker`), fed by triggers through pgmq `storage_cleanup`; add a trigger there for any new bucket that holds user files. Notification emails stop at 60 a day (`DAILY_CAP` in `_shared/notify/worker.ts`).

## Code map (phase 4)

- Endorsements: `supabase/migrations/*_endorsements.sql` (`endorsements`, `endorse()` with every PRD 5.16 limit, `hide_endorsement`, `endorsements_for(user)` for profiles, `endorse_options(venture)` for the sheet, `user_skills.peer_verified` kept by triggers, notification category `trust`; limits in `platform_config` `endorsements.limits`). Actions `lib/actions/endorsements.ts`, reads `lib/data/endorsements.ts`, UI `components/endorsements/*` (sheet on the venture Team tab, `?endorse=1` opens it; list on the profile Overview).
- L3/L4: `supabase/migrations/*_skill_levels.sql` (`contributions.skill_ids`, `github_pull_requests`/`github_pr_skills` written by `private.record_pull_request`, `l3_skills`/`l4_skills` merged into `recompute_user_skills`, `my_skill_proofs(skill)` for the drawer, `github_webhook_pr`). Worker stages `prs` (search) and `pr` (one pull request) in `_shared/github/worker.ts`; the fake GitHub in `tests/worker/github-worker.test.ts` answers search, pulls, reviews, files and users.
- Credentials: `supabase/migrations/*_credentials.sql` (`credentials`, `recognised_issuers`, private bucket `credentials/{user}/{uuid}.pdf|webp`, `submit_credential` checks the stored object, `credentials_for(user)`, staff `credential_queue`/`credential_case`/`claim_credential`/`review_credential`, GitHub flag `review_flag_queue`/`claim_review_flag`, `storage_usage()`, daily `credentials-daily`). Actions `lib/actions/credentials.ts` (PDF via browser upload + `%PDF-` check, images via sharp), `lib/actions/ops/trust.ts`; reads `lib/data/credentials.ts`, `lib/data/ops-trust.ts` (`staffRoles()` for /ops areas); UI `/me/credentials`, `components/credentials/*`, `/ops/evidence` (+ `credentials/[id]`, `flags/[id]`), `components/ops/trust-forms.tsx`.
- Code checks: `supabase/migrations/*_code_checks.sql` (`code_checks` (where the snippet is, never the code), `code_check_prompts`, `request_code_check`/`start_code_check`/`save_code_check`/`my_code_check`/`code_check_state`, service-side `code_check_candidates`/`code_check_prepared`/`code_check_snippet_access`/`code_check_served`, staff `code_check_queue`/`code_check_case`/`claim_code_check`/`grade_code_check`, cron `code-checks-tick`). Worker stage `code_check`; Edge Function `supabase/functions/code-check` with logic in `_shared/codecheck/` (`snippet.ts` pure, `serve.ts` access + GitHub contents), tested by `tests/worker/code-check.test.ts`. App: `lib/actions/code-checks.ts`, `lib/data/code-checks.ts` (`getSnippet` invokes the function with the user's session), `/me/code-checks/[id]`, `components/code-checks/*`, `/ops/evidence?tab=checks` and `/ops/evidence/code-checks/[id]`.
- Ranking: `supabase/migrations/*_ranking.sql` (formula in `platform_config` `ranking.formula`, its version = formula version; `score_work`/`score_skills`/`score_endorsements`/`score_credentials`/`score_momentum`/`score_adjustments` → `compute_ranking(user, as_of)`, pure over the data; `venture_completions` frozen at completion; `ranking_scores` published per student (owner-read), `ranking_snapshots` Sundays, `anti_gaming_flags` (rings, rapid gains), `ranking_adjustments` (penalties from `resolve_case` severity, upheld gains), `exam_periods`; nightly `ranking_runs` state machine: `ranking-nightly` starts, `ranking-step` every minute does one committed step; `ranking_run_all()` for tests and manual reruns). Hand-worked reference: `docs/ranking-reference.md` (pgTAP `32`). App: `lib/data/ops-ranking.ts`, `lib/actions/ops/ranking.ts`, `components/ops/ranking-forms.tsx`, `/ops/evidence?tab=ranking`, `/ops/evidence/ranking/[id]`, `/ops/exam-periods` (accounts staff).
- Leaderboard and score: `supabase/migrations/*_leaderboard.sql` (`profiles.leaderboard_opt_out`, `private.board(scope, department, batch)` ranks one board, `leaderboard`/`leaderboard_me`/`leaderboard_filters`, `tiers_for(ids)` for badges, `my_score()` with evidence names, `next_tier_requirements(user)`). App: `lib/data/ranking.ts`, `lib/data/tiers.ts` (`getTiers` in posts, Explore, team and profile data), `lib/ranking/labels.ts` (client-safe wording), `/leaderboard`, `/me/score`, `/settings/privacy` (`components/ranking/leaderboard-toggle.tsx`, `lib/actions/ranking.ts`).

## Code map (phase 5)

- Signing core: `supabase/migrations/*_verified_cv.sql` (`signing_keys` public, `cv_settings`, `cv_records` owner-read; `private.cv_snapshot(user)` builds CvSnapshotV1 (type in `lib/cv/types.ts`); `cv_issue_prepare`/`cv_issue_commit`, `cv_active_key`/`cv_install_key` (private key in Vault `cv_signing_key:<id>`), `cv_rotate_key()` (run by hand), `cv_refresh_start` + pgmq `cv_jobs` + crons `cv-refresh`/`cv-worker`). Edge Function `supabase/functions/cv-sign` with logic in `_shared/cv/` (`canonical.ts` RFC 8785, `sign.ts` envelope/Ed25519/codes, `issue.ts`), tested by `pnpm test:worker` (`cv-sign.test.ts`) and unit `cv-canonical.test.ts`. Public keys: `app/.well-known/skilient-cv-keys.json/route.ts`; backups in `docs/signing-keys/`.
- CV control and PDFs: `supabase/migrations/*_cv_control.sql` (`cv_share_links` token hash only, `cv_views` keyed per viewer per day, `cv_pdf_exports` + private bucket `cv-exports/{user}/{export}.pdf`; `save_cv_settings`, `create_share_link` (Spark+), `open_shared_cv` (newest version only), `verify_cv` (revoked → code and dates only), `revoke_cv`, re-issue/on-demand in `cv_issue_commit`, staff `ops_cv_records`/`ops_revoke_cv`, triggers on `auth.users` for bans and deletion, `record_cv_export` checks a MAC keyed by Vault `cv_export_secret` = env `CV_EXPORT_SECRET`, `cv-exports-daily`, `private.has_entitlement` reads `platform_config` `entitlements.test_grants` until phase 10). Document: `lib/cv/document.ts` (view + escaped HTML for the PDF, template CSS) and `components/cv/cv-document.tsx` (the same markup in React; `tests/unit/cv-document.test.tsx` keeps them identical); PDF `lib/cv/pdf.ts` + `lib/cv/browser.ts` (`@sparticuz/chromium` on Vercel, `CV_CHROMIUM_PATH`/`PW_CHROMIUM_PATH` elsewhere), fonts in `lib/cv/fonts/`, QR `lib/cv/qr.ts`, statuses `lib/cv/status.ts`, sample CV `lib/cv/sample.ts`. App: `lib/data/cv.ts`, `lib/actions/cv.ts`, `lib/actions/ops/cv.ts`, `components/cv/*`, `/me/cv`, `/cv/[username]?t=`, `/verify`, `/verify/[code]`, `/api/cv/pdf`, `/api/ops/pdf-check` (staff), `/ops/evidence?tab=cvs`. Tests: pgTAP `38_cv_control`, `pnpm test:ats` (every template printed and read back), E2E `cv.spec.ts` (signs over a direct DB connection).

## Code map (phase 6)

- Database: `supabase/migrations/*_student_portal.sql` (`profiles.status/graduated_at/delete_after`, `universities.final_year_batch`, graduate guard triggers and `graduate-rollover`, `request_account_deletion`/`cancel_account_deletion`/`account-deletion` job and `private.delete_account`, `ui_state`, `tour_progress`, `tips_seen`, `nav_badges`, `todo_counts`, `next_best_action`, `getting_started`, the `opportunities(tab)` stub, `feedback` with `submit_feedback`/`my_feedback` and staff `feedback_queue/case/claim/respond`, `ops_batches`/`ops_set_final_year_batch`, private `feedback` bucket). pgTAP `39`.
- Shell: `lib/nav.ts` (one config: sidebar, tablet rail, phone tabs, tooltips), `components/shell/*` (`AppShell` in `app/(app)/layout.tsx`; onboarding, agreement, deleting accounts and non-student roles keep `AppHeader`), `components/ui/tooltip.tsx` (hover, focus, long-press; description always in the page via `aria-describedby`). Badge counts come from one `nav_badges()` call, refreshed over Realtime.
- Learning layer: `lib/tours/*` and `components/tour/tour-host.tsx`, `lib/tips.ts` with `components/learn/*` (`FirstVisitTip` on Opportunities, venture, CV, score, privacy), `components/home/progress-card.tsx` (next step, to-do count, checklist), actions `lib/actions/learn.ts`, reads `lib/data/portal.ts`.
- Pages: `/opportunities/[tab]`, `/me`, `/me/skills`, `/me/work` (`lib/data/me.ts`), `/settings/privacy` (the centre), `/settings/account/delete` (`lib/actions/account.ts`; `lib/auth/gate.ts` locks a deleting account to that page), `/feedback` (`lib/actions/feedback.ts`, `lib/data/feedback.ts`), `/ops/feedback` and `/ops/graduation` (`lib/actions/ops/*`; one platform rule graduates students on 1 September, `final_year_batch` is only an exception).
- E2E: `tests/e2e/student-portal.spec.ts`. `createStudent()` skips the tour by default so it never covers other tests; pass `tour: true` to keep it.

## Code map (phase 7)

- Database: `supabase/migrations/*_teacher_portal.sql` (`teacher_profiles` pending|approved|revoked, `teacher_settings`, `faculty_csv_entries`, `project_ideas` + `ventures.idea_id`, `venture_supervisors`, `supervisor_comments`, `review_requests`, `venture_reviews`, `teacher_concentration_flags`; `contribution_confirmations.confirmer_role`, `endorsements.endorser_kind`, `code_checks.due_at/routed_to_staff_at`; limits in `platform_config` `teacher.limits`). Faculty signup is in `validate_signup`/`handle_new_user`. Every read that builds a page returns one jsonb document (public wrappers are generated at the end of the file). Jobs: `teacher-reminders` (hourly), `teacher-digest` (weekly). pgTAP `40`, concurrency in `tests/worker/teacher-concurrency.test.ts`.
- Teacher portal: `app/(app)/teach/(portal)/*` (home, ideas, reviews, ventures/[id], code-checks, settings; the layout needs an approved teacher), `app/(app)/teach/apply`, `components/teach/*`, `lib/actions/teach.ts`, `lib/data/teach.ts`, `lib/teach/constants.ts`. Student side: Explore "Project ideas" tab, `/ideas/[id]`, `/ventures/new?idea=`, the venture Reviews tab (`/ventures/[id]/reviews`, `components/teach/faculty-controls.tsx`). Approvals: `/ops/teachers` (`lib/actions/ops/teachers.ts`, `components/ops/teacher-forms.tsx`). Weekly email: `teacherDigestEmail` in `_shared/notify/email.ts`, kind `teacher_digest` in the notify worker. E2E: `tests/e2e/teacher.spec.ts`.

## Code map (phase 8)

- Database: `supabase/migrations/20261013_recruiter_orgs.sql` (`organizations`, `org_members` (one org per account), `org_invites` (token hash only), `company_blocks`, the fail-closed plan stub `private.org_entitled`/`org_limit`/`consume_quota` driven by `platform_config` `org.trial_limits` and `entitlements.test_grants`, `private.require_org(roles, need_verified)` (also checks `aal2`), recruiter signup in `validate_signup`/`handle_new_user`, `/ops` verification `ops_orgs`/`decide_org`), `..14_recruiter_talent.sql` (`talent_index` table with no name or photo column, `talent_explore` anonymised and `search_talent` full behind `talent.full_profile`, allow-listed filters in `talent_filters`, `search_audit`, `recruit_candidate`, contact requests and the DM labelled with the company, shortlists, notes, saved searches, student prefs and viewers), `..15_recruiter_jobs.sql` (jobs, applications, `move_application`, hires, `hire_outcomes`, `company_page`, `opportunities(tab)` filled in, competitions with L3/L4 awards), `..16_recruiter_api.sql` (API tokens and webhooks, `api_*` functions taking the bearer token, analytics, staff-only `org_response_stats`, spam review). Public wrappers are generated at the end of each file by a small `pg_temp.expose` helper. pgTAP `41` and `42`.
- Recruiter app: `app/(app)/recruit/*` (layout needs an active org member; billing seats go to the plan), `app/(app)/org/join` and `org/(portal)/*` (plan, members, company page, API), `app/(app)/companies/[slug]`, `app/(auth)/signup/recruiter`. Reads `lib/data/recruit.ts` (one SQL function per read, via `lib/data/rpc-json.ts`), actions `lib/actions/recruit.ts` through `rpcAction` in `lib/actions/recruit-run.ts`, wording and URL filters in `lib/recruit/constants.ts`, UI `components/recruit/*`. `proxy.ts`/`lib/auth/gate.ts` keep recruiters in `/recruit`, `/org`, `/companies`, `/chat`, `/notifications`, `/settings`.
- Student side: `/opportunities/jobs/[id]`, `/opportunities/applications/[id]`, `/opportunities/contact-requests/[id]`, `/competitions/[id]`, Settings → Privacy (prefs, who viewed, blocked companies); `lib/data/opportunities.ts`, `lib/actions/opportunities.ts`, `components/recruit/student-controls.tsx`.
- Ops: `/ops/orgs` (+ `[id]`, `competitions`, `spam`), `lib/data/ops-orgs.ts`, `lib/actions/ops/orgs.ts`, `components/ops/org-forms.tsx`.
- API: `app/api/v1/*` via `lib/api/v1.ts` (anon client, token hashed in SQL, 60/min); reference in `docs/recruiter-api.md`. Edge Functions `webhook-worker` (`_shared/webhooks/worker.ts`, HMAC `t.body`, SSRF checks) and `competition-freeze` (`_shared/competitions/freeze.ts`), tested by `pnpm test:worker`. E2E `tests/e2e/recruiter.spec.ts` (axe in both themes). Recovery for a locked-out recruiter: `docs/recruiter-2fa-recovery.md`; test entitlements: `docs/setup-checklist.md` Phase 8.

## Code map (phase 9)

- Database: `supabase/migrations/20261017_uni_core.sql` (`university_admins` owner|admin|career|coordinator|comms, `university_claims` + private bucket `university-claims`, admin invites, domain and final-year requests, `departments`/`programmes` + `profiles.department_id` kept by trigger, `university_audit_log`, `private.require_uni(roles)` (checks `aal2`), plan stub `private.uni_plan/uni_entitled/uni_limit` from `platform_config` `uni.test_plans`, official signup), `..18_uni_ecosphere.sql` (`ecosphere_config` modules/branding/labels, `private.contrast_ratio`, `ecosphere_pages` blocks, `university_badges`/`badge_awards` (never read by ranking; in `cv_snapshot`), `semesters`, exam periods for admins, onboarding questions with the sensitive-topic check, public bucket `university-media`), `..19_uni_comms.sql` (announcements with targets and a per-university pin, `can_view_post` rewrite, `events`/`event_registrations` with HMAC check-in codes, `uni_hide` → report case, restore by trigger on `report_cases`), `..20_uni_fairs.sql` (competitions `host_type university` + judges, job fairs, booths, queue with per-booth lock, slots, `opportunities` tabs), `..21_uni_records.sql` (`university_student_record` logged and rate-limited, `my_record_viewers`, nightly `uni_stats` with `private.suppress_groups`). Public wrappers generated by `pg_temp.expose`. pgTAP `43`; concurrency `tests/worker/fair-queue.test.ts`.
- App: `app/(app)/uni/(portal)/*` (layout needs a seat on two-factor; home, people, students (Growth+), dashboard/[area], announcements, events, fairs, hackathons, moderation, settings/*, sponsorship, billing, reports), `uni/claim`, `uni/join`; `/u/[slug]/[[...page]]` (signed-in only, brand colours only inside `.ecosphere`), `/events` (+ `[id]`, `check-in`, `attend`), `/fairs/[id]`, `/fairs/invite`, `/teach/judging`, `/ops/universities`, `/api/uni/export` (CSV with formula escaping, PDF). Actions `lib/actions/uni.ts`, reads `lib/data/uni.ts`, UI `components/uni/*` (`RpcForm` drives most forms), helpers `lib/ecosphere/contrast.ts`, `lib/uni/{constants,csv,export,media}.ts`. Gate: officials stay in `/uni`, `/u`, `/events`, `/notifications`, `/settings`, `/feedback`, `/competitions`. E2E `tests/e2e/uni.spec.ts`; setup steps in `docs/setup-checklist.md` Phase 9; disputes `docs/university-claim-disputes.md`.

## Code map (phase 10)

- Database: `supabase/migrations/20261022_billing_enums.sql` (job status `paused`), `..23_billing_core.sql` (B1: `entitlement_keys` registry + `entitlement_key_aliases`, `plans` with grant templates, `entitlement_grants` (plan/add_on/sponsorship/trial/admin), `usage_counters`, `trial_claims`; `private.entitlement_value/entitled/effective_entitlements`, `consume_quota(subject_type, id, key, n)` with a row lock and add-on top-ups, `release_quota`, `quota_status`; the phase 5/8/9 stubs `has_entitlement`, `org_entitled`, `org_limit`, `consume_quota(org, …)`, `uni_plan`, `uni_entitled`, `uni_limit` are wrappers; `require_entitlement(key)` raises SQLSTATE `PT402`; `my_entitlements(subject)`), `..24_billing_lifecycle.sql` (B2/B3: `checkout_sessions`, `subscriptions`, `payments`, `billing_webhook_events` (gateway + event id unique), `invoices` (immutable, gapless `SKL`/`TEST`/`-CN` series), `invoice_counters`, `tax_rates`, `add_on_orders`, `hire_fees` (trigger on `hires`), `billing_tasks`, `billing_reminders`; `create_checkout`/`create_add_on_checkout`/`create_invoice_checkout` price in SQL; `record_billing_event` (service role) → pgmq `billing_events` → `billing_apply_event` via cron `billing-events` (10 s); `billing_tick` (cron 5 min) for trials, periods, retries, grace, licences, reminders; pgmq `billing_jobs` for the worker; `billing_overview(subject)`, `invoice_document`), `..25_billing_ops.sql` (B4 `sponsorship_sync` nightly; B5 staff `ops_*` functions, all audited before/after; `ops_revenue`, `ops_gateway_activity`, `may_use_simulated`). Config in `platform_config`: `billing.add_ons`, `billing.lifecycle`, `billing.hire_fees`, `billing.company`, `billing.live_mode`, `billing.simulated_testers`. pgTAP `44_billing`.
- Gateways: `supabase/functions/_shared/billing/` (`types.ts` adapter interface `createSession`/`verifyWebhook`/`refund`/`chargeSavedMethod` and the normalised `BillingEvent`; `simulated.ts`, `safepay.ts`, `paddle.ts` (`CONFIRM` marks what needs a sandbox); `config.ts` env rules (`BILLING_GATEWAY_LOCAL/MOR`, simulated-in-production rule, readiness); `worker.ts`), Edge Function `supabase/functions/billing-worker`. Fixtures `tests/fixtures/billing/`.
- App: `lib/billing/` (`entitlements.ts`, `registry.ts` (every paid action and its key), `checkout.ts`, `webhook.ts` + `record.ts` (service role), `invoices.ts` (PDF on demand), `gateways/`, `constants.ts`, `errors.ts`); `rpcAction({ entitlement })` and `paymentRequired()` in `lib/actions/rpc.ts`; actions `lib/actions/billing.ts`, `lib/actions/ops/billing.ts`; reads `lib/data/billing.ts`; UI `components/billing/*` (`UpgradeSheetHost` in the app layout, `showUpgrade(result)`); routes `/api/billing/webhook/[gateway]`, `/api/billing/invoice/[id]`; pages `/billing/checkout/[session]` (simulated gateway), `/billing/return/[session]` (polls), `/settings/billing`, `/org/billing`, `/uni/billing`, `/ops/billing` (+ `[type]/[id]`). New paid actions: add `entitlement` to the `rpcAction` call and a row in `PAID_ACTIONS` (the registry tests fail otherwise).
- Tests: `tests/unit/billing-{gateways,registry,wording}.test.ts`, `tests/worker/billing-{webhooks,concurrency,registry}.test.ts` (shared `billing-support.ts`), E2E `tests/e2e/billing.spec.ts`. Switching to real gateways: `docs/setup-checklist.md` "Switching to a real gateway".

## Code map (phase 11)

- Shell and inbox: `supabase/migrations/20261026000000_ops_shell.sql` (`private.require_super_admin()`, `ops_inbox(queue)` (counts, ages, claims across every staff queue the caller's roles open), `ops_staff`/`grant_staff_role`/`revoke_staff_role` (two-factor required on the account, never the last super admin), `ops_audit_search`/`ops_audit_filters`/`ops_audit_export` (super admin, audited)). pgTAP `45`. App: `lib/ops/nav.ts` (one config: areas, roles, queue labels), `components/ops/ops-sidebar.tsx`, `app/(app)/ops/layout.tsx` (the shell; `AppShell` steps aside on `/ops`), `/ops` inbox (`components/ops/inbox-claim.tsx` → `lib/actions/ops/inbox.ts`, which calls each queue's own claim function), `/ops/reports` (moved from `/ops`), `/ops/staff` (`components/ops/staff-forms.tsx`, `lib/actions/ops/staff.ts`), `/ops/audit` (`components/ops/audit-diff.tsx`, `lib/ops/diff.ts`), `/api/ops/audit/export`; reads `lib/data/ops-shell.ts`. New /ops areas: add a row to `OPS_AREAS` and the path to `tests/e2e/ops-shell.spec.ts`'s axe sweep. E2E `tests/e2e/ops-shell.spec.ts`.
- Sanctions and appeals: `supabase/migrations/20261027000000_sanctions_appeals.sql` (`sanctions` gains `org_id`, `per_day`, lift fields; trigger `sanctions_role_limits` (moderators ≤ 7 days, bans super admin only, lift-only updates); `private.active_restriction(user)`; trigger `refuse_if_restricted` on every table where people create things (add it to new ones); `org_throttle_check` on `contact_requests`; `sanction_user`/`sanction_org`/`lift_sanction`/`ops_sanctions`/`ops_find_account`/`ops_case_owner`/`my_restriction`; `appeals` (one per decision, never decided by `original_staff_id`), `private.appeal_subject` (what a decision is and who decides its appeal), `my_appealable`/`my_appeals`/`submit_appeal`/`ops_file_appeal`/`ops_appeals`/`ops_appeal_case`/`claim_appeal`/`decide_appeal` → `private.overturn_decision`; the inbox gains `appeals`). pgTAP `46`. App: `lib/actions/ops/sanctions.ts`, `lib/actions/appeals.ts`, `lib/data/sanctions.ts`, `lib/ops/appeals.ts` (wording), `components/ops/{sanction,appeal}-forms.tsx`, `components/appeals/appeal-button.tsx`, `components/shell/restriction-banner.tsx` (app layout), `/ops/sanctions`, `/ops/appeals` (+ `[id]`), `/appeals`; the sanction form is also on `/ops/reports/[id]` and `/ops/orgs/[id]`. E2E `tests/e2e/sanctions-appeals.spec.ts`.
