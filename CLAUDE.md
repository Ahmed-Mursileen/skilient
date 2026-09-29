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
