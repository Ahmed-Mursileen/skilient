# Decisions log

Append-only. One dated entry per product decision, with the reason. Carried over from the planning sessions (TechShiner repo, `.claude/wiki/decisions.md`); the PRD already reflects every entry below. Add new entries at the bottom.

- 2026-09-24: Product renamed TechShiner → Skilient. The PRD is re-scoped
  from MVP to the full production platform plus business model; the stack
  stays on Next.js. Why: Ahmed's call via comments on the rebuild PRD doc.
- 2026-09-25: Rebuild PRD is one single launch of the full platform (no
  R1–R4 releases). Visual direction "Editorial": Spectral for the platform,
  Montserrat only in the wordmark, logo ink #0E0D0B + vermillion #C03910.
  No Claude/AI API anywhere. Mentorship and the other revenue streams are
  post-launch (separate doc). Why: Ahmed's calls while fleshing out the PRD.
- 2026-09-25: Ranking v1 = Proof (Work 45, Skills 20, Endorsements 15,
  Credentials 5) + Momentum 15; creator 1.3x; decay after 14 idle days,
  paused in exam periods. Why: Ahmed resolved the formula conflict.
- 2026-09-25: University records of individual students only on Growth and
  Campus plans, no student opt-out (covered by the signup user agreement);
  the student sees who viewed their record only on Pro.
- 2026-09-25: Student portal: five tabs (Home, Opportunities, Ventures, Chat,
  Me), progress card on the feed, opportunities hub, graduate accounts. No
  installable app or web push at launch (in-app + email only), and no
  "download my data" export.
- 2026-09-25: Admin portal (`/ops`): four staff roles (moderator, trust
  reviewer, accounts, super admin) with 2FA and an append-only audit log;
  read-only "view as user", logged and the user is notified; one appeal
  per decision, decided by different staff, final; recruiter orgs are
  verified manually before contact requests; prices, weights and flags are
  editable in the ops UI (versioned); staff see only the chat messages
  attached to a report.
- 2026-09-25: Signup/onboarding: students need a verified university email
  AND a student ID card reviewed by Trust staff before full access (they can
  finish onboarding while pending; ID images deleted 30 days after review).
  Google sign-in allowed only for university-domain accounts. GitHub step
  skippable. Guided nav tour auto-starts; nav tooltips, first-visit tips and
  a getting-started checklist included. No help centre at launch; a feedback
  centre instead. User agreement ships as a headings-only template that
  Ahmed will write later.
- 2026-09-25: Student ID card check dropped. Students sign up with their
  university email (or university Google account) only.
- 2026-09-25: Feed has no likes, reactions, saves or share-to-chat. The
  micro-survey replaces likes; the only public signal is "X find this
  informative / X find this interesting". A hidden algorithm ranks posts
  from trigger conditions (seed -> full -> global boost), survey answers
  and comments, with time decay. Two feeds: University Feed and Global Feed.
  Invite posts always link a venture. No image alt text.
- 2026-09-25: Ventures: max 6 members; deliverables and chat are members
  only; cross-university allowed for public ventures. Chat: images only (no
  PDFs), typing indicator, DM read receipts that can be turned off, no
  friend group chats.
- 2026-09-25: Micro-survey is a permanent tick/cross strip under every
  surveyable post: readers may ignore it but can't dismiss or skip it. Up to
  3 questions per reader per post, drawn from 12 dimensions (~25 questions).
  Full per-post survey breakdown for authors is a paid feature
  (entitlement `insights.post_survey`).
- 2026-09-25: Micro-survey: one question per reader per post (replaces
  "up to 3"). The question is assigned on first view and never changes;
  dimensions are balanced by target shares (Informative 25%, Interesting
  25%, the rest split the other 50%).
- 2026-09-25: Landing page: hero subline "Build with classmates, prove your
  skills with real work, and get recognised by recruiters. No more rejected
  CVs."; feed line "Posts go viral because they provide value, not
  entertainment"; evidence levels not explained on the landing page.
  Marketing pages default to dark. No fade-and-rise reveals: one focal hero
  sequence plus a scroll-linked tier ladder (impeccable/taste-skill
  compliant). Separate /recruiters, /universities, /faculty pages;
  university email field with live detection; live numbers shown once each
  passes 200; no per-university landing pages; /demo dropped; English only.
- 2026-09-25: Theme: marketing pages and the signed-in app both follow the
  device setting (next-themes default "system"), with a manual toggle.
  Supersedes the earlier "marketing pages default to dark" line.
- 2026-09-25: Performance: baseline is a mid-range Android on 4G (3G must
  work). Hosting in Mumbai (Supabase ap-south-1, Vercel bom1). Launch
  capacity 5,000 accounts, 500 daily actives, 100 online at once, sized for
  a 3x busy-moment peak (300 online). No video in posts (images only). No
  data-saver mode. CI performance budgets are report-only with ~10% leeway,
  never blocking a merge.
- 2026-09-25: Observability: Sentry for errors, Axiom for logs (30 days),
  PostHog (EU cloud) for product analytics plus session replays and heatmaps
  on the free tier only (billing limit $0, 20% replay sampling, content
  masked, chat/billing/ops/auth pages never recorded). Alerts by email to
  Ahmed. No public status page.
- 2026-09-25: Security: two-factor (TOTP) required for recruiters,
  university admins and staff, optional for students and faculty.
  Cloudflare Turnstile on signup, repeated failed sign-ins and public forms.
  Supabase's included daily backups only (no paid PITR). Free security
  testing route (ASVS L1 checklist, ZAP scan, per-PR security review), no
  paid pen test. Profiles visible only to signed-in users. New-device
  sign-in email alerts.
- 2026-09-25: Typography stays as in the Figma frames: Spectral (display, h1,
  h2), Barlow (h3 down and body), JetBrains Mono (code/data). Montserrat only
  in the SVG wordmark.
- 2026-09-25: Skill taxonomy is owned by Skilient Trust staff (edited in
  /ops; faculty/student suggestions via the feedback centre; quarterly
  review). Landing trust-gap cards use three verified stats: ResumeLab 2023
  (70% admit CV lies), Gallup Pakistan 2020 (~5,000 of ~25,000 IT grads hired
  by leading firms; P@SHA 10% employable), PBS LFS 2024-25 (23.9% of female
  degree holders unemployed). Recheck against primary reports before launch.
- 2026-09-25: Build order is vertical slice first (student journey end to end, then widen), with no calendar dates. Closed beta at NUTECH. Public launch opens signup to every HEC university at once. The PRD is handed to Claude Code as split Markdown files in a new repo, one phase per session.
- 2026-09-27 (phase 0): Dark-mode error text. The spec's dark error #E83030
  is only 4.34:1 on bg/surface and 3.94:1 on bg/elevated, below 4.5:1 for
  body text. Added `text/error` (light #C41010, dark #F04848, ≥ 4.6:1 on every
  dark surface) for error text; #E83030 stays for icons and borders.
  **Needs Ahmed's OK** (colour change to the Figma system).
- 2026-09-27 (phase 0): Contrast fixes found by axe-core on the gallery.
  Badges keep their text on text tokens and carry tone in the border and
  icon (dark primary-on-primary-subtle was 4.04:1, accent 4.1:1, light
  success on surface 4.32:1). Placeholders use text/secondary (dark
  text/muted on bg/subtle is 4.42:1). Skeletons use bg/subtle (dark bg/muted
  is invisible on bg/surface).
- 2026-09-27 (phase 0): Added `verified-subtle` token (teal 50 light, teal
  900 dark) because the Verified Stamp in 9.4 tints to it but 9.3 doesn't
  define it.
- 2026-09-27 (phase 0): The service-role client lives in its own module
  `lib/supabase/service.ts` (PRD 7 put it in `server.ts`) so ESLint can
  restrict it by import. Allowed: `lib/jobs/**`, `lib/billing/**`,
  `app/api/webhooks/**`, `app/api/jobs/**`. Only `service.ts` may read
  `SUPABASE_SERVICE_ROLE_KEY`.
- 2026-09-27 (phase 0): Phase 0 installs only the dependencies it uses. The
  rest of the PRD 7 list (resend, octokit, puppeteer/chromium, posthog,
  react-query, react-hook-form, noble-ed25519, qrcode, floating-ui) is added
  in the phase that first needs it, so versions get pinned when they're used.
  Also added: more Radix primitives (Select, Checkbox, Switch, Avatar, Slot),
  clsx + tailwind-merge, server-only.
- 2026-09-27 (phase 0): Security headers ship now from `next.config.ts`
  (HSTS, frame-ancestors 'none', referrer, permissions, nosniff). The full
  nonce-based CSP comes with phase 1's `proxy.ts` gates, when auth pages
  exist to test it against.
- 2026-09-27 (phase 0): Env additions: `NEXT_PUBLIC_SENTRY_DSN` (the browser
  SDK can't read `SENTRY_DSN`), `SENTRY_ORG` / `SENTRY_PROJECT` (source map
  upload), `ENABLE_UI_GALLERY` (serve the dev-only gallery from a production
  build in CI).
- 2026-09-27 (phase 0): `/api/health` uses the publishable key only:
  `health_check()` RPC, Storage `/storage/v1/status`, and a Realtime channel
  join over the WebSocket (5 s budget). Changed from `/realtime/v1/api/ping`
  after it failed on the hosted project: that route is only served by the
  local stack. If the project is ever set to private-channels-only, the
  probe needs an allowing policy.
- 2026-09-27 (phase 0): Visual regression starts as report-only. CI attaches
  gallery screenshots (both themes, desktop and phone) to the Playwright
  report. Pixel baselines get committed once CI's runner has produced them,
  because local and CI font rendering differ.
- 2026-09-27 (phase 0): gitleaks runs from its pinned Docker image
  (`zricethezav/gitleaks:v8.28.0`), not gitleaks-action, which needs a paid
  licence for organisation-owned repos.
- 2026-09-27: Supabase CLI runs only in CI (Ahmed's call). Every PR:
  local stack → db reset → pgTAP → stale types → `db advisors --fail-on
  warn`. Merge to `main`: link with `SUPABASE_ACCESS_TOKEN` /
  `SUPABASE_PROJECT_REF` / `SUPABASE_DB_PASSWORD` and `supabase db push`,
  after every gate passes; runs on main are never cancelled mid-push. For
  now this pushes to the single hosted project; the PRD's staging project
  and per-PR branches come later. Vercel builds `main` in parallel, so an app
  change that needs a new column should land after its migration.
- 2026-09-27: Supabase agent skills (`supabase`, `supabase-postgres-best-
  practices`) vendored in `.claude/skills/` via `npx skills add` (pinned in
  `skills-lock.json`). Rule: use the Postgres skill for every migration, RLS
  policy and query; the PRD and this log win where they differ.
- 2026-09-27: Phase 0 migration reviewed against the Postgres skill.
  `job_run_start` / `job_run_finish` changed from security definer to
  security invoker (only service_role calls them and it already bypasses
  RLS, so definer rights only added risk in the exposed schema). The
  migration hadn't been applied to any hosted database, so it was edited in
  place. New pgTAP guard: no security definer function in `public` may be
  executable by anon or authenticated. Kept despite the skill: uuid v4
  primary keys (`gen_random_uuid()`, PRD 6 convention; Postgres 17 has no
  built-in uuidv7) and Postgres enums (PRD 6).
- 2026-09-27: Design-gate skills vendored in `.claude/skills/` via `npx
  skills add` (pinned in `skills-lock.json`): `impeccable` (Gate A critique,
  Gate B audit/polish) and `design-taste-frontend` from taste-skill (Gate A
  pre-flight). Installed skill-only: impeccable's edit hooks are off (enable
  with `impeccable hooks on` if wanted); its launcher downloads a
  checksum-verified engine binary from GitHub releases on first use.
  taste-skill targets landing pages and marketing surfaces, so for app screens
  only its pre-flight checklist applies, as the screen spec requires.
- 2026-09-27: GitHub Actions pinned to full commit SHAs with the release as a
  comment (checkout v7.0.1, setup-node v7.0.0, upload-artifact v7.0.1,
  pnpm/action-setup v6.1.0), superseding Dependabot PRs #2–#5. Dependabot
  updates SHA pins and now groups all Actions bumps into one PR. Fixed:
  Lighthouse reports weren't uploaded (`.lighthouseci/` is hidden;
  `include-hidden-files: true`). The gitleaks Docker image is still pinned
  by tag, not digest.
- 2026-09-27: SessionStart hook (`.claude/hooks/session-start.sh`, cloud
  sessions only, synchronous): `pnpm install`, start Docker, point Playwright
  at the preinstalled Chromium. Local Supabase stays on demand (`pnpm
  db:start`) to keep startup around 5 s; CI remains the gate for pgTAP.
- 2026-09-27 (phase 1): HEC universities load through a generated data migration,
  not seed.sql, because `supabase db push` never runs seed.sql on the hosted project.
  `supabase/seed/hec_universities.csv` is the source; `node scripts/universities.mjs
  --write` turns it into a `*_sync_hec_universities.sql` migration that calls the
  idempotent `private.sync_hec_universities()` (upserts by name, keeps ops-added
  domains, never deletes universities). A unit test fails CI if the CSV changes without
  a new sync migration. Only name, city, province and domains load; the other columns
  are reference notes.
- 2026-09-27 (phase 1): **Launch blocker:** only NUTECH's domain (`nutech.edu.pk`,
  status `confirmed`) is verified. The other 282 rows' domains are seeded and live for
  signup but still need human verification before public launch (edit the CSV, then
  run the script). `preston.edu.pk` is shared by Preston Karachi and Preston Kohat
  (the signup picker handles it); 5 universities have no domain and can't sign up
  students yet; the notes flag military academies and two institutes with stopped
  admissions as "probably exclude".
- 2026-09-27 (phase 1): Domain matching is exact (`student.uet.edu.pk` must be listed
  itself; no subdomain wildcard), per 5.27 "rejects any email whose domain isn't in
  university_domains". Seeded domains are `kind = both` since the CSV doesn't say.
- 2026-09-27 (phase 1): Security-definer functions live in an unexposed `private`
  schema (Supabase guidance; keeps the phase 0 pgTAP guard and advisors green). Where
  users need one over the API, a `public` security-invoker wrapper calls it and the
  private function checks `auth.uid()` itself.
- 2026-09-27 (phase 1): Phase 1 opens student signup only. `validate_signup()` refuses
  faculty, recruiter and university-admin roles until their phases add their checks.
  Besides the before-user-created hook, `handle_new_user()` itself refuses a
  non-university domain (so an unconfigured hook can't let one through), and a trigger
  refuses an email change to a domain outside the student's university.
- 2026-09-27 (phase 1): `profiles_public_card` is a trigger-maintained table with no
  direct access; restricted viewers read it only through `get_profile_card(username)`
  (exact username), so it can't be listed or scraped. `is_friend_of()` and
  `is_blocked_with()` are stubs returning false until phase 3 creates friendships and
  blocks (friends-only profiles stay owner-only until then).
- 2026-09-27 (phase 1): `looking_for` follows 5.27 (multi-select: internships, jobs,
  teammates, competitions, learning) rather than 5.4's free text ≤ 120 chars.
  `recruiter_visible` defaults to off until the student chooses in onboarding step 5.
  Batch is stored as `graduation_year`. *Settled 2026-09-28 (below): new options.*
- 2026-09-27 (phase 1): Failed sign-in throttling (Turnstile after 5 failures for the
  account or the IP; after 10 the account, never the IP, is locked for 15 minutes and
  the owner emailed) lives in `signin_status()`/`signin_failed()` and guards the
  app's sign-in form. Direct calls to Supabase Auth's password endpoint bypass it and
  fall back to Supabase's own per-IP limits; the Pro-plan-only password verification
  hook would close that gap. Throttling rows are purged daily by pg_cron
  (`purge-security-data`, logged in `job_runs`), security events after a year.
- 2026-09-27 (phase 1): Staff roles count only on a two-factor (`aal2`) session;
  `super_admin` implies every role. Staff can now read `job_runs`. The first super
  admin has to be granted by a human in the SQL editor until the ops UI (phase 11).
- 2026-09-27 (phase 1): Supabase auth cookies stay readable by the browser (the
  `@supabase/ssr` default), not HttpOnly as PRD 10 lists: the browser client needs the
  session for `onAuthStateChange` (PRD 5.2's check-inbox screen and CurrentUserProvider)
  and for Realtime later. The app's own cookies (device id, pending verification,
  agreement intent) are HttpOnly, Secure and SameSite=Lax. *Approved 2026-09-28 (below).*
- 2026-09-27 (phase 1): Email links (confirm, reset, email change) use `token_hash` and
  land on `/auth/confirm`, so they work on any device, not only in the browser that
  started the flow (PKCE). `/auth/callback` handles Google only, honours a validated
  `next`, and re-checks the university domain on every sign-in. The confirmation email
  carries both the 6-digit code and the link.
- 2026-09-27 (phase 1): Turnstile is verified by the app (`lib/security/turnstile.ts`),
  not Supabase's built-in CAPTCHA, because Vercel has real keys on Production and test
  keys on Preview while Supabase takes one secret per project. Direct calls to the Auth
  API skip Turnstile and the app's breached-password check; the domain hook still
  applies, and Supabase's own leaked-password protection and per-IP limits (dashboard)
  cover that path.
- 2026-09-27 (phase 1): New-device alerts and security events are recorded on the app's
  sign-in paths (password, code, link, Google, reset). A device is a random HttpOnly
  cookie, stored hashed. The alert's "This wasn't me" link opens a confirm page (mail
  scanners prefetch links); the button deletes every session of the account and sends a
  reset email. Alert and lock emails go through Resend's API and need `EMAIL_FROM`.
- 2026-09-27 (phase 1): New env vars: `EMAIL_FROM` (verified sender for the app's
  security emails) and `IP_HASH_SECRET` (HMAC key for IP hashes and rate-limit keys).
  Without them locally the app skips the emails and falls back to plain hashes.
- 2026-09-27 (phase 1): Two-factor (TOTP) plumbing: enrol/remove in Settings → Security,
  a `/signin/mfa` step whenever an enrolled account's session is aal1, and aal2 required
  by `proxy.ts` for `/ops`, `/uni`, `/recruit`, `/org`. **Open question for Ahmed:**
  Supabase Auth has no recovery codes (PRD 10 wants them shown once at setup). Options:
  let people enrol a second authenticator as a backup (built in), or build our own codes
  with a staff-assisted reset in ops. Needed before recruiters and admins (phase 8/9).
- 2026-09-27 (phase 1): The full nonce-based CSP now ships from `proxy.ts` (every page
  renders dynamically, as nonces require). `CurrentUserProvider` is seeded in the
  signed-in `(app)` layout rather than the root layout, so public pages don't pay an
  Auth round trip. `/feed` is a teaching empty state until phase 3. The signup form
  offers the student role only (faculty with phase 7), and for a domain only one
  university uses, "Not your university?" explains that instead of opening a
  one-item picker.
- 2026-09-27 (phase 1): Profile images are re-encoded by the app, not a Supabase Edge
  Function (PRD 10's build note): a server action decodes with sharp (already in the
  tree through Next), detects the type from the bytes, refuses anything over 6,000 px,
  and writes a fresh WebP (512×512 avatar, 1500×500 cover) with no metadata to
  `avatars/` or `covers/{user_id}/{uuid}.webp`, then deletes the old file. Edge
  Functions' CPU limit can't decode large phone photos. The browser crops first
  (react-easy-crop), so uploads stay far under Vercel's 4.5 MB request cap; the action
  body limit is 9 MB to honour the PRD's 5/8 MB. Buckets are public-read with
  unguessable paths, so avatars need no signed URL per render.
- 2026-09-27 (phase 1): Onboarding steps 3, 4 and 6 are honest shells until their data
  exists: GitHub offers "Skip for now" (the App arrives in phase 2), Skills explains
  levels over an empty state, and Find your people lists classmates (same university,
  department and batch, RLS-visible) without a friend button (phase 3) and with no
  ventures yet (phase 2). Departments are a platform-wide list until universities set
  their own (phase 9); programme is free text.
- 2026-09-27 (phase 1): Profile overview lives at `/profile/[username]`; Ventures,
  Skills and Activity are nested segments with teaching empty states until their phases.
  Add friend, Message and Report arrive with phase 3. Opening someone else's profile
  counts toward PRD 10's 300 profiles a day.
- 2026-09-27 (phase 1): Known limitation: `signin_failed()` is callable over the API by
  signed-out visitors (the sign-in action runs as them), so a script that knows a
  student's email can keep that account locked in 15-minute windows without passing
  Turnstile. This is inherent to any lockout (ten wrong passwords in the form do the
  same, only slower); the owner is emailed once per lock. Closing it needs a caller the
  database can trust without the service-role key (e.g. a Vault-held HMAC shared with
  the app) or Supabase's password verification hook (Team plan). Revisit before launch.
- 2026-09-27 (phase 1 audit): Supabase Auth's per-IP limits can't see students' IPs.
  Sign-up, sign-in, code checks, resets and the proxy's token refresh run on the
  server, so Supabase counts Vercel's IPs, shared by every user. Passing the real IP
  (`Sb-Forwarded-For`) needs the secret key, which CLAUDE.md bars from actions acting
  for a user. PRD 5.2's "sign-in 30/h, sign-up 10/h per IP" can't simply move into the
  app either: a campus shares one or a few public IPs, so 10 sign-ups an hour would
  stall a signup drive in a single lab. Today these paths are held by Turnstile on
  every sign-up, per-email limits on codes, resends and resets, Turnstile after 5
  failures per account or IP, and 15-minute account locks after 10. Proposal: no hard
  per-IP cap; raise Supabase's sign-up/sign-in, token-verification and token-refresh
  limits (Auth → Rate Limits) well above the defaults, since they now meter our
  servers, and raise the email limit once Resend is the SMTP sender. **Needs Ahmed's
  OK.**
- 2026-09-27 (phase 1 audit): `/profile/edit` redirects to `/settings/profile` (screen
  spec route note). The `/projects` and `/startups` redirects to `/ventures` come with
  ventures in phase 2. Image actions now log `orphan_left` when deleting the old file
  fails, and an E2E test proves replace and remove leave no stray objects (5.4
  done-when).
- 2026-09-27 (phase 2): GitHub identity binding (PRD 5.5 P0) runs through a ticket. The
  callback checks `state` against the signed-in student, stores GitHub's one-time code
  in a ticket under the student's own `auth.uid()` (`start_github_link`), and calls the
  `github-link` Edge Function with only the ticket id. The function claims the ticket
  once, exchanges the code with GitHub, reads `GET /user`, and records the numeric
  GitHub id GitHub returned. The browser never names a GitHub account, and the Next app
  never holds the App's client secret or private key: those are Supabase Edge Function
  secrets. A GitHub account already linked to someone else goes to
  `github_link_clashes` (trust reviewers on two-factor); switching to a different
  GitHub account needs a disconnect first.
- 2026-09-27 (phase 2): The GitHub Edge Functions connect to Postgres directly
  (`SUPABASE_DB_URL`, postgres.js) instead of the Data API, so pgmq, Vault and the
  `private` schema stay unexposed. Neither uses the gateway's JWT check: `github-link`
  trusts only the ticket, and `github-worker` only a bearer secret that the migration
  generates into Vault (never in the repo). pg_cron wakes the worker each minute while
  the queue has work, which needs a Vault secret `project_url` set once by hand. Their
  shared code lives in `supabase/functions/_shared/github/` (not `lib/github/` as the
  PRD's build note says) because Edge Functions bundle only what's under
  `supabase/functions`. Vitest runs it from Node against the local database with a
  fake GitHub (`pnpm test:worker`, in CI after pgTAP).
- 2026-09-27 (phase 2): GitHub data model: installations are many-to-many with
  students, since a club's organisation installation can serve several of them.
  Repository metadata is shared, with a per-student row for kind and exclusion.
  Repository names, private ones included, are owner-only. The GitHub login is readable
  by anyone who can read the student's full profile, for the profile's GitHub link (shown
  from slice 4). User tokens (8 hours, refresh tokens 6 months) live in Vault; a refused
  refresh marks the link revoked (evidence stays, syncing stops until reconnect).
  Disconnect deletes the link, installations and repository rows; the worker revokes the
  grant at GitHub, then deletes the Vault secrets. Evidence rules for disconnect come
  with the evidence tables (slice 3).
- 2026-09-27 (phase 2): The webhook route stays at `/api/github/webhook` (setup checklist)
  and is added to the service-role allowlist, since a webhook acts for no user. It checks
  the signature on the raw body, trims each delivery to ids and flags (no commit
  messages, emails, file names or other people's logins), stores it once per delivery id
  (a replay is a no-op) and queues it. Deliveries are purged after 30 days (PRD 10: logs 30
  days). `pg_net` is installed in the `extensions` schema (advisor lint 0014).
- 2026-09-27 (phase 2): CI now also runs the Edge Functions (a boot check) and deploys
  them on merge to `main` (`supabase functions deploy --use-api`). The
  `SUPABASE_ACCESS_TOKEN` secret must be allowed to deploy Edge Functions. The Vercel app
  needs a new `GITHUB_APP_SLUG` for install links.
- 2026-09-27 (phase 2): Skill taxonomy v1 has 158 skills: 30 languages, 34 frameworks,
  47 libraries, 20 tools, 22 platforms and 5 practices. It's weighted to what Pakistani
  CS/SE/EE students build, so it includes CodeIgniter, Flutter, Arduino, Verilog/VHDL and
  MATLAB. It lives in `lib/github/taxonomy/skills.yaml` and loads through generated sync
  migrations (`pnpm skills:sync`, the same pattern as the HEC list). Ids are stable slugs;
  a skill dropped from the YAML is retired, not deleted. Ecosystem shorthands (npm, PyPI,
  Maven/JVM, NuGet, Composer, Go, gems, pub) are expanded at sync time into plain
  file / path / manifest / import detectors, stored in `skills.detectors`, so the worker
  runs data rather than code and ops can edit the taxonomy later (phase 11). Every skill
  carries at least one fixture (100% coverage; the PRD asks for ≥ 95%). The test suite
  fails if the YAML changes without a new sync migration.
- 2026-09-27 (phase 2): Detector rules as built: only added lines and added or changed
  files count. Commits touching more than 100 files, pure renames and pure reformatting
  (the same text in as out once whitespace is ignored) are skipped. Vendored, built, lock,
  source-map and `.gitattributes` generated/vendored files are ignored. Meaningful lines
  are non-blank added lines in files a language skill claims, capped at 400 per commit and
  shared in proportion across languages. The engine is
  `supabase/functions/_shared/github/detectors.ts`, not `lib/github/detectors/` as the
  PRD's build note says (same Edge Function bundling reason as the worker).
- 2026-09-28 (Ahmed): Sign-in rate limits. Supabase's per-IP auth limits only see our
  Vercel servers, so they are raised in the dashboard to stop blocking real users. The
  app enforces: per account, Turnstile after 3 wrong passwords in 15 minutes and a
  growing delay from the 10th (below); per network, a generous 100 sign-in, code,
  signup and reset requests per 10 minutes on the real client IP
  (`x-vercel-forwarded-for`, `rateLimit("auth_ip", …)`), and Turnstile after 5 failures
  from one network. There is no strict per-IP cap, because a campus shares one Wi-Fi
  address. *Changed from the phase 1 build:* Turnstile moves from 5 account failures to
  3; the per-IP limit is new; local runs (loopback) skip it.
- 2026-09-28 (Ahmed): No hard account lockout. From the 10th wrong password in 15
  minutes, each try waits 2, 4, 8, 16, 32, then at most 60 seconds (`signin_status()`
  returns `retry_after_seconds`), with Turnstile. The student gets a "someone is trying
  to sign in" email, at most once an hour (`sign_in_alert` security event). The emailed
  sign-in code (`/signin/code`, `signInWithOtp` with `shouldCreateUser: false`, same
  answer for unknown addresses, Turnstile, 5 codes an hour per address) and university
  Google are never throttled by password failures, so an attacker can't lock a real
  student out. *Changed from the phase 1 build:* the 15-minute lock
  (`private.auth_lockouts`) and its "locked" email are removed; old `account_locked`
  events stay readable. This also settles the phase 1 "known limitation" on
  `signin_failed()`: a script calling it can now only slow password sign-in by up to a
  minute and trigger one email an hour. The Supabase sign-in email template
  (`supabase/templates/magic_link.html`, subject "Your Skilient sign-in code: {{ .Token
  }}") must be pasted into the hosted project's Magic Link template.
- 2026-09-28 (Ahmed): "Looking for" is a multi-select (5.27 wins over 5.4) with five
  options: teammates, a project to join, an internship, a job, faculty mentorship. It is
  stored structured, as the `looking_for_option[]` enum array with a GIN index, ready for
  matching. *Changed from the phase 1 build:* enum values renamed (`internships` →
  `internship`, `jobs` → `job`, `competitions` → `project`, `learning` → `mentorship`);
  profiles that had picked the old "competitions" or "learning" lose those picks, since
  the new options mean something different. This replaces the 2026-09-27 entry awaiting
  Ahmed's OK.
- 2026-09-28 (Ahmed): Auth cookies stay browser-readable (not HttpOnly), as
  `@supabase/ssr` needs for the browser session and Realtime; this answers the
  2026-09-27 entry awaiting Ahmed's OK. The XSS defences are mandatory: the strict nonce
  CSP on every page (already in `proxy.ts`); never rendering raw user HTML (now a lint
  error: `react/no-danger`, and no `innerHTML`/`outerHTML`/`insertAdjacentHTML`);
  short-lived access tokens (1 hour) with refresh-token rotation and reuse detection
  (already in `config.toml`; check the hosted project's Auth settings match).
- 2026-09-28 (Ahmed): Two-factor recovery. Backup codes are our own: 10 single-use codes
  (xxxxx-xxxxx from an unambiguous alphabet) made in the database, stored as SHA-256
  hashes (`private.mfa_backup_codes`), shown once when two-factor is first turned on,
  and regenerable from Settings → Security (needs an aal2 session; the old codes stop
  working). Students may also add more authenticators (up to 5); any of them works at
  sign-in. Supabase can only reach aal2 through a real factor, so a used backup code
  signs the student in with two-factor switched off (authenticators and the other codes
  are removed) and sends them to set it up again. Each use is logged
  (`mfa_backup_code_used`) and emailed. Removing the last authenticator deletes the
  codes. This answers the phase 1 open question.
- 2026-09-28 (Ahmed): A staff "reset 2FA" action in `/ops` is the last resort. It needs
  an identity-check note, is recorded in `ops_audit_log`, and emails the student. It is
  built in phase 11 with the rest of `/ops` (added to the build plan).
- 2026-09-28 (phase 2): Commit import. Harvest lists each shared repository's
  default-branch commits for the student's login (newest 500) and keeps only those whose
  `author.id` is their GitHub id; the extract stage fetches each commit and checks it
  again, so a spoofed `user.email` never counts. Commits pushed after connecting arrive
  from the `push` webhook (default branch only) with the push time. Only SHAs, paths,
  line counts and blob hashes are stored.
- 2026-09-28 (phase 2): Recency (PRD 5.5 "never the author date"). Commits seen through a
  push webhook use the push time. Commits from before connecting have no trustworthy push
  time, so they use the commit (committer) time, never later than when we first saw them.
  The backdating flag therefore applies only to pushed commits.
- 2026-09-28 (phase 2): Levels are computed from all current evidence. "Never downgrades"
  holds against time (old evidence keeps counting), but removing evidence lowers a level:
  disconnecting, excluding or unsharing a repository, a history rewrite, or an upheld flag.
  L3/L4 (phase 4 sources) are never lowered by this computation. Days are counted in
  Pakistan time. L2 hits: frameworks and libraries need 3 import or manifest hits; tools,
  platforms and practices count any file, path, manifest or import hit.
- 2026-09-28 (phase 2): Anti-gaming as built: bulk import (a first commit over 2,000
  lines or 50 files) is excluded but still shows the skill as present (L1); a fork's or
  template's original files (matching blob hashes from the upstream tree) are dropped
  before detection; burst (over 50 commits or 5,000 lines in one day), backdating and
  cross-account duplicates are held as review flags; a complete listing without a
  previously counted commit marks it rewritten and drops its evidence. The duplicate check
  compares only files a commit adds with 20+ non-blank lines, in different repositories,
  so licences, empty files and a team's shared repository don't trip it. Trust reviewers
  resolve flags with `resolve_review_flag` (aal2, note required); the /ops queue comes in
  phase 11. The student sees only that something is under review.
- 2026-09-28 (phase 2): The `prs` stage (merged pull requests and reviews) moves to phase 4
  with L3, its only consumer; `pull_request` webhooks are recorded until then. A nightly
  sync (02:17 PKT) re-reads every linked student as the reconcile.
