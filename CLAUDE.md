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
