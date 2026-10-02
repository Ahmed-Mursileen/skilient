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
- 2026-09-28 (phase 2): Who sees what about a skill. Other students (wherever they can
  read the full profile) see a skill's name, level and "last used"; the counts behind it
  (active days, lines, hits, repositories) and the evidence are the owner's only.
  `user_skills` is now column-granted (`user_id, skill_id, level, last_used_at`) and the
  owner reads the counts through `my_skills()`. The skill drawer shows the owner their
  commits (repository, commit link, what was detected, "being reviewed" / "not counted")
  and how to reach the next level; everyone else sees the level ladder and that the
  evidence is private. The profile links the student's GitHub login.
- 2026-09-28 (phase 2): `/me/skills` (with the private L0 list) is a student-portal screen
  (screen spec, phase 6), so this phase shows skills on the profile's Overview (top 8) and
  Skills tab instead. L0 "skills I'm building" arrives with it.
- 2026-09-28 (phase 2): Slice 5 (ventures) ships in two PRs: 5a is the database, functions,
  RLS and tests; 5b is the screens and E2E. Every venture write goes through a
  security-definer function that checks `auth.uid()` and the caller's role itself (the
  tables grant reads only), and membership changes lock the venture row. A trigger on
  `venture_members` re-checks the 6-member cap and the post-completion lock, so a 7th
  member is refused even under parallel accepts or a direct insert.
- 2026-09-28 (phase 2): Parts of PRD 5.7/5.15/5.28 that need later phases are wired then:
  the venture group chat on accept (chat, phase 3), invite posts and the Shipped post
  (feed, phase 3), notifications to the owner and both sides of a transfer (phase 3),
  endorsement prompts and the complexity score on completion (phase 4), and "peer-verified
  contributions from 2+ members" before completion (contribution log, slice 6). Until
  then completing needs 2+ members and 1+ deliverable. Updates are text only until the
  phase 3 image pipeline for posts.
- 2026-09-28 (phase 2): Venture visibility as built: Public to every signed-in student,
  University-only to its university (others can't see or apply), Unlisted to members and
  invitees only; anyone with the link opens an Unlisted venture's public face through
  `venture_by_link()`, but joins only by invite, and an outsider applying is told it
  doesn't exist. Everything respects blocks (a stub until phase 3). Applications are
  accepted while a venture is recruiting or in progress; membership locks only on
  completion (PRD 5.15). The owner must transfer ownership before leaving; pending
  applications follow the new owner. Ownership is `ventures.owner_id`; member rows carry
  the team role (lead, developer, designer, researcher, other).
- 2026-09-28 (phase 2): `ventures.owner_id` restricts account deletion: the account
  deletion flow (later phase) must transfer or abandon a student's ventures first.
  Deleting a member's account still removes them, even from a completed venture.
- 2026-09-28 (phase 2): Venture screens (slice 5b). A venture's team cards (name,
  username, avatar, venture role) are visible wherever the venture is: they're
  part of what a student judges before applying (`venture_team()`). Requests show
  only the other side of your own applications and invites (`application_people()`),
  never a general profile lookup. The venture page has About, Team, Updates,
  Deliverables and (owner) Manage tabs. Contributions arrives with the contribution log
  (slice 6), Reviews with teachers (phase 7), group chat with chat (phase 3). Outsiders
  see how many deliverables a team has, not the links. Old `/projects*` and
  `/startups*` URLs permanently redirect to `/ventures` (startups to the Startups tab).
  Ventures and Requests sit in the minimal header until the phase 6 shell.
- 2026-09-28 (phase 2): Contribution log (slice 6, PRD 5.14). Insert-only: the tables grant
  reads only and every row comes from a SQL function. A correction is a new row pointing
  at the original, made only by its author within 24 h of the original and only against
  the original (not another correction); the timeline shows the newest one. A
  confirmation belongs to the version it confirmed, so a corrected entry needs a fresh
  confirmation to be peer-verified. GitHub entries are never confirmed (they are verified
  already) and never corrected. The log is readable wherever the venture is; confirmations
  and logging lock when the venture completes or is abandoned.
- 2026-09-28 (phase 2): GitHub-sourced contributions: one entry per *counted* commit (not
  pending, held or excluded) by a current member in the linked repository, made on or after
  the day the venture was created, so older history can't pad a new venture. They're added
  when the repo is linked, when a member joins, and when a commit becomes counted.
  Commit messages aren't stored (PRD 5.5), so the entry reads "Commit abc1234 to
  owner/repo (N meaningful lines)" and links to the commit.
- 2026-09-28 (phase 2): Completion needs peer-verified contributions from at least 2
  *current* members (PRD 5.15). Entries by people who left or were removed stay on the log,
  marked, but don't count. `last_activity_at` for reputation decay doesn't exist yet; decay
  (phase 5) will read the newest contribution instead of a separate column.
- 2026-09-28 (phase 2, owner review): Venture decisions confirmed as logged: outsiders see a
  deliverable count, not the links; a corrected contribution needs a fresh confirmation;
  completion counts current members only. With these changes:
  - Team cards follow each member's own profile visibility: everyone on the team is listed
    by name, but the profile link and photo show only where the viewer may see that
    member's profile. Blocks hide a member from the team list in both directions
    (`venture_team()`, via `private.can_view_profile()`; blocks are a stub until phase 3).
  - Members who leave or are removed keep their peer-verified contributions on their own
    record: the profile's Ventures tab lists those ventures as "Former member" with the
    count, and the CV (phase 5) will include them. They still don't count toward the
    2-member completion rule.
  - GitHub import also takes a member's counted commits from up to 6 months before the
    venture was created, marked "before Skilient". They count (peer-verified) only once
    another member confirms them. Commits made after creation are verified as before;
    older than 6 months, never imported. Replaces the "since the venture was created"
    rule above.
- 2026-09-28 (ops): Supabase runs on the **Free plan** by choice: the project may pause
  when idle and there are no daily backups. Accepted for now; revisit before the closed
  beta (Pro plan for backups and no pausing). Noted in the setup checklist.
- 2026-09-28 (ops): No staging environment until a production build exists. Checks the
  build plan runs "on staging" (the phase 3 end-to-end slice check) run on production with
  test accounts instead. Phase 0 closed: production `/api/health` is 200 with database,
  storage and realtime ok.
- 2026-09-28 (Ahmed, phase 3 plan): Phase 3 ships in nine slices, one PR each: friends and
  blocks; notifications; posts; comments, hides, mutes and link previews; micro-survey;
  feed algorithm; chat core; chat extras and Explore; reports and a minimal `/ops`.
- 2026-09-28 (Ahmed): Phase 3 moderation is dismiss, remove content and warn. Suspensions
  and bans move to phase 11 (CV revocation needs phase 5). Until then staff follow the
  emergency procedure in `docs/emergency-ban.md`: ban sign-in from the Supabase dashboard,
  then record it by hand in `ops_audit_log`.
- 2026-09-28 (Ahmed): In a venture group chat, a teammate you blocked (or who blocked you)
  still shows, labelled "Blocked member" with no profile link or photo, so the team can
  keep working. Everywhere else a block hides each person from the other.
- 2026-09-28 (Ahmed): Venture updates reach followers as unscored feed cards, placed after
  the ranked posts; they are never surveyed or scored.
- 2026-09-28 (Ahmed): Until phases 7 and 9 only staff post Announcements (platform news).
- 2026-09-28 (Ahmed): Notification defaults: instant email for friend requests,
  applications, invites and ownership transfers (and only those four); the daily digest for
  comments, mentions and messages; in-app only for the rest. Resend is on the free plan
  (about 100 emails a day, 3,000 a month), so the digest goes only to people with unread
  activity who haven't been active in the last 24 hours, never empty, and a warning is
  logged once daily sends pass 80.
- 2026-09-28 (Ahmed): "Same program" in feed seeding and relevance means same department
  and graduation year until programmes are structured.
- 2026-09-28 (Ahmed): Post, venture-update and chat images go through the phase 1 sharp
  re-encode in a server action (not a direct browser upload), so EXIF and GPS are always
  stripped. The browser downscales first (longest side about 2,000 px) to stay under
  Vercel's ~4.5 MB request limit and refuses a file that is still too big, with a clear
  message.
- 2026-09-28 (phase 3, slice 1): Friends and blocks as built. The friend functions take a
  username (what every screen has) and work from `auth.uid()`. Asking someone who already
  asked you accepts their request instead of refusing it. A person who blocked you is "not
  found" everywhere, including when you send them a request, so a block is never revealed;
  the blocker also loses the blocked profile and undoes it from Friends → Blocked. Blocking
  ends the pair's friendship and requests only; shared venture membership, applications
  and invites stay (the venture functions already refuse blocked pairs). The phase 1 stubs
  `is_friend_of()` / `is_blocked_with()` are now security definer, so every existing
  policy and card function honours friendships and blocks in both directions.
- 2026-09-28 (phase 3, slice 1): `ops_audit_log` is created now (append-only by trigger,
  staff read on aal2) rather than with `/ops` in slice 9, so the emergency-ban procedure
  has somewhere to record staff actions from today.
- 2026-09-28 (phase 3, slice 1): Profile visibility follows PRD 8's table literally: a
  friend at another university reads a `friends` profile but only the card of a
  `university` profile. *Changed 2026-09-28 (below): friends see university profiles too.*
- 2026-09-28 (Ahmed): Profile visibility is one ladder: friends ⊂ university ⊂ global. A
  friend sees whatever a classmate could, so friends read `friends` and `university`
  profiles wherever they study. There is one full profile, never a separate friends view.
  (Answers the slice 1 question above.)
- 2026-09-28 (Ahmed): Claude merges each phase 3 slice PR itself once CI is green, and
  keeps open questions in `docs/phase-3-questions.md` for Ahmed to answer at the end.
- 2026-09-29 (phase 3, slice 2): Notifications as built. Types live in a lookup table
  (`notification_types`, grouped into `notification_categories`) so later slices add
  types with an insert. Email preferences are per category (friend requests,
  applications, invites, ownership transfers, your teams; later comments, mentions,
  messages), not per type; in-app notifications are always on. Confirmations that need no
  action (request accepted, invite answered, application withdrawn) are never emailed.
  A cancelled friend request or revoked invite deletes its unread notification.
  Notifications from someone blocked (either way) are hidden and new ones aren't created.
- 2026-09-29 (phase 3, slice 2): Emails go through the pgmq queue `notification_emails`
  and the `notify-worker` Edge Function (pg_cron wakes it each minute, like the GitHub
  worker), sending via Resend's HTTP API with an `Idempotency-Key`. An instant email is
  skipped if the notification was read first, and dropped (in-app only) if it couldn't be
  sent within 12 hours. The digest is queued daily at 18:07 PKT for people with unread
  digest items who weren't active in the last 24 hours ("active" = any signed-in page,
  recorded at most once an hour in `private.user_activity`); it lists up to 20 items and
  is never sent empty or twice in a day. Past 80 sends in a UTC day the worker logs
  `notify.daily_threshold` (warn); on Resend's `daily_quota_exceeded` it parks the whole
  queue until 00:05 UTC. Read notifications are purged after 90 days, unread after a year.
- 2026-09-29 (phase 3, slice 3): Posts as built. General, Venture invite, Event (RSVP
  Going / Interested), Poll (2 to 4 options, 1 to 7 days, one vote, results after voting,
  on close, or to the author), Announcement (staff only for now, sent as platform news to
  every feed, pinnable up to 7 days, one pinned at a time) and Shipped (created when a
  venture completes, authored by the owner, starting at Full; none for Unlisted ventures).
  Images (up to 4) go on General, Invite and Event posts. Invites: owner only, recruiting
  or in-progress ventures, never Unlisted; a University-only venture posts to the
  University Feed only. The feed is newest-first until slice 6 ranks it. Edits change the
  body only, within 15 minutes; the author deletes a post with its images, votes and RSVPs.
- 2026-09-29 (phase 3, slice 3): Post and update images live in a public-read `post-media`
  bucket with unguessable paths (like avatars), written only as the server's WebP
  re-encode into the author's folder; the post function checks each path is the caller's
  own uploaded object. The browser shrinks images to about 2,000 px first and refuses a
  set over 4 MB; the server fits them within 2,000 px again. Deleting a teammate's venture
  update as owner leaves that teammate's image files (storage lets people delete only
  their own), unreferenced.
- 2026-09-29 (phase 3, slice 4): Comments, hides, mutes and link previews as built.
  Comments: 1 to 1,000 characters, one level of replies (enforced by a trigger too), 10 s
  cooldown, oldest first with the post author's one pinned comment on top; deleting keeps
  a "Comment deleted" placeholder so replies keep their context; the post author may
  delete any comment on their post; no reactions. The post author, the person replied to
  and up to 5 @mentioned people who can see the post are notified (new categories
  Comments and Mentions, digest by default, never instant). "Not for me" hides a post and
  Mute takes someone's posts out of your feeds (not off their profile), each with Undo on
  the card; muted people are listed under Friends → Blocked with Unmute.
- 2026-09-29 (phase 3, slice 4): Link previews come from the first http(s) link in a post:
  the `link_previews` queue and `link-preview` Edge Function fetch it with DNS resolved
  over HTTPS (Cloudflare) and refuse private, loopback, link-local, CGNAT, multicast and
  reserved addresses (IPv4 and IPv6, including mapped forms) at every hop, ports 80/443
  only, at most 3 redirects, 3 s for the whole fetch, HTML only, first 256 KB. Results
  (and failures) are cached 7 days. The card shows the site, title and description but no
  preview image: the CSP allows images only from Skilient and Supabase, and loading a
  third-party image would tell the linked site who is reading. Known limit: the address
  is checked before the fetch, not pinned for it (a DNS-rebinding host could answer
  differently in between); the fetch sends no cookies or credentials and reads HTML only.
- 2026-09-29 (phase 3, slice 5): Micro-survey as built. `platform_config` (versioned,
  append-only, staff-readable) holds `survey.*` now and `feed.*` from slice 6; the /ops
  editor is phase 11. Twelve dimensions and 25 wordings are seeded. A reader's question is
  assigned the first time `post_cards` includes the post and never changes; the dimension
  furthest below its target share is measured by readers *assigned* so far (not answers),
  so the shares balance even before people answer. Answers need a qualified view (the
  client batches views every 10 s and sends a post's view first when answering) and at
  least 0.8 s since the strip came on screen; one answer per reader per post, changeable
  for 10 minutes. Weights multiply (friend or venture teammate of the author 0.5, account
  under 3 days 0.5, 20+ identical answers 0.3) and are fixed when the answer is given.
  The public line counts raw people from 3 ticks ("12 people find this informative · 8
  find this interesting"); the author sees the public line and an Insights button, which
  is refused (`private.has_entitlement()` returns false until phase 10's registry).
  Appropriate crosses from non-friends are counted in `post_stats.appropriate_flags` for
  the /ops soft signal (slice 9).
- 2026-09-29 (phase 3, slice 6): Ranked feed as built. `feed-stage` runs every 5 minutes
  (`private.compute_stage`): Seed → Full on 5+ answers at 40%+ positive or 3+ non-friend
  commenters; Seed → Limited after 2 hours or 30 views; Global boost for Global posts at
  10+ answers and 50%+ positive or 5+ commenters from 2+ universities; Demoted at 10+
  Credible answers with 30%+ negative, or 30%+ hides once a post has 10+ views; Held at 3
  reports (at once, by trigger). Full is sticky. `private.feed_score` is the PRD formula
  (Q, E, R, D, gravity 1.5) plus placement (Limited outside the seed audience × 0.4, Global
  boost × 1.5, Demoted × 0.3, Shipped × 1.5 for 24 hours); relevance "same program" means
  same department, graduation year and university, "same batch" same graduation year,
  and skills overlap adds 0.1 per shared L1+ skill up to 1.3. Seed posts reach only their
  seed audience plus 1 exploration slot in every 5. `feed_page` stores each ordered list
  in `feed_sessions` keyed by its own session id (each tab keeps its own; up to 10 per
  reader); a session older than 10 minutes is re-ranked without the posts already
  served. The pinned announcement sits above and venture updates for followers below the
  ranked list. Every weight is in `platform_config` (`feed.*`).
- 2026-09-29 (phase 3, slice 6): Dates on cards (post times, event times, poll closing,
  comment and notification times) are formatted on the server and passed as text: Node's
  and browsers' ICU format en-GB dates differently, which broke hydration. Three older
  client components (skill list, GitHub sync status, two-factor panel) still format
  dates in the browser; they move to server-formatted labels when next touched.
- 2026-09-29 (phase 3): E2E axe checks wait for the streamed `<title>` first (Next 16
  streams metadata, so `<title>` can land after the body).
- 2026-09-29 (phase 3, slice 7): Chat core. A DM opens between friends or the two sides
  of an accepted application (PRD 5.9 "people you work with"), never across a block; a
  block closes the DM (hidden from the list, no new messages, history unreadable) and
  unblocking reopens it. Threads and memberships have no insert policies; only SQL
  functions create them. Each venture gets one group chat whose membership follows
  `venture_members` by trigger (existing ventures backfilled). Messages: up to 10,000
  characters and/or one image, 30 a minute; the sender can edit (marked "edited") and
  delete (the text is blanked and the row keeps its place, the image file is removed).
  Chat images are the server's WebP re-encode in the private `chat-media` bucket, read
  through 1-hour signed URLs. Messages arrive over Realtime `postgres_changes` (RLS
  applies to the stream). One unread message notification per thread (digest category
  `messages`); opening the thread marks it and the thread read. Typing, read receipts,
  replies, reactions, pins and search come with slice 8.
- 2026-09-29 (phase 3, slice 7): Muting a thread (8 hours, a week, or until unmuted)
  stops its notifications and leaves it out of the header's unread count; the thread
  list still shows its unread number so nothing is lost.
- 2026-09-29 (phase 3, slice 8): Chat extras. Replies quote a message in the same
  thread (not a deleted one). Reactions are the fixed six (👍 ❤️ 😂 🎉 😮 🙏), several
  per person, one of each, members only; blocked people's reactions are left out of
  counts. Pins: venture team chats only, by the venture owner, up to 3 (serialised per
  thread). DM read receipts are a per-person setting (`profiles.chat_read_receipts`, on
  by default, `/settings/chat`); `dm_receipt()` returns the other person's read mark only
  when both have them on, and a person with them off sends no "read" ping at all.
  Typing and "changed" pings (reactions, pins, read) go over a private Realtime
  broadcast channel `thread:{id}` whose `realtime.messages` policies admit members only;
  a ping carries no data, the receiver re-reads through SQL, so blocks and settings
  still apply. Chat search: a `tsvector` on messages with prefix matching of whole
  words (single letters dropped), across your threads or within one, newest first, 30
  results; the thread opens at a hit (`#m-{id}`) when it's among the loaded messages.
  Links in messages reuse the posts' preview queue; a preview appears once fetched
  (on the next load), not live.
- 2026-09-29 (phase 3, slice 8): Explore follows PRD 5.10 over the phase 1 note that the
  public card "can't be listed": people search lists card fields (name, username,
  department, batch, university) to any signed-in student, with photo and skills only
  where the profile is visible and the skill filter matching only visible skills.
  Never self or anyone blocked either way; at least 2 characters (no browsing the
  directory), 20 a page up to 200 deep, 60 searches a minute (shared with venture
  search). Venture search follows `browse_ventures` visibility (never Unlisted, never a
  blocked owner, University-only within the university) and returns the same row.
  Ranking is text match only (exact username first, then name similarity); nothing
  paid affects order. Listed in phase-3-questions.md (item 8).
- 2026-09-29 (phase 3, slice 9): Reports and minimal /ops. Reports cover posts, comments,
  chat messages, profiles (including the restricted card, which now carries the user id)
  and ventures; one per reporter and target, 60 s apart (`rate_limit`), never on your
  own content, only on things you can see. Reports on one target form one case
  (`report_cases`) holding a snapshot taken at report time; a resolved case reopens,
  unclaimed, when a new report arrives. A message report may attach up to 10 earlier
  messages from the same chat; they are copied into `report_messages` so later edits
  don't erase them, and staff read chat content only there. Each distinct post
  reporter raises `post_stats.reports` (3 hold the post, slice 6); 3 Appropriate
  crosses from non-friends open a soft-signal case with no reporter.
- 2026-09-29 (phase 3, slice 9): Moderators (`is_staff('moderator')`, so two-factor) see
  the queue oldest first, must claim a case before acting (another moderator can't take
  it), and choose dismiss, remove or warn with a reason; every claim, release and
  decision writes `ops_audit_log` in the same transaction. Dismiss resets a held post's
  report count and restores its computed stage. Remove hides posts from everyone (the
  author too) via `can_view_post`, and blanks comments and chat messages; a removed
  message's image file stays in the private bucket (only its sender can delete files)
  and is unreachable from the app. Profiles and ventures can only be warned here.
  Warnings are rows in `sanctions` (kind warn); suspend and ban wait for phase 11. The
  owner gets an in-app notification (category "Account and safety", in-app by default
  per the 2026-09-28 email rules) linking to `/moderation/[id]`, which shows the content
  excerpt and the moderator's reason, never who reported or decided. Appeals: phase 11.
- 2026-09-30 (phase 3 answers): Email budget. Supabase Auth's emails (verification codes,
  magic links) go through the same Resend account (custom SMTP), so the free plan's ~100
  a day is shared by auth, security and notification emails. The notify-worker now stops
  notification emails at 60 in a UTC day (`DAILY_CAP`) and parks the rest until the next
  day; instant ones older than 12 hours by then fall back to in-app only. Auth and
  security emails never pass through that queue, so they are never counted or held.
  Replaces the 80-a-day warning (2026-09-28). Upgrade Resend to a paid plan before the
  closed beta (setup checklist).
- 2026-09-30 (phase 3 answers): Digest stays at 18:07 PKT; staff announcements and
  Shipped posts stay as built in slice 3; link previews stay without images.
- 2026-09-30 (phase 3 answers): Post images stay in the public bucket, and files are now
  always deleted when no longer used: triggers queue the path (pgmq `storage_cleanup`)
  when a post's images go (post deleted, or removed by moderation, which also drops its
  image rows), when a chat image's message is deleted or removed, and when a profile photo
  is replaced or cleared. The `storage-cleanup` Edge Function (woken each minute by
  pg_cron, service role, Storage API) deletes them in batches per bucket; a failure is
  retried a minute later, up to 5 times.
- 2026-09-30 (phase 3 answers): Explore people search. Names and usernames are found at
  every university (card fields only; the 2-character minimum, 20-a-page, 200-deep and
  60-a-minute guards stay). Department and batch, whether as filters or as words in the
  query, only reach the searcher's own university plus profiles set to Global. Explore
  gains a batch filter.
- 2026-09-30 (phase 3 answers): Chat reactions are one per person per message: choosing a
  different emoji replaces yours, the same one takes it back (primary key
  `(message_id, user_id)`; duplicates from before were collapsed to the latest).
- 2026-09-30 (phase 3 answers): Moderation notices ("Account and safety": removals,
  clears, unlisting, warnings) are instant email by default.
- 2026-09-30 (phase 3 answers): Moderators may also clear a profile's bio and photo
  (`clear_profile`; the photo file is deleted) and unlist a venture (`unlist`), each with a
  reason, the before/after in `ops_audit_log`, and an instant-email notice to the owner
  saying which action was taken. Suspend and ban stay in phase 11 (emergency procedure
  until then).
- 2026-09-30 (phase 3): Production end-to-end check done by Ahmed (signup → GitHub →
  venture → post → survey → chat on production with real accounts); Phase 3 complete.
  Phase 4 starts in a new session.
- 2026-09-30 (tests): `01_job_runs` uses its own job name (`pgtap-probe`) instead of
  `feed-stage`, which the real every-5-minutes cron job also writes; the old name made
  the test fail whenever that job had run on the database first.
- 2026-09-30 (Ahmed, phase 4 plan): Phase 4 ships in six slices, one PR each: endorsements;
  L3 and L4 levels; credentials with the /ops trust queue; code checks; the ranking engine;
  leaderboard, /me/score and tier badges. Claude merges each slice once CI is green and keeps
  open points in `docs/phase-4-questions.md`.
- 2026-09-30 (Ahmed, phase 4 answers): Endorsements. "5 skills per teammate per venture" is
  per (endorser → endorsee, venture). Only current members of a shared in-progress or completed
  venture endorse each other; blocked pairs are refused. Endorsers can't withdraw; the endorsee
  hides and unhides. Endorser weight by the endorser's tier from the previous nightly run: Raw
  0.5, Spark 0.7, Flare 0.9, Shine 1.1, Radiant 1.3, Luminary 1.5, not ranked 0.5 (teachers
  1.5 from phase 7). Mutual: if B has endorsed A anywhere, both directions count × 0.5.
- 2026-09-30 (Ahmed): L4 from endorsements needs evidence-tied endorsements of the skill from
  at least 2 different teammates, who may come from any of the student's ventures (so a
  2-person team can still reach L4 through a second venture). The evidence is one of the
  endorsee's contribution entries in that venture that is tagged with, or detected as, the
  skill. A teacher's evidence-tied endorsement counts alone from phase 7.
- 2026-09-30 (Ahmed): Ring detection. Reciprocity alone is not a ring (every honest team
  endorses each other after completion; the mutual × 0.5 covers it). A group where every pair
  endorsed each other within 180 days is a ring only when none of the ventures they endorsed
  through has outside evidence (completed with a deliverable, or counted GitHub commits from the
  endorsee). Ring endorsements count 0 and raise an `anti_gaming_flags` row; a trust reviewer
  clears it (weight restored) or upholds it (stays 0). Thresholds live in `platform_config`.
- 2026-09-30 (Ahmed): L3 and L4 sources. Manual contribution entries get up to 3 optional skill
  tags from the venture's tags; a teammate's confirmation makes those skills L3. A confirmed
  "before Skilient" commit entry gives L3 for the skills detected in that commit. Commits made
  after the venture started (auto-verified, never confirmed) don't give L3. L3 and L4 don't need
  a lower level first, except the code check, which needs L2 code. Merged PRs count for L3 (and
  Work) only when merged or approved by a different, non-bot GitHub account at least 90 days
  old at merge time, in a repository whose owner isn't the student (organisation repositories
  count); PRs are found through GitHub search (public) plus the student's installation
  (private).
- 2026-09-30 (Ahmed): Code checks. Until teachers (phase 7) every check goes straight to /ops;
  graders are trust reviewers (and super admins) on two-factor, never a friend or venture
  teammate of the student. Moderators keep reports only (PRD 5.26 over the "moderator or
  trust_reviewer" wording in the phase brief). Claude drafts about 8 fixed, generic change
  requests per skill category for Ahmed to review; skill-specific ones come with teachers and the
  ops editor. The 30-day clock starts when the code is first shown; a timeout counts as an
  attempt and submits what was saved; ungraded checks stay in the queue marked overdue after
  72 h; answers ≤ 2,000 characters. Rubric: 4 parts pass/fail with a comment, pass = 3 of 4.
  The student requests a check from the skill drawer and answers at `/me/code-checks/[id]`.
- 2026-09-30 (Ahmed): Credentials. PDF limit is **5 MB** (not the PRD's 10 MB): Supabase stays
  on the Free plan, whose storage is 1 GB in total. Images are shrunk in the browser and
  re-encoded on the server (EXIF/GPS stripped); PDFs go from the browser straight to the private
  bucket as-is. Recognised issuers seed: HEC, NAVTTC, PSEB, PIAIC, National Freelance Training
  Programme (NFTP), DigiSkills, Google, Microsoft, AWS, Cisco, Oracle, Meta, IBM, CompTIA,
  Linux Foundation, Red Hat, Huawei; the reviewer picks the issuer when approving. Approved
  credentials show on the profile (title, issuer, dates) wherever the full profile is visible;
  files are owner and reviewer only. Review target 72 h (age timer, no automatic action). A
  student may delete any credential.
- 2026-09-30 (Ahmed): Supabase stays on the **Free plan** by choice; nothing is planned around
  a Pro upgrade (this corrects the phase 4 plan's note). Credential storage has to fit in 1 GB,
  so storage use is reported (bytes per bucket against the 1 GB quota) where staff see it
  coming.
- 2026-09-30 (Ahmed): Formula v1 details. Creator 1.3× goes to the owner at completion. Verified
  share: GitHub entries count once per active day (PKT), peer-verified manual entries 1 each,
  unconfirmed manual entries 0.25; the median is over current members at completion; a median
  of 0 gives a share of 1 to anyone with an entry. Complexity = 0.8 + 0.5 × the average of
  (team size − 2)/4, (weeks − 1)/15 clamped, min(skill tags, 8)/8 and min(deliverables − 1, 3)/3,
  stored at completion (existing completed ventures backfilled). Post quality index = the feed's
  Q × 100 for surveyable posts with ≥ 5 answers, ≥ 3 of them from non-friends; Content quality
  = min(175, average index × log2(1 + posts)). Consistency counts the last 12 ISO weeks (PKT);
  content quality and citizenship are all-time; decay applies to the Momentum total.
  Citizenship: +4 per join request answered within 72 h (up to 40) and +2 per teammate entry
  confirmed (up to 40).
- 2026-09-30 (Ahmed): Decay is linear: 2 points of every 100 of Momentum per full inactive week
  after day 14, never below 40% of the peak. A post, a contribution logged or confirmed, a
  verified PR or an answered join request resets the clock. Exam days don't count toward the
  inactive weeks. Decay is computed from the data in the nightly run (reproducible), not
  applied by a separate stateful job. Until university admins (phase 9), `accounts` staff enter
  exam periods at `/ops/exam-periods` (≤ 45 days each, with a reason, audited). None are seeded
  or imported; NUTECH's are entered by hand once the page ships.
- 2026-09-30 (Ahmed): Tiers. A student drops a tier only after 14 straight days failing it
  (points or any other requirement, percentile included), down to the highest tier still met;
  rising is immediate; no points band; exam periods don't pause this clock. "Active in ≥ 2
  ventures" = a peer-verified entry in each of 2 in-progress or completed ventures; "3
  endorsements" = 3 that count (not hidden, weight above 0); "ranked" = at least one
  peer-verified contribution. Luminary is out of reach until phase 7 or 8.
- 2026-09-30 (Ahmed): Penalties. Remove and Warn in /ops gain a severity (low 50, medium 150,
  high 300 points); a penalty lasts 12 months.
- 2026-09-30 (Ahmed): Rapid gain. Gains from venture completions that pass every completion
  rule and have no open ring flag are exempt. Still flagged: more than 2 completions in 7 days,
  and any gain over 150 in 24 hours that doesn't come from a completion. The first computation
  and formula changes are exempt. While a flag is open the published score and tier stay at the
  day before; clear lets the gain count from the next nightly run; uphold records a negative
  adjustment equal to the held gain.
- 2026-09-30 (Ahmed): Nightly ranking is one SQL procedure run by pg_cron at 03:07 PKT in
  committed batches of 500: rings → components → rapid-gain holds → percentiles and tiers →
  Sunday snapshot. It replaces the PRD's Edge Function and separate 03:00/04:00/05:00 jobs,
  because a gain has to be held before it counts.
- 2026-09-30 (Ahmed): Leaderboard. University scope (default) with department and batch filters,
  and Global with no filters (the Explore rule: department and batch reach only your own
  university). Rows show name, username and university, the photo only where the profile is
  visible, rank, tier and weekly rank change; points are never shown to others; blocked people
  are hidden; ties share a rank (1, 2, 2, 4). Everyone is on the boards by default, with an
  opt-out in Settings → Privacy. Tier badges on the profile, post cards, Explore rows, team cards
  and the leaderboard, not in chat. Phase 4 notifications form a "Trust and ranking" category,
  in-app only by default. The /ops evidence queue gains a GitHub flags tab for the phase 2
  `resolve_review_flag`.
- 2026-09-30 (phase 4, slice 1): Endorsements as built. `endorse(endorsee, venture, items,
  note)` takes up to 5 skills in one call, each with an optional evidence entry (one of the
  endorsee's original entries in that venture), and one note for the call; each endorser's
  calls are serialised (advisory lock) so the limits hold under parallel requests. The limits
  live in `platform_config` (`endorsements.limits`). The endorsee gets one "Trust and ranking"
  notification per call naming the skills; completing a venture sends every member, the owner
  included, an "Endorse your teammates" notification that opens the Team tab's sheet
  (`?endorse=1`). The endorser reads what they gave from the table but never the hidden flag;
  everyone else reads through `endorsements_for()`: whoever may see the full profile sees the
  shown endorsements, with the endorser's name always (they are a teammate), their profile
  link and photo only where that endorser's own profile is visible, and the venture's title
  only where the venture is. Peer-verified (2+ different teammates, hidden ones not counted) is
  kept on `user_skills.peer_verified` by triggers and shows as a check on the skill chip and a
  line in the drawer. Endorsements show on the profile's Overview, grouped by skill; the owner
  hides or shows each one there. Ring weights and the L4 rule come with slices 5 and 2.
- 2026-09-30 (phase 4, slice 2): L3 and L4 as built. Levels are now computed from all
  current evidence, L3/L4 included: `recompute_user_skills` merges L1–L2 from commits with
  L3 proofs (`l3_skills`: counted pull requests; manual entries tagged with the skill whose
  current version a teammate confirmed; confirmed "before Skilient" commit entries, for the
  skills found in that commit) and L4 proofs (`l4_skills`: evidence-tied endorsements from 2+
  different teammates across any ventures, the evidence entry showing that skill). A skill
  with only L3/L4 proofs gets a level without any GitHub evidence. A correction needs a fresh
  confirmation; hiding an endorsement can lower L4 to L3. This replaces the phase 2 rule that
  L3/L4 are "never lowered": nothing set by hand survives a recompute.
- 2026-09-30 (phase 4, slice 2): Contribution entries take up to 3 of the venture's skill
  tags (`contributions.skill_ids`; corrections carry their own). Endorsement evidence must
  now show the skill it vouches for (tagged with it, or a GitHub entry whose commit shows it);
  the endorse sheet offers only matching entries per skill.
- 2026-09-30 (phase 4, slice 2): The GitHub `prs` stage runs after each discovery (outside the
  sync's progress count): one search of the student's newest 100 merged pull requests
  (`type:pr is:merged author:<login>`, user token), then one `pr` message per pull request not
  recorded before. A pull request counts when its base repository's owner isn't the student
  and the merger, or else an approving reviewer, is a person (not a bot) other than the author
  whose GitHub account was at least 90 days old at merge time; its files (only for counted ones)
  go through the commit detectors. `github_pull_requests` / `github_pr_skills` keep ids, paths
  and flags only, owner-only, and survive a disconnect. Merged `pull_request` and approving
  `pull_request_review` webhooks queue that pull request again. Search's own small rate limit
  (30 a minute) no longer counts against a token's core budget. Private pull requests the
  student's token can't read are skipped.
- 2026-09-30 (phase 4, slice 3): Credentials as built. A PDF (up to 5 MB) goes from the browser
  straight into the student's own folder of the private `credentials` bucket (storage policy:
  own folder, a fresh uuid name, a cap on files); the server action then downloads it, checks
  it starts with `%PDF-`, and only then attaches it; anything else is deleted. An image is
  shrunk in the browser (2,000 px) and re-encoded to WebP on the server with sharp (EXIF and
  GPS stripped) before it is stored. `submit_credential` takes the type and size from storage,
  not the browser, and refuses a future issue date, an expiry before the issue date, a file
  already attached, more than 5 waiting or 20 kept (`credentials.limits`), and more than 10
  submissions a day. Profiles show approved, unexpired credentials (title, issuer, dates,
  "Recognised issuer", the student's optional verification link) wherever the full profile is
  visible; files are readable only by their owner and trust reviewers on two-factor (60-second
  signed URLs). `/me/credentials` is reached from Settings until the phase 6 "Me" area.
- 2026-09-30 (phase 4, slice 3): /ops is open to every staff role on two-factor; each area
  checks its own role (moderators: Reports; trust reviewers: Evidence). `/ops/evidence` has
  Credentials (oldest first, with a suggested recognised issuer), Reviewed credentials (30
  days) and GitHub flags. Credentials and GitHub review flags are claimed before they're
  decided (`claim_credential`, `claim_review_flag`; a reviewer can't take their own), and every
  claim, release and decision writes `ops_audit_log` with its reason; `resolve_review_flag`
  now requires the claim and writes the audit row too. The student is notified of each
  decision (Trust and ranking, in-app) and reads the reason on `/me/credentials`; the
  reviewer's name is never shown to them. A daily job (00:13 PKT) expires approved
  credentials past their date, deletes rejected files after 30 days and uploads never attached
  after a day, through the storage-cleanup queue (which now accepts the credentials bucket and
  its PDFs). Staff see storage use against the Free plan's 1 GB on every /ops page, marked
  "Nearly full" from 80% (`storage_usage()`, `storage.quota_bytes`).
- 2026-09-30 (tests): Two E2E races seen under `--workers=2` fixed in the tests: the chat test now
  waits for the optimistic "sending" mark to clear before the other person opens the thread,
  and the credentials test waits for the delete dialog to close (an open dialog hides the page
  from the accessibility tree, so "gone" checks passed early).
- 2026-09-30 (phase 4, slice 4): Code checks as built. A student asks for one from the skill
  drawer; they need GitHub linked and the skill at L2 from their own commits (the L2 counts on
  `user_skills`, whatever the shown level), no open check, no pass yet, and no attempt on that
  skill in the last 30 days (5 requests a day). The GitHub worker's `code_check` stage picks a
  run of 20–40 consecutive lines the student added in one of their counted commits for the
  skill (the commit's patch, numbered as in the new file) and records only the repository,
  commit, path and line range. The `code-check` Edge Function shows those lines, read from
  GitHub's contents API at that commit each time and never stored, only to the student during
  the attempt or to the trust reviewer who claimed it on two-factor; it checks the caller's
  token with Supabase Auth (`/auth/v1/user`) and takes aal from its claims. The Next server
  calls it with the user's session (no browser CORS). The 10 minutes and the 30-day clock start
  when the code is first shown, not when Start is pressed, so a GitHub or network failure never
  costs an attempt: code GitHub no longer shows before it was seen makes the check unavailable
  (not an attempt). The change request stays hidden until the code is shown. Answers autosave
  and are handed in at zero; the server takes nothing after 30 s of grace. A 5-minute job hands
  in timed-out checks (failing those with no answers), expires checks not started within 7 days
  and gives up on ones never prepared or never shown. The bank of 48 generic change requests (8
  per category) is sent to Ahmed for review.
- 2026-09-30 (phase 4, slice 4): Grading: every check goes to /ops (Evidence → Code checks)
  until teachers (phase 7). A grader can't be the student, a friend or a venture teammate. The
  reviewer claims a check (the code shows only then), marks the four rubric parts met or not
  with optional comments and writes feedback; 3 of 4 passes. Claim and grade are in
  `ops_audit_log`; the student is notified and reads the rubric and feedback, never who graded.
  A pass makes the skill L4 (`l4_skills` now includes passed checks) and shows in the drawer's
  proofs. Checks waiting more than 72 hours are marked overdue in the queue; nothing happens to
  them automatically.
- 2026-09-30 (phase 4, slice 5): The nightly ranking is a small state machine instead of one
  SQL procedure. A procedure that commits between batches can't pin its `search_path`, and the
  advisors gate (`function_search_path_mutable`, fail on warn) requires every function to pin
  it. So `ranking-nightly` (03:07 PKT) starts a run (`ranking_runs`, one per PKT day, with the
  formula and an as-of time fixed for every batch) and the per-minute `ranking-step` job does
  one committed step: rings → students in batches of 500 (compute, rapid-gain check, publish)
  → percentiles and tiers → the Sunday snapshot. Each run is in `job_runs`. A failed step marks
  the run failed; the next night starts a new one. `private.ranking_run_all()` runs a whole
  night in one call (pgTAP, or a manual rerun from the SQL editor).
- 2026-09-30 (phase 4, slice 5): Every weight is in `platform_config` `ranking.formula` (caps,
  Work, complexity, skill points and bonus, endorser weights, credential points, the three
  Momentum parts, decay, penalties, tier points and milestones, ring window, rapid-gain limits,
  batch size); the version of that row is the formula version each score records. One SQL
  function per component (`score_work`, `score_skills`, `score_endorsements`,
  `score_credentials`, `score_momentum`, plus `score_adjustments`) returns capped points and the
  evidence ids; `compute_ranking(user, as_of)` is pure over the data. Components are rounded to
  2 decimals after their caps and the total is their sum, never below 0. The 10 reference
  students are worked by hand in `docs/ranking-reference.md` (pgTAP `32_ranking_reference`).
- 2026-09-30 (phase 4, slice 5): Work details. A completed venture's owner, team, weeks
  (created to completed), tags, deliverables, verified members and each member's units are
  frozen at completion (`venture_completions`, `venture_completion_members`; earlier
  completions backfilled from the venture as it stood). A venture counts only if those pass
  every completion rule (≥ 2 members, a deliverable, ≥ 2 verified members). A confirmed
  "before Skilient" GitHub entry counts as a GitHub day; an unconfirmed one counts 0.25 like
  any unconfirmed entry. Completion also creates the Shipped post, which counts as activity.
- 2026-09-30 (phase 4, slice 5): Tiers are cumulative: each tier needs its own milestone and
  every lower tier's (a top-10% student with no L3 skill stays Flare). Percentile is
  `percent_rank()` of the published total over ranked students on the whole platform; "top
  X%" means a percentile of at least 1 − X (with 1,000 distinct totals, exactly the top 100 and
  top 20). Tier and percentile change only in the tiers stage, so every endorsement in a run is
  weighed by its endorser's tier from the previous run. Tested on 1,000 synthetic students
  (`33_ranking_tiers`).
- 2026-09-30 (phase 4, slice 5): Momentum's peak is the highest Momentum earned before decay;
  the 40% floor never lifts Momentum above what the student earned now. Consistency counts a
  student's contribution entries (GitHub ones included), counted pull requests and posts that
  weren't removed; removed posts don't count anywhere.
- 2026-09-30 (phase 4, slice 5): Rings as built. "Endorsed each other within 180 days" means
  the two endorsements are within 180 days of each other (a ring doesn't expire with time).
  Outside evidence is checked per endorsement: its venture is completed with a deliverable, or
  the person endorsed has a GitHub entry in it. A pair is already a ring; connected rings share
  one flag. Endorsements a reviewer decided stay decided (a later endorsement between the same
  people is a new flag); an open flag follows its group and closes itself (cleared, no
  reviewer) once the group is no longer a ring.
- 2026-09-30 (phase 4, slice 5): Rapid gain as built. The gain is measured against the
  published total (or, after a clear, the cleared total). New completions are exempt up to the
  Work gain, except for a student in an open ring. "More than 2 completions in 7 days" is
  flagged when a new completion arrives. An upheld gain becomes a negative adjustment that
  doesn't expire. The first computation and formula changes are exempt.
- 2026-09-30 (phase 4, slice 5): Penalties as built. Every decision that upholds a report
  (Remove, Clear bio and photo, Unlist, Warn) needs a severity (low 50, medium 150, high 300);
  Clear and Unlist are Remove for profiles and ventures, so they take one too. The penalty goes
  to the content's owner, lasts 12 months from the decision, and is in the audit log.
- 2026-09-30 (phase 4, slice 5): Exam periods as built: `accounts` staff (and super admins) on
  two-factor add and remove them at `/ops/exam-periods` with a reason, each audited; at most 45
  days both ends included; one university's periods never overlap. Students read their own
  university's periods (for the score page's pause notice). None are seeded.
- 2026-09-30 (phase 4, slice 5): Snapshots keep points per component only, not the evidence
  lists, so a year of weekly history stays small on the Free plan's 500 MB database.
- 2026-09-30 (phase 4, slice 6): Leaderboards as built. A board is every ranked student with
  onboarding done who hasn't opted out: the viewer's university (optionally one department and
  one batch) or global. Ranks come from the published totals (ties share a rank, then name
  order), so they only move with the nightly run. Ranks are computed before hiding people
  blocked with the viewer, so everyone sees the same rank for the same student (blocked rows
  just don't show). Weekly change is the rank change on the same board since the last Sunday
  snapshot before today, "New" for anyone not on it then. Pages of 50. The viewer's own place
  is pinned above the board with their points (the only place, with /me/score, where points
  show). The opt-out lives in Settings → Privacy (`profiles.leaderboard_opt_out`).
- 2026-09-30 (phase 4, slice 6): Tier badges come from one `tiers_for(ids)` call per page (none
  for people blocked with the viewer) and show on the profile header (restricted card
  included), post cards, Explore people rows, venture team cards and the leaderboard; not in
  chat. The header gets a "Leaderboard" link until the phase 6 shell.
- 2026-09-30 (phase 4, slice 6): /me/score shows the published score: total, tier and this
  week's change; each component with its points, its cap, the change since Sunday and the
  evidence behind it (ventures with role, complexity and share; skills; endorsers with weight,
  mutual and ring marks; credentials; scored posts; active weeks; citizenship; penalties
  linking to the moderation notice); notices for a held gain, an exam pause, decay and a
  pending tier drop (with its date); and what the next tier needs (`next_tier_requirements`).
- 2026-09-30 (Ahmed, phase 4 wrap-up): Phase 4 answers. "Clear bio and photo" and "Unlist" cost
  no points by themselves; only Remove and Warn do (severity required there). A moderator can
  give a severity on Clear or Unlist to add a Warn alongside (a warning sanction, a notice and
  the penalty) when the content deserved one (migration `*_penalty_rules.sql`, pgTAP `36`).
  Tiers stay cumulative (a top-10% student with no L3 skill stays Flare). `/me/credentials`
  stays reached from Settings and the own profile until the phase 6 Me area. Students never see
  who reviewed a credential; the reviewer is stored with every decision (`credentials.reviewer_id`,
  `code_checks.grader_id`, `review_flags.reviewer_id`, `anti_gaming_flags.reviewed_by`,
  `report_cases.resolved_by`, and `ops_audit_log.staff_id` on every step) for audits and phase
  11 appeals: confirmed, nothing to add. The nightly run stays a 03:07 PKT start plus a
  one-step-per-minute job.
- 2026-09-30 (Ahmed, phase 4 wrap-up): Two-factor is on for ahmedmursileenf23@nutech.edu.pk and
  the Phase 4 grant SQL was run, so that account has trust_reviewer and accounts. NUTECH exam
  dates will be entered by hand at /ops/exam-periods; none are seeded or imported. The Phase 4
  production check (`docs/phase-4-production-check.md`) is **deferred** to just before the
  closed beta; it has not been done and Phase 4 is not marked passed on it.
- 2026-09-30 (Ahmed): Adopted token-discipline working rules to keep sessions within budget.
- 2026-10-01 (Ahmed, phase 5 plan): Phase 5 ships in three slices, one PR each: the signing
  core (tables, SQL snapshot builder, `cv-sign` Edge Function, key file, monthly refresh);
  screens and control (`/me/cv`, share links, `/verify/[code]`, revocation, view counts); PDF
  export and the five ATS templates. Technical choices approved:
  - Signing happens in the `cv-sign` Edge Function, not a Vercel server action (PRD build note):
    reading Vault from Vercel would need the service-role key or the database password in a
    user-facing action. The function reads the private key from Vault over its direct
    connection, like `code-check`. The snapshot is built in SQL (`private.cv_snapshot`), one
    builder for the first CV and the monthly refresh; `lib/cv/types.ts` holds its type.
  - Ed25519 from Web Crypto (Deno and Node 22), no `@noble/ed25519`; our own RFC 8785
    canonical JSON (`supabase/functions/_shared/cv/canonical.ts`), tested against the RFC's
    examples.
  - The signature covers the SHA-256 digest of the canonical JSON of
    `{v, code, key_id, issued_at, expires_at, snapshot}`, so it can't be reused under another
    code or date. The snapshot holds integers and strings only.
  - The recruiter API's signed JSON waits for phase 8; `/.well-known/skilient-cv-keys.json`
    explains how to check a signature.
- 2026-10-01 (Ahmed): CV signing key. Nobody creates it by hand: `cv-sign` generates the pair
  and puts the private half straight into Vault (`cv_signing_key:<key_id>`); it never reaches
  Vercel, the repo or a person. `select private.cv_rotate_key();` (SQL editor) creates the first
  key and any later one. **No automatic yearly rotation**; rotation is manual, for emergencies and
  the rotation test. A rotated-out key's private half is deleted from Vault; its public half
  stays in `signing_keys` and the key file forever, and each record names its key, so old CVs
  keep verifying. Because the Free plan has no database backups, a copy of the key file is
  committed to `docs/signing-keys/` after every rotation (setup checklist). A leaked key: rotate,
  then revoke what it signed (procedure, not a feature).
- 2026-10-01 (Ahmed): CV content. Deliverables are a count, never links (PRD 5.28 over 5.18);
  public repositories are named, private ones read "Private repository". The tier always shows;
  the percentile shows as "Top N%" only within the top 50%, and is off by default for students
  who opted out of the leaderboard (they can switch it on in CV settings). The summary is one
  template: "{Department} student at {University}, class of {year}, with verified work in {top
  3 skills} across {n} ventures ({m} completed). {Tier} tier on Skilient, top N%." with a
  merged-pull-request sentence, each part dropped when empty. **Department, not programme**:
  programme is free text and a signed CV shouldn't present unchecked text as verified.
  Endorsements: up to 5, tied to evidence, not hidden, one per endorser, higher endorser tier
  first then newest, with the endorser's full name, venture, skill and note ("note by …").
  Contact: "Contact through Skilient" linking to `/verify/[code]` (phase 8 adds the recruiter
  contact button there); showing an email is opt-in and only the verified university email.
- 2026-10-01 (Ahmed): CV visibility is Private (owner only; links paused), Link (default: anyone
  with a valid share link) or Recruiters (Link plus recruiters on Skilient, from phase 8). No
  public option ("no public profile pages") and no CV view for other students.
- 2026-10-01 (Ahmed): Share links need Spark or above when created; 7, 30 or 90 days or no expiry;
  up to 10 active, each with an optional label; only a hash of the token is stored, so the link
  is shown once. A link always opens the **newest** version; if that version is revoked the link
  shows "no longer available" until a new version is issued, and never falls back to an older
  one. Views are counted with no IP stored. Dropping below Spark keeps existing links working
  until they expire or are revoked.
- 2026-10-01 (Ahmed): Monthly refresh: every student with a CV, whatever their tier (5.18's
  text over its build note's "Spark+"), at 00:30 PKT on the 1st, only if the snapshot changed;
  a new version gets a new code, the previous shows Superseded, no PDF is made, in-app notice
  only. The first CV is issued when the student first opens `/me/cv`. Free students' section
  and order changes apply at the next refresh; Pro "Refresh now" (10 a day) stays off until
  phase 10.
- 2026-10-01 (Ahmed): Verify statuses, checked in this order: Not found, Revoked, Altered,
  Superseded, Outdated, Valid. Valid shows the CV, issue date, valid-until and key id;
  Superseded and Outdated the same with a notice (no link to a newer version); **Revoked shows
  only the code, issue date and revocation date — no name, no reason, no content**; Altered
  shows the genuine CV beside the message; Not found is generic. Codes print as XXXXX-XXXXX
  (Crockford base32) and are read case- and hyphen-insensitively; 30 lookups a minute per IP;
  noindex.
- 2026-10-01 (Ahmed): Revocation. The student revokes any version or link anytime, and after
  revoking the newest can re-issue the same content under a new code. A trust reviewer
  (two-factor) revokes from an /ops/evidence CVs tab with a reason, audited, student notified.
  A sign-in ban revokes every version and link (trigger on `auth.users.banned_until`; lifting
  the ban restores nothing). Account deletion revokes all and wipes the content, keeping code,
  dates and key so the verify page says Revoked. Later evidence changes, tier drops, Pro lapsing
  and graduation never revoke; they show in the next version. When a trust reviewer upholds an
  anti-gaming or ring flag, /ops prompts them to check that student's CVs and revoke if needed.
- 2026-10-01 (Ahmed): PDFs: headless Chromium in our own Vercel function (no outside service),
  one template set for web and PDF, fonts embedded, ligatures off, A4 default with Letter
  optional. **Before building templates, a feasibility spike renders one PDF in a Vercel function
  on the current plan and reports size, memory, duration and cold start; if it doesn't fit, stop
  and propose the alternative.** Each export gets its own hash row (`cv_pdf_exports`); files are
  deleted after 30 days, hashes kept. All five templates are built in slice 3, the four Pro ones
  as locked previews until phase 10. `private.has_entitlement()` stays false except for user ids
  in `platform_config` `entitlements.test_grants` (empty in production, SQL-only), removed in
  phase 10. View counts per link and total (30 days, all time); company names wait for phase 8.
- 2026-10-01 (Ahmed): The domain is **skilient.com**. Verify links and QR codes print
  `https://skilient.com/verify/CODE`, from `NEXT_PUBLIC_SITE_URL` at render or export time; CVs
  store only the code. Until skilient.com serves the app (planned before the closed beta),
  `NEXT_PUBLIC_SITE_URL` is `https://skilient.vercel.app` and any PDF exported is test-only.
- 2026-10-01 (phase 5, slice 1): Signing core as built. `signing_keys` (public, one active),
  `cv_settings` (owner-read; written by slice 2's function), `cv_records` (owner-read; written only
  by `private.cv_issue_commit` from `cv-sign`; `user_id` set null on account deletion so a
  tombstone can remain). Unlisted ventures stay off the CV (teammates didn't choose to show
  them); up to 10 projects, 20 pull requests, 15 skills. The monthly job is `cv-refresh`
  (19:30 UTC on days 28–31; the function acts only when it is the 1st in PKT), queueing pgmq
  `cv_jobs`, drained by `cv-sign` woken each minute (`cv-worker`); each run is in `job_runs`.
  A "first" issue does nothing once any record exists; a monthly one does nothing when the
  snapshot's hash matches the newest unrevoked version.
- 2026-10-01 (Ahmed): Slices 2 and 3 ship together in one PR (overrides "one PR per slice" for
  this phase).
- 2026-10-01 (phase 5, feasibility spike): Chromium on Vercel. The Vercel preview with
  `@sparticuz/chromium` 153 + `puppeteer-core` 25 built and deployed, so the function fits the
  plan's size limit (the package is 67 MB compressed). The preview itself couldn't be called:
  Vercel Authentication protects preview URLs, and this environment's network blocks
  `*.vercel.app`. The same Chromium build measured locally: 4.0 s cold (3.7 s unpacking
  Chromium), 0.4 s warm, 39 KB PDF, 285 MB Node memory. That fits Hobby's 2 GB and 60 s, so the
  build went ahead. The Vercel numbers come from the staff-only `/api/ops/pdf-check` after merge
  (setup checklist); if they don't fit, the fallback is a pure-JS PDF library (no Chromium).
- 2026-10-01 (phase 5): One CV document, two renderers. The PDF prints an HTML string
  (`lib/cv/document.ts`, every value escaped) and the web pages render a React component
  (`components/cv/cv-document.tsx`). Both draw one shared view, and a unit test keeps their
  markup identical for every template. Why: ESLint forbids `dangerouslySetInnerHTML`, and
  `react-dom/server` can't run inside a Next route handler. The QR code is an `<img>` with a
  data: URI (CSP allows `img-src data:`). The paper stays light in dark mode, like a printed page.
- 2026-10-01 (phase 5): PDF export records its SHA-256 only with a MAC from the PDF route:
  HMAC-SHA256 over export, version, template, paper, hash and size. The key is the Vault secret
  `cv_export_secret`, copied to Vercel as `CV_EXPORT_SECRET` (a human step). Without it, a
  student could register the hash of a doctored file through the API, which would defeat the
  Altered check. The route uploads to `cv-exports/{user}/{export}.pdf` as the student (no
  service-role key); the upload is allowed only while they hold `cv.pdf_export`, up to 100 files.
  `record_cv_export` checks the MAC, that the file exists with that size, that the version is
  the student's and not revoked, and 20 exports a day. Files go after 30 days, and unrecorded
  uploads after a day (`cv-exports-daily`, through storage-cleanup). Hashes stay for good.
- 2026-10-01 (phase 5): Five templates: Standard (free), Classic, Compact, Modern and Academic
  (Pro). All are single-column with the same headings and text; only the CSS differs. Fonts are
  Spectral 500/600 and Barlow 400/500/600, vendored as woff2 under the SIL OFL in
  `lib/cv/fonts/` and embedded in each PDF, with ligatures off. The web CV uses Standard for
  everyone until phase 10. The ATS test (`pnpm test:ats`, run in CI's E2E job) prints every
  template and checks with `pdf-parse` that the headings are in order and every skill, project
  title, name and code is there.
- 2026-10-01 (phase 5): `private.has_entitlement()` is still false for everyone except user ids in
  `platform_config` `entitlements.test_grants` (`{key: [ids]}`; empty in production). The E2E
  export test and Ahmed's optional try use it; phase 10 replaces it.
- 2026-10-01 (phase 5): Share-link views are counted once per viewer per link per day, keyed by
  an HMAC of the connection (IP and user agent, `IP_HASH_SECRET`), so no IP is stored. Verify
  lookups count 30 a minute per IP in `rate_limit_events` (scope `cv_verify`); page loads and PDF
  checks both count.
- 2026-10-01 (phase 5): The first CV is issued when `/me/cv` first loads, through `cv-sign` with the
  student's session; if signing fails the page says so. Re-issue (the revoked newest version's
  content under a new code, 5 a day) and Pro refresh (10 a day, stubbed off) also go through
  `cv-sign`. Account deletion keeps a revoked, content-wiped record (a trigger before the delete),
  and a sign-in ban revokes every version and link (a trigger on `banned_until`;
  `docs/emergency-ban.md` updated). Trust reviewers find CVs by code or username at
  `/ops/evidence?tab=cvs` and revoke one or all with a reason (audited; the student gets a
  `cv_revoked` notice, emailed). An upheld ranking flag's page links to each member's CVs.
  Monthly refreshes send an in-app `cv_refreshed` notice only.
- 2026-10-01 (phase 5, spike result on Vercel): `/api/ops/pdf-check` on production (`bom1`,
  Node 22.23) printed the full sample CV in 2.7 s cold (2.2 s launching Chromium) and 0.42 s warm.
  The PDF is 67 KB; memory is 175 MB for Node plus 142 MB for Chromium, about 320 MB against the
  function's 2 GB. That is inside the PRD 10 target (p95 under 10 s) and the plan's limits, so
  headless Chromium on Vercel stays; no fallback renderer is needed.
- 2026-10-01 (ops): The same production build logged Sentry's "Failed to create release: Network
  error / 502 Bad Gateway" after compiling. That is the source-map upload failing on Sentry's side;
  the deploy still went out, and only errors from that build show minified stack traces in Sentry
  (no source maps). No change: it is left alone unless it recurs on every build, in which case the
  Vercel env `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` get checked first.
- 2026-10-02 (phase 6, Opportunities): All seven tabs exist at `/opportunities/[tab]` and read one SQL
  function, `opportunities(tab)`, which returns no rows until jobs, contact requests and applications
  (phase 8), competitions and job fairs (phase 9) and project ideas (phase 7) fill it. Each empty tab
  says what belongs there and offers one action. "For you" is ordered by match alone and the UI only
  labels "Sponsored" on the Jobs tab; pgTAP 39 keeps the function text free of any sponsorship input.
  The application tracker route (`/opportunities/applications/[id]`) comes with phase 8.
- 2026-10-02 (phase 6, notification defaults): Kept per-category preferences (phase 3) rather than
  per type. The PRD's "instant email for contact requests and application updates" is not added now:
  only four categories may email instantly (Ahmed, 2026-09-28) and those two have no notification
  types until phase 8, which adds them as categories then. Feedback replies are a new category,
  default daily digest; deletion notices use the existing `account` category (instant).
- 2026-10-02 (phase 6, graduates): `profiles.status` (active, graduate, deleting), `graduated_at`,
  `delete_after`. One platform rule, not 200 university settings: the nightly `graduate-rollover`
  (00:10 PKT) graduates every student whose `graduation_year` is that year or earlier on and after
  1 September (Pakistan time; versioned in `platform_config` `graduates.rule`). `universities.final_year_batch`
  is only an optional exception that replaces the rule for one university, empty by default; accounts
  staff add or clear one at `/ops/graduation` (audited, with a reason). Nothing needs setting up for launch.
  A student who finishes early (December) is still treated as graduating that September.
  Triggers (not edits to the post and venture functions) refuse a graduate's University Feed post,
  application to, or membership of a university-only venture; the automatic "shipped" post is exempt.
  Graduates leave the university boards 12 months after `graduated_at`; the global board keeps them.
  Sponsored Pro is not built until phase 10, so the "graduates lose sponsored Pro" rule is left for
  that phase to honour.
- 2026-10-02 (phase 6, account deletion): Asking needs the typed username and starts 14 days; the
  account then reaches only `/settings/account/delete` (gate in `proxy.ts`), and cancelling restores
  it (graduates stay graduates). The hourly `account-deletion` job passes owned ventures to the
  longest-standing other member (a venture nobody else is on is deleted), queues the person's
  stored images for the storage worker, and deletes the auth user; cascades remove their posts,
  messages, endorsements given and credentials, notifications and reports keep only an empty actor,
  and the CV trigger leaves a revoked, content-wiped record. During the cascade `private.notify`
  ignores the person being deleted, so no notification points at a user that is going. Staff
  accounts can't start a deletion (a super admin removes them). No data export, per PRD 5.25.
- 2026-10-02 (phase 6, learning layer): Tours live in `lib/tours/*` (student now; faculty, recruiter
  and university-admin are empty until their portals), progress in `tour_progress`, tips in
  `tips_seen`, day-dismissals in `ui_state` (only two known keys). The tour uses `@floating-ui/react`
  with a focus trap, Esc to leave, an aria-live step announcement and no motion. Steps whose anchor is
  not on screen (Leaderboard on a phone) are skipped, so a phone sees 8 steps and desktop 9. It starts
  once on Home, resumes at its saved step, and `?tour=1` (Settings, "Take the tour") restarts it.
- 2026-10-02 (phase 6, checklist points): "Each shows its point reward" reads the formula in force:
  L2 skill 15, endorsement 15, completed venture 150 ("when it completes"); profile, GitHub and CV
  show no points because the formula pays none for them.
- 2026-10-02 (phase 6, privacy centre): Profile visibility, recruiter visibility and CV settings keep
  their existing homes and the centre shows their current value with a link; the leaderboard switch
  and blocked people are live there. Blocked companies wait for recruiters (phase 8), viewer names for
  Pro (phase 10) and "who at my university viewed my record" for phase 9, each said plainly on the page.
- 2026-10-02 (phase 6, feedback): Private `feedback` bucket (5 MB, WebP re-encoded by sharp, 10 a
  day per student). Staff triage at `/ops/feedback` for any staff role with claim and audit; a status
  change or reply notifies the student. The "Requests" link moved from the old header to the Ventures
  page (the Ventures nav badge counts applications and invites).
- 2026-10-02 (phase 6, design gates): The two screen-spec design gates (critique and audit passes)
  were not run as separate passes, per the token-discipline rule; axe (WCAG 2.2 AA) runs on every new
  screen in `student-portal.spec.ts`.
- 2026-10-02 (phase 6, deferred): The Phase 4 production check and moving skilient.com stay deferred,
  as asked; neither was run or ticked.
- 2026-10-03 (Ahmed, phase 7 answers): Teacher portal defaults. Until university admins exist (phase 9)
  Skilient `accounts` staff (two-factor) approve teacher requests and import faculty CSVs in `/ops/teachers`;
  `approve_teacher`, `revoke_teacher` and `import_faculty_csv` already accept a university admin of that
  university, so phase 9 only adds its screen. Staff check the university's public faculty page for
  requests that aren't on a CSV. Removing a teacher ends their supervisions and open requests, releases
  their code checks and closes their ideas; past reviews and endorsements stay, marked "former faculty".
- 2026-10-03 (phase 7, signup): Faculty sign up at `/signup?role=faculty` with a university email
  (domain kind `faculty` or `both`; not Google). They get a `faculty` profile with onboarding already
  complete, land on `/teach`, and ask for the teacher role at `/teach/apply` (department, title). A
  pending or removed teacher gets student permissions only: every `teacher_*` function refuses with
  42501 and the portal layout sends them to the apply page. A CSV email is approved the moment it asks.
  Faculty never appear on the leaderboard (only students are scored).
- 2026-10-03 (phase 7, limits): `platform_config` `teacher.limits` holds the launch values: 15
  supervisions at once, 40 endorsements a month, 5 skills per student per venture, weight 1.5, concentration
  flag at more than 30% of 90 days (minimum 10 endorsements so one of one isn't a flag), review due in
  14 days with reminders at 7 and 12, at most 3 open review requests per venture. The 15-supervision cap
  and the weekly grading cap hold under parallel requests (advisory lock per teacher), tested in
  `tests/worker/teacher-concurrency.test.ts`.
- 2026-10-03 (phase 7, ideas): Audience is "my university" (default) or global; a global idea needs no
  extra approval. An idea is open until the teacher closes it, its deadline (end of that day, Pakistan
  time) passes, or `max_teams` non-abandoned ventures started from it. After a team starts, only the
  limit, deadline, label and audience can change. "Start a venture from this idea" is `/ventures/new?idea=`
  (prefilled, project type, linked by `ventures.idea_id`) and invites the idea's teacher to supervise.
  Explore gets a "Project ideas" tab (newest first, never ordered by anything paid). There is no public
  teacher profile page (public profiles are banned); supervised outcomes stay in `/teach` and, from
  phase 9, in the faculty engagement panel.
- 2026-10-03 (phase 7, supervision): One supervisor per venture at a time (partial unique index; history
  kept). A venture owner invites any approved teacher at their university, or a venture started from an
  idea invites that idea's teacher. Supervisors and teachers with an open review request read the
  venture's full data through `private.is_venture_teacher()` (added to `can_view_venture` and two
  policies); they are not members, so they can't log work or use team chat. The supervisor thread is
  plain text (no images, no Realtime; it refreshes with the page), readable by the team and the active
  supervisor only. A supervisor's confirmation is a `contribution_confirmations` row with
  `confirmer_role = 'supervisor'`: faculty-confirmed, and peer-verified everywhere the existing rules look.
- 2026-10-03 (phase 7, reviews): Rubric v1 is stored as `{scope, technical, collaboration, documentation,
  outcome}`, each a 1 to 5 score with a required comment, plus an optional overall comment. The scores
  and comments are visible to the venture's members and the reviewing teacher only; everyone else who
  can see the venture sees "Reviewed by faculty", the teacher and the date. The CV snapshot gets
  `faculty_reviewed` (any review exists) and `faculty_confirmed` (count of the student's entries the
  supervisor confirmed) per project and never a score (`cv_snapshot` wraps the phase 5 function as
  `cv_snapshot_base`). Reviews don't change ranking. A teacher can decline a request; the owner can
  withdraw one; unanswered requests expire at 14 days. A second review of the same venture is allowed.
- 2026-10-03 (phase 7, endorsements): Teacher endorsements go into `endorsements` with
  `endorser_kind = 'teacher'`; only for members of ventures the teacher reviewed or supervised (an ended
  supervision counts), only for skills tagged in that venture, optionally tied to an entry. Ranking weights
  them 1.5 (config), an evidence-tied one reaches L4 alone and makes the skill peer-verified alone, and a
  counting one is Luminary's external signal (`facts.teacher_endorsement`). The concentration check runs
  inside the anti-gaming stage of the nightly run (`detect_rings` now also calls
  `detect_teacher_concentration`) and writes `teacher_concentration_flags` for a trust reviewer in
  `/ops/teachers` (clear or uphold, audited); nothing is removed automatically. Profiles label them
  "Faculty" or "Former faculty".
- 2026-10-03 (phase 7, code checks): A submitted check gets `due_at` (72 hours) and waits with the
  university's teachers who opted in for its skill (`routed_to_staff_at` null); with no eligible teacher it
  goes to Skilient reviewers at once. `teacher-reminders` (hourly; it also sends the review reminders and
  expiry and closes ideas past their deadline) moves a check unclaimed for 48 hours, or held by a teacher
  past 72 hours, to Skilient reviewers. `/ops` shows only routed checks and a trigger stops staff claiming
  an unrouted one. A teacher can't grade a friend, a teammate or a student in a venture they supervised
  (or supervised before); claims use `FOR UPDATE SKIP LOCKED`; the weekly cap counts claims held plus
  checks graded since Monday (Pakistan time). Grading reuses the four-part rubric and sends the student the
  same notification; the code-check Edge Function shows the code to the teacher who holds the check.
- 2026-10-03 (phase 7, digest): Teachers get no per-event emails: their notification types are in-app
  only (category `faculty`). `teacher-digest` (Mondays 09:00 Pakistan time) queues one email per approved
  teacher with something waiting (supervision invites, open and soon-due reviews, checks to grade, ideas
  closing within a week); the notify worker builds it from counts only, never student work, and skips an
  empty one. Teachers switch it off in `/teach/settings`.
- 2026-10-03 (phase 7, deferred): The faculty guided tour stays empty (tours are still student-only), and
  the faculty engagement panel, the `/uni/people` approval screen and supervised outcomes on a university
  dashboard wait for phase 9. The Phase 4 production check and moving skilient.com stay deferred, as asked;
  neither was run or ticked.

## Phase 8: recruiter portal (decisions)

- 2026-10-03 (phase 8, Ahmed's answers): All plan checks are a fail-closed stub until phase 10. `private.org_entitled(org, key)`
  is true only for a verified organisation named under a known key in `platform_config` `entitlements.test_grants`
  (`{key: [org ids]}`; unknown key = denied even if granted; SQL-only, empty in production); `private.consume_quota` and
  `org.trial_limits` (config: 3 seats, 5 contact credits a month, 1 live job slot) cover the limits; every check is in SQL, never
  in the browser. Phase 10 replaces the two function bodies and removes the test grants. Known keys: `talent.full_profile`,
  `saved_searches`, `analytics`, `competitions.create`, `api.access`.
- 2026-10-03 (phase 8, hires): A hire row stores the organisation, `kind` (`intern` for an internship, `full_time` otherwise), the job
  type and `hired_at`, with `fee_status = 'unbilled'`, so phase 10 can invoice exactly. Nothing is charged now. The 90-day question
  (`hire_outcomes`) goes to whoever hired, or an admin, through a notification and the recruiter home.
- 2026-10-03 (phase 8, Explore vs full): Strictly gated. Contact credits only pay for sending requests; they never reveal an
  anonymised candidate. Explore rows carry tier, skills with levels, university, department, batch and an activity band: no id,
  name, photo, username or link, and `talent_index` has no such column at all. Full results, and contact requests (which need an
  id), need `talent.full_profile`; a student reveals themselves by accepting. The trial allowance may include a few requests so the
  flow can be tested.
- 2026-10-03 (phase 8, competitions): Teams submit a GitHub repository URL (no GitHub App provisioning, no fake-GitHub worker).
  The `competition-freeze` Edge Function records each repository's latest commit at the deadline where GitHub lets it be read
  (public repositories; an optional `GITHUB_READ_TOKEN` secret raises the rate limit); private or missing ones are recorded as not
  readable. Repo provisioning by the Skilient GitHub App stays **deferred** (logged here, not ticked). Participants earn L3 evidence
  in the competition's skills; a winner badge counts as one L4 signal toward the endorsement threshold (a win plus one teammate
  endorsement), never L4 on its own.
- 2026-10-03 (phase 8, SSO): Skipped. `/org/plan` says to write to the Skilient team for SSO or an annual invoice.
- 2026-10-03 (phase 8, notices): Contact requests and application updates are in-app plus the daily digest by default (categories
  `contact_requests`, `job_updates`, `recruiting`, all `allow_instant`), and a student can switch either to instant email in
  Settings → Notifications. This changes the 2026-09-28 rule of four instant categories on purpose (Ahmed, 2026-10-03). Notices to
  students name the company, never the recruiter; a decline tells the recruiter that a student declined, not who. Saved-search
  matches leave one `saved_search_matches` notice per due search, which the recipient's digest emails.
- 2026-10-03 (phase 8, two-factor): Recruiters need two-factor at the route (`proxy.ts` for `/recruit` and `/org`) and in SQL
  (`private.require_org` and `create_organization` read the session's `aal`), so a session without it can read nothing. A
  recruiter who verifies their email with no authenticator goes straight to Settings → Security. Staff 2FA reset arrives in
  phase 11; until then `docs/recruiter-2fa-recovery.md` is the manual procedure.
- 2026-10-03 (phase 8, invites): Invites go to the organisation's own domain only (the cached `personal_email_domains` list and every
  other domain are refused), expire after 7 days and work once; only the SHA-256 of the 32-byte token is stored. The admin also gets
  the link on screen in case the email is slow or unconfigured. A recruiter accepts a waiting invite by id from `/org/join` once their
  email matches. One organisation per account; removing a member keeps their rows (inactive) so notes and shortlists keep an author.
- 2026-10-03 (phase 8, API): API routes call `anon`-executable SQL functions that take the bearer token and hash it themselves, so a
  leaked hash can't be replayed and no service-role key is involved. A token shows once, 60 requests a minute per token, and only
  students with a link (an application, or an accepted request or shortlist entry while visible) are reachable. Webhook URLs must be
  https and a public host; the worker repeats the link-preview SSRF checks (DNS, no redirects) at every delivery. The signature is
  `X-Skilient-Signature: t=<unix>,v1=<HMAC-SHA256 of "t.body">`; deliveries retry after 1 minute, 5 minutes, 30 minutes, 2 hours
  and 12 hours, and a webhook pauses after 30 failures in a row. The secret is a column only the worker can read (shown once).
- 2026-10-03 (phase 8, visibility): Turning recruiter visibility off removes the student from `talent_index` at once (a trigger, not
  the 15-minute refresh), hides their shortlist entries ("no longer visible", no name or link) and makes their notes unreachable
  until visibility returns; the notes themselves are kept. Account deletion anonymises the notes (text removed) and deletes the rest.
  A student who applied stays visible to that organisation through the application, and one who accepted through the open chat.
- 2026-10-03 (phase 8, deviations): `talent_index` is a table kept by functions, not a materialised view (a visibility change removes
  one row instead of refreshing a whole view; the 15-minute job still rebuilds it). The candidate "drawer" is only the page, and
  shortlist reordering uses move buttons (keyboard-operable) instead of drag; both are cheap to add in the phase 14 design pass. A
  recruiter conversation is an ordinary DM (`chat_threads.org_id`, `closed_at`) labelled with the company; the student closes it and
  nobody can write to it then. The candidate page shows a student's skills, ventures and endorsements to a verified organisation
  that may open them, and links the signed CV only when the student chose CV visibility "Recruiters". Availability, city and remote
  are new profile fields (Settings → Privacy). Recruiter filters are an allow-list; unknown keys (gender, age, religion, ethnicity,
  photo) are refused by the database, and every search writes `search_audit`.
- 2026-10-03 (phase 8, deferred): Company logo upload (a monogram for now), `/org/billing` and invoices (phase 10), the recruiter guided
  tour, reporting a recruiter (a new report target), account deletion for recruiters, and the hire fee itself (phase 10). The visual
  design-gate pass and in-browser screenshots are phase 14; this phase ran axe in both themes on every new screen instead.

## Phase 9: university portal (decisions)

- 2026-10-04 (phase 9, Ahmed's answers): All 29 planning defaults approved, with the changes noted inline below.
- 2026-10-04 (phase 9, plan stub): Billing is still phase 10, so a university's level is a fail-closed stub. `platform_config`
  `uni.test_plans` = `{university_id: "basic"|"growth"|"campus"}` (SQL only, empty in production). `private.uni_plan(u)` is
  `free` unless the university is claimed (has an owner) and listed there. `private.uni_entitled(u, key)` maps the plan through a
  fixed matrix for known keys only (`uni.dashboard`, `uni.exports`, `uni.student_records`, `uni.skills_gap`, `uni.outcomes`,
  `uni.faculty_panel`, `uni.benchmark`, `uni.accreditation`); an unknown key is denied. `private.uni_limit(u, key)`:
  `uni.admin_seats` 1/2/5/10, `uni.hackathons` 0/0/2/4, `uni.job_fairs` 0/0/1/2 (free/Basic/Growth/Campus). The student key
  `privacy.record_viewers` uses the existing `has_entitlement` test grants. Phase 10 replaces the body of `uni_plan()`.
- 2026-10-04 (phase 9, "per year"): Fair and hackathon quotas count a rolling 365 days from each one's creation (cancelled drafts
  don't count) until phase 10 switches to the licence year.
- 2026-10-04 (phase 9, admin accounts): University admins have the `university_admin` account role: never scored, never on
  leaderboards, no chat, created only through a claim or an invite. An existing faculty account may accept an admin invite and keep
  teaching (the portal comes from its `university_admins` row). Students can never be admins. Two-factor is required at the route
  (`proxy.ts` for `/uni`) and in SQL (`private.require_uni` reads the session's `aal`).
- 2026-10-04 (phase 9, claims): `/uni/claim`: sign up with an email on one of that university's `faculty` or `both` domains, verify,
  set up two-factor, then upload the authorisation letter or MoU (PDF, WebP after re-encode; **5 MB max**, Free plan storage) with a
  title. Accounts staff (two-factor) approve or reject with a reason at `/ops/universities`. One open claim per university; a
  claimed university refuses new claims ("ask your owner for an invite"). Letters are deleted 90 days after the decision.
  Disputes (two claims for one university, an owner who left) are fixed by staff in SQL: `docs/university-claim-disputes.md`.
- 2026-10-04 (phase 9, invites): Owner and admins invite by email on one of the university's domains; 7-day single-use tokens,
  only the SHA-256 stored, the link also shown on screen. Pending invites count toward `uni.admin_seats`, so a free university has
  only its owner. The owner can hand ownership to an existing admin (two-factor, audited).
- 2026-10-04 (phase 9, domains): The owner or an admin requests an extra domain with a reason; accounts staff approve it at
  `/ops/universities` and signup accepts it the moment it is inserted (source `ops`, never touched by the HEC sync). **Public email
  domains** (the phase 1 `personal_email_domains` list) can never become a university domain: refused in the app and by a trigger on
  `university_domains`.
- 2026-10-04 (phase 9, ecosphere visibility): `/u/[slug]` is for signed-in users only. Anyone signed in sees the branding, welcome,
  published pages and global events; announcements, university-only events, the teachers directory and the University Feed stay
  with that university's members.
- 2026-10-04 (phase 9, modules): Feed off: that university's students lose the University Feed and can't post to "my university"
  (Global stays). Events off: no university events listed or created. Project ideas off: university-audience ideas are hidden from
  its students (global ideas still show). Leaderboard off: the University scope disappears for them (ranking unchanged). Teachers
  directory and job board only toggle their ecosphere sections. Turning a module off never deletes data.
- 2026-10-04 (phase 9, branding): Primary and accent colours are used only inside `/u/[slug]`, never in the app shell. Each must
  reach 4.5:1 against `bg/page` in light (#F0EFED) and dark (#0A0A09) themes, checked by Zod in the action and by
  `private.contrast_ratio` in SQL on save, so a direct RPC can't bypass it. Logo and cover go through the sharp re-encode into a
  public `university-media` bucket.
- 2026-10-04 (phase 9, slug): Owner or admin may change the slug at most once every 30 days; reserved words are refused and **old
  slugs stay reserved for 90 days** (`university_slug_history`) so nobody else can take them; they don't redirect.
- 2026-10-04 (phase 9, departments): `departments(university_id, name)` and `programmes(department_id, name)`;
  `profiles.department_id` added, `profiles.department` text kept in sync by trigger so leaderboards, Explore and recruiter filters
  keep working (tested). When a university adds a department, existing profiles whose text matches (case-insensitive) are linked,
  and the migration backfills the same way. Students whose department isn't on their university's list are "Unassigned"
  (coordinators don't see them) and get a Home prompt. Batch labels are display only.
- 2026-10-04 (phase 9, onboarding questions): Up to 3 per university, **multiple choice only (2 to 6 options), no free text**,
  optional to answer. New students see them after step 1 of onboarding, existing students as a dismissible Home card. Admins see
  counts only (groups of 5 or more); never shown to recruiters or other users, never used for targeting. **Sensitive topics
  (religion, ethnicity, health, politics, income) are not allowed**: the editor states the rule, a SQL keyword check refuses the
  obvious cases, and staff can remove any question at `/ops/universities` (audited).
- 2026-10-04 (phase 9, awards): Owner and admins award any of their students, coordinators their own department; name, description
  and an icon from a fixed Phosphor set (no uploads). Shown on the profile and as the optional `awards` field of the CV snapshot
  ("awarded by {University}") from the next version; revoking drops it from the next version. **Awards never affect ranking**
  (no score function reads `badge_awards`; said in code comments and here).
- 2026-10-04 (phase 9, calendar): Owner and admins add semesters (display) and exam periods with the existing rules (≤ 45 days, no
  overlap, reason, audited) plus at most 90 exam days per calendar year per university. `/ops/exam-periods` stays for staff.
- 2026-10-04 (phase 9, records): Growth and Campus only. Owners and admins see all their students, coordinators their own department,
  career office and communications none. "Their students" = student accounts at that university, active or graduate. The list
  `/uni/students` is Growth+ and not logged; every call of `university_student_record()` writes one log row (no dedupe). **No bulk
  export of individual records** (no CSV of the list, no multi-student function) and **record opens are rate-limited to 100 an hour
  per admin**. Logs are kept 2 years (`uni-records-purge`). Never visible: chat, L0 skills, recruiter notes, which recruiters
  contacted a student, individual CV views.
- 2026-10-04 (phase 9, record viewers): Pro students (`privacy.record_viewers`) see the viewer's name, role and time for the last 12
  months in Settings → Privacy; others see what Pro adds and no count.
- 2026-10-04 (phase 9, dashboards): One nightly job (`uni-stats`, 03:37 PKT, after ranking) fills `uni_stats` rows (tables, not
  materialised views, so every read goes through one function that checks the plan). Any group under 5 shows as "fewer than 5",
  **and a count that could be derived by subtracting the visible ones from a visible total is suppressed too** (when exactly one
  group in a breakdown is hidden, the next-smallest is hidden with it). Free universities get Home numbers only and a locked
  dashboard; Basic/Growth/Campus follow the 5.23 table.
- 2026-10-04 (phase 9, faculty panel): Growth+ shows counts per teacher (reviews, supervisions, code checks, endorsements, ideas) plus
  department totals; never student content.
- 2026-10-04 (phase 9, exports): CSV per dashboard area (Growth+) and a PDF of the dashboard through the CV Chromium renderer. **CSV
  cells starting with `=`, `+`, `-` or `@` are prefixed with `'`** (formula injection). Accreditation templates are deferred until
  partners confirm the content.
- 2026-10-04 (phase 9, sponsorship): `final_year_batch` stays staff-only (it also drives graduation, phase 6). `/uni/sponsorship` shows
  the eligible count and active grants (0 until phase 10); the owner can request a final-year batch change, applied by accounts staff at
  `/ops/graduation`. `/uni/billing` shows the level and "write to Skilient". Invoices, activation and reminders are phase 10.
- 2026-10-04 (phase 9, announcements): Posts of type `announcement` with audience university, plus `announcement_meta` (category,
  expiry ≤ 90 days) and `announcement_targets` (departments and/or batches; none = whole university, students and faculty). Owner,
  admins and communications post; coordinators for their own department only. Never ranked or surveyed; one pinned per university at
  a time (≤ 7 days), shown above the platform pin. In-app plus the daily digest, never instant email (60-a-day cap). **At most 3
  announcements a day per university.**
- 2026-10-04 (phase 9, events): New `events` and `event_registrations` (the post-event `event_rsvps` stays). Types talk, workshop,
  hackathon, competition, other; scope university or global; owner, admins and communications create them. Capacity is enforced in
  `rsvp_event()` with a row lock, no waitlist; reminder in-app 24 hours before. Check-in: `/events/[id]/check-in` shows a QR of an
  HMAC token that rotates every 30 s (the previous window also accepted); the phone camera opens `/events/[id]/attend?t=…`; walk-ins
  are registered while seats remain. Attendance feeds records and dashboards.
- 2026-10-04 (phase 9, moderation hide): Owners and admins hide a University Feed post at their university, a comment on one, or a
  student's event post; it is hidden from everyone but the author at once and opens a Skilient report case with the reason. **The
  author is told (in-app) that the university hid it and why; Skilient staff can restore it** (restoring clears the hide; removing
  removes it as usual); every hide and reversal is in `ops_audit_log`-style history (`university_hides`) visible to staff.
  `/uni/moderation` lists cases on their content with category, status and outcome, never the reporter.
- 2026-10-04 (phase 9, hackathons): Competitions gain `host_type` (org|university), `university_id`, nullable `org_id`. Owner, admins
  and career office create them against `uni.hackathons`; no Skilient review (live on publish); 1 to 22 days; own students unless
  opened to other universities; 1 to 5 approved teachers of that university judge, final score = average; L3 evidence and winner
  badge as phase 8; teams submit a repository URL (GitHub App repos stay deferred).
- 2026-10-04 (phase 9, fair companies): Invited by email; the company signs up as a normal recruiter and its booth opens only once
  Skilient verifies the organisation; no plan needed. During the fair and 14 days after, the company sees the name, department, batch,
  tier and verified skills of students in its queue or with a booked slot, and chats with students it called; students are told this
  when they join. **A student who leaves a company's queue disappears from that company's view at once, except for interviews already
  held.**
- 2026-10-04 (phase 9, queues): The university's students plus graduates from the last 12 months; at most 3 queues at once; "Call
  next" opens a DM labelled with the company and fair; no answer in 5 minutes = skipped; one interview slot per booth per student; a
  per-booth row lock keeps positions 1..n with no gaps or duplicates under 200 concurrent joins (tested with 200 parallel PostgREST
  calls); Realtime updates.
- 2026-10-04 (phase 9, fair report): Attendance, conversations, interviews and hires within 90 days (phase 8 `hires`); student
  breakdowns groups of 5+; owner, admins and career office.
- 2026-10-04 (phase 9, roles): As the 5.23 table: owner everything; admin everything but billing and ownership; career office fairs,
  recruiter invitations, placement analytics (outcomes) and hackathons; coordinator teacher approvals, announcements, dashboard and
  records for their own department; communications announcements and events. Hiding content is owner and admin only.
- 2026-10-04 (phase 9, deferred): University-admin guided tour, accreditation templates, GitHub App hackathon repositories, billing,
  invoices and sponsorship grants (phase 10), and the full `/ops/universities` tabs (phase 11; this phase builds claims, domain
  requests and question removal only).
- 2026-10-04 (phase 9, deviations as built):
  - **Brand colours per theme.** No single colour reaches 4.5:1 on both page backgrounds (#F0EFED and #0A0A09), so primary and
    accent each have a light-mode and a dark-mode value, each checked against its own page (Zod and `private.brand_colour_error`).
  - **Claim letters are PDF only** (5 MB; the browser uploads into the caller's folder and the action checks the `%PDF-` bytes, like
    credentials). Paper letters are scanned to PDF.
  - **Onboarding questions show as a Home card** for every student with an unanswered question (dismissible), not as a separate
    onboarding screen, so the onboarding step numbers and gate stay unchanged.
  - **Hiding content happens in `/uni/moderation`** (recent University Feed posts and comments with a Hide form): university-official
    accounts can't open the student feed. Faculty who are also admins use the same page.
  - **Department membership is enforced by a trigger**: once a university has its own list, a student's department must be on it
    (`profiles_tcheck_department`); the Zod schema accepts any 2 to 80 characters and the pickers show the university's list.
  - **Organisers see counts only** for events (going, checked in), never a list of names, so a Basic university gets no
    individual data through events.
  - **Fair invites need an existing recruiter account on the invited domain** to accept (`/fairs/invite`); the booth opens to
    students once Skilient verifies the organisation.
  - Admin actions go to `university_audit_log` (readable by the owner and admins in Settings → Admins); staff actions stay in
    `ops_audit_log` (append-only, `on delete restrict`), which would otherwise block deleting a former admin's account.

## Phase 10: billing (decisions)

- 2026-10-05 (phase 10, Ahmed's answers): All 28 planning defaults approved ("proceed with default"): Safepay first for PKR,
  Paddle Billing as the USD merchant of record (confirm it accepts a Pakistani seller before signing); students and universities pay
  in PKR, organisations in PKR or USD; USD placeholders are PKR ÷ 280 (Starter $55, Growth $160, sponsored post $18, credit $1.10);
  prices from the PRD, seeded by migration, recruiter yearly = 10× monthly; Enterprise and university licences are staff-applied;
  no recruiter trial (Explore = 1 seat, 0 credits, 1 live post); the phase 8/9 keys are aliases of the PRD keys and shortlists and
  notes need Starter; test grants migrated and retired; faculty at Growth/Campus get the post survey; upgrade credit = unused fraction
  of the period's price, downgrades and yearly → monthly at renewal; billing emails always instant; invoices rendered on demand;
  tax only on organisation and university PKR invoices, rates entered by accounts staff; company details in `billing.company`;
  hiring fees with a 14-day dispute and a contact-request block after 30 days unpaid; credits 5–100 for 90 days, sponsored posts
  14 days; final year by the phase 6 rule; sponsorship ends at the end of the first month at least 30 days away; two-factor for
  organisation admin and billing members, the university owner and accounts staff; one accounts staff member may act, audited;
  revenue as numbers and tables; B6 deferred.
- 2026-10-05 (phase 10, simulated gateway rule): `BILLING_GATEWAY_LOCAL` / `BILLING_GATEWAY_MOR` choose `simulated`, `safepay` or
  `paddle`. Outside Vercel production the simulated gateway always runs (with `SIMULATED_GATEWAY_SECRET`). In production it runs only
  while no real adapter's keys are set, unless `BILLING_ALLOW_SIMULATED=1`, and then only for staff and the user ids in
  `platform_config` `billing.simulated_testers` (`may_use_simulated()`). The webhook route refuses `simulated` whenever the rule says
  no. Everything it creates has `live = false`: payments, subscriptions, add-on orders, and invoices in the `TEST-YYYY-NNNNNN` series
  watermarked TEST; revenue counts live payments only. Staff test tools (`ops_simulate`: end the period, fail the next charge, retry
  now, end the grace period) refuse any live subscription.
- 2026-10-05 (phase 10, deviation): **The simulated result is a real HTTP webhook.** The checkout page's server action signs the event
  and POSTs it to `/api/billing/webhook/simulated` (with Vercel's automation-bypass header on protected previews) instead of calling
  the handler in-process as planned: storing an event needs the service role, which CLAUDE.md keeps out of server actions. Same
  verify → store → queue path as Safepay and Paddle.
- 2026-10-05 (phase 10, deviation): **No `pending` subscription state.** A checkout is a `checkout_sessions` row (amount, tax and
  currency fixed by SQL from `plans` and config, idempotency key per click); the subscription is created or changed only when the
  verified payment event is applied. Webhooks are stored in `billing_webhook_events` (gateway + event id unique), not
  `webhook_events`, to keep them apart from the recruiter API's webhooks.
- 2026-10-05 (phase 10, deviation): **Where the jobs run.** Queued events are applied by SQL (`billing-events`, pg_cron every 10 s)
  because applying needs no outside call; the `billing-worker` Edge Function only calls gateways (renewal charges on saved cards,
  refunds) and records each outcome as an event of gateway `worker`. `billing-tick` (every 5 min) ends trials and periods, queues
  renewals and retries (days 1, 3, 6), expires after 7 days' grace, lapses unpaid licences 14 days after their due date, sends
  prepaid reminders (7, 3, 1 days), expires abandoned checkouts, flags overdue hiring fees and opens 45-day offer follow-ups.
  `sponsorship-sync` runs nightly at 01:15 PKT after graduate-rollover. There is no `quota-reset` job: a new period is a new
  `usage_counters` row (PRD 4b.4).
- 2026-10-05 (phase 10, deviation): **Quotas are spent inside the paid SQL write.** `consume_quota` runs in the same transaction as
  the contact request, so a failed write never spends a credit; the TS layer has `getEntitlements` and `requireEntitlement` only
  (`release_quota` exists in SQL). Every paid action first calls `require_entitlement(key)`, which refuses with SQLSTATE `PT402`
  (HTTP 402 through PostgREST) and the action returns `payment_required`; the upgrade sheet opens on that code. Purchased credits
  are spent after the period's allowance, oldest-expiring first.
- 2026-10-05 (phase 10, deviation): **Invoices.** Numbers come from a gapless counter per series and year (`SKL`, `TEST`, `SKL-CN`,
  `TEST-CN`), never reused; an issued invoice can't change or be deleted (trigger; content hash printed); voids issue a credit note.
  PDFs are rendered on demand by the CV Chromium from the immutable row; nothing is stored in Storage (Free-plan space). An invoice
  is DRAFT while `billing.company` lacks legal name, NTN or address (or STRN when it carries tax) or the province has no tax rate.
  Hiring-fee and licence invoices are TEST until `billing.live_mode` is turned on (the setup checklist's last step). USD payments
  get no Skilient invoice; the merchant of record's invoice number is stored on the payment.
- 2026-10-05 (phase 10, gateways as built): Safepay and Paddle adapters are implemented from public docs and SDKs and tested with
  fixtures built from them (`tests/fixtures/billing/README.md`): Paddle `Paddle-Signature ts:body` HMAC-SHA256 with rotation,
  Safepay `X-SFPY-SIGNATURE` HMAC-SHA512 of the `data` object. Not confirmable without a sandbox, so marked `CONFIRM` in code:
  Safepay event names and fields, wallets on hosted checkout, its refund API and saved cards. Until confirmed, **Safepay payments
  save no card** (every Safepay plan is a prepaid period with reminders, never auto-debited) and Safepay refunds are done in its
  dashboard. **Paddle renews its own subscriptions**: the worker's charge for a Paddle subscription is `deferred` and the renewal
  arrives as `transaction.completed` (origin `subscription_recurring`), matched by Paddle's subscription id, never by the first
  checkout's session. A verified event's live flag decides whether money really moved (sandbox = test), except that a simulated
  session can never be completed by a live event.
- 2026-10-05 (phase 10, entitlements as built): Keys and free values in `entitlement_keys`; `privacy.viewer_names`, `seats`,
  `saved_searches`, `analytics`, `competitions.create` are aliases of `cv.viewer_names`, `org.seats`, `recruit.saved_searches`,
  `recruit.analytics`, `competitions.run`. `uni.dashboard` is an enum (none, summary, full, accreditation) and `uni.dashboard_full`
  means "full or above"; `uni.benchmark` moved from Campus to Growth and up (answer 12). `uni.plan`, `org.plan`, `student.plan`
  enums name the level. `has_entitlement` for a number means "more than the free value". Shortlist and note *writes* need
  `recruit.shortlists`; reads stay open so nothing is lost after a downgrade. Fairs and hackathons now count per licence year
  (from the licence's start), replacing the rolling 365 days. The phase 8 `org_quota_usage` counters moved to `usage_counters`.
  No production test grants existed; the migration still copies any into 30-day admin grants and adds an empty final version of
  `entitlements.test_grants`, `uni.test_plans` and `org.trial_limits` (platform_config is append-only).
- 2026-10-05 (phase 10, organisations): Billing-only members take no seat and see Plan and Billing only. At a seat downgrade the kept
  list must include an admin; without a choice, admins then the most recently signed-in members keep seats; the rest become
  `inactive` (they can't open the portal until reactivated; their notes and shortlists stay). A PKR checkout needs the province
  first (it sets the tax). Live posts over the limit pause (new job status `paused`, newest first) and reopen from Billing when a
  slot is free. Dropping below Growth revokes API tokens and pauses webhooks. Hires recorded before phase 10 are waived ("recorded
  before billing launched"). The 45-day offer follow-up is built; the "student says hired at X" trigger waits for that field.
- 2026-10-05 (phase 10, sponsored posts): `job_posts.sponsored_until` drives the "Sponsored" label on the Jobs tab
  (`opportunities()` returns it). pgTAP 39's check that "For you" has no sponsorship input now asserts no ORDER BY in the function
  mentions sponsorship (the label itself has to read the column).
- 2026-10-05 (phase 10, licences): Staff issue a licence with a PO number at `/ops/billing`; it is active on issue, invoiced on 30-day
  terms (bank transfer with the reference, or a pay link) and lapses 14 days after an unpaid due date. A renewal can be issued in a
  licence's last 60 days and starts when the current year ends. Owners ask for a licence at `/uni/billing` (a staff task).
- 2026-10-05 (phase 10, deferred): **B6** (real PKR and USD test transactions) waits for the merchant accounts; the checklist is in
  `docs/setup-checklist.md` "B6". Also deferred: a PayFast adapter, recording a dashboard-made Safepay refund from `/ops/billing`
  (until Safepay's refund API is confirmed staff refund there and void or credit by hand), accreditation report templates, and the
  visual design-gate pass (phase 14; this phase ran axe in both themes on every new screen).
- 2026-10-02 (phase 10, fix): Invoice PDFs answered `render_failed` on Vercel: the route's function didn't include the headless
  Chromium files (`outputFileTracingIncludes` in `next.config.ts` lists them per route). Added `/api/billing/invoice/**`, and
  `/api/uni/export` (the phase 9 dashboard PDF had the same gap); invoices now embed Spectral and Barlow like CVs, since
  Vercel's Chromium has no system fonts.
- 2026-10-02 — Vercel Web Analytics and Speed Insights (PRs #49, #50, opened by Vercel's agent at the owner's request) are
  added to the root layout but render only when `process.env.VERCEL` is set: their scripts live under `/_vercel/*`, which
  exists only on Vercel; elsewhere the URL fell through to the auth gate and returned HTML, a "Refused to execute script"
  error that the E2E CSP checks (rightly) fail on. Both are cookieless and same-origin (`'self'` already covers them);
  PostHog (EU) stays the product analytics.
- 2026-10-02 — Axiom waits for Vercel Pro: its Vercel integration needs Log Drains (Pro only). Shipping logs from `lib/log.ts`
  straight to Axiom's API was the alternative; not worth a token and per-request work when Pro is needed anyway before launch
  (Hobby is non-commercial only). Until then, Vercel's own runtime logs.

## Phase 11: ops portal (decisions)

- 2026-10-02 (phase 11, Ahmed's answers): Five slices, one PR each: (1) ops shell, unified inbox, staff roles, audit log viewer;
  (2) sanctions and appeals; (3) users, view-as, staff 2FA reset; (4) versioned config editor and metrics; (5) org verification
  documents, full university onboarding, the audit before/after sweep over phases 3-10, wrap-up. Every planning default approved
  except charts: **a chart library** (not hand-built SVG) for `/ops/metrics`. Defaults, as approved: a suspension keeps sign-in but
  allows only reading, appealing and account deletion (sessions revoked so it bites now); a ban blocks sign-in and revokes CVs;
  appealable: moderation removals, warnings, suspensions, bans, CV revocations, credential rejections, code-check grades and org
  suspension/throttling (not dismissals or config), within 30 days; an appeal is decided by any staff holding the deciding role
  (super admins cover all) except the original decider, and a super admin's ban goes to a different super admin (with only one,
  the appeal waits and Ahmed is told); reset 2FA is super admin only; view-as covers profile, Me (score, skills, work), CV,
  opportunities/applications, privacy and notifications, never chat, card details or settings forms, open to any staff role with
  a reason, and notifies the user in-app and by instant email with the PRD wording; plan prices get a versioned editor in
  `/ops/config` (new subscriptions and renewals only); the skill dictionary is edited at `/ops/config/skills` (add, rename, retire,
  never delete); org verification gains an optional document (PDF/WebP, 5 MB, private, accounts staff only); a staff role needs
  the account's two-factor already on, no domain rule, no self-removal of super admin, never the last super admin; ops below
  1024px shows a notice but stays usable; each slice is merged by Claude once CI is green; any production `emergency_ban` rows are
  turned into sanctions by checklist SQL in slice 2.
- 2026-10-02 (phase 11, slice 1): `/ops` is now the inbox: one `ops_inbox()` call returns counts, oldest age, unclaimed/yours and
  overdue counts per queue plus the 200 oldest items across reports, credentials, GitHub flags, routed code checks, ranking flags,
  teacher requests, pending organisations, university claims and domain requests, open billing tasks and feedback, each limited to
  the caller's roles. Overdue marks: reports 24 h, code checks 48 h, organisations 48 h, feedback 7 days, the rest 72 h (fixed in
  SQL for now; config in slice 4). Claiming from the inbox calls each queue's own claim function, so "someone else has it" and the
  audit row are unchanged. Teacher, organisation, university and billing items have no claim (their pages never had one); appeals
  join the inbox in slice 2. The reports list moved to `/ops/reports`; staff no longer get redirected from `/ops` to their area.
- 2026-10-02 (phase 11, slice 1): The ops shell is its own layout: a role-filtered sidebar from `lib/ops/nav.ts` (one config),
  the Staff marker with the caller's roles and the storage line; the student shell steps aside on `/ops`. A staff member's
  areas are unchanged (moderators: reports and universities; trust: evidence and teachers; accounts: organisations, universities,
  teachers, exam periods, graduation, billing; everyone: inbox, feedback, audit log; super admins: all plus Staff).
- 2026-10-02 (phase 11, slice 1): Staff roles: `grant_staff_role(email, role, reason)` and `revoke_staff_role(user, role,
  reason)` for super admins on two-factor, audited with the roles before and after. The account must have a verified
  authenticator; a super admin can't remove their own super admin role, and the last super admin can't be removed (super admin
  rows are locked while counting). The audit log is readable by every staff role at `/ops/audit` (filters: staff, action, target
  type and id, Karachi dates; 50 a page); CSV export (10,000 rows max, formula-escaped) is super admin only, needs a reason and
  writes an `audit.export` row before returning.
- 2026-10-02 (phase 11, slice 1): Two-factor for staff was already enforced in SQL (`private.is_staff()` counts a role only on
  aal2) and in `proxy.ts` (aal2 for `/ops`); slice 1 adds pgTAP proving the new functions refuse aal1 staff.
- 2026-10-02 (phase 11, slice 2): Sanctions. `sanction_user(user, warn|suspend|ban, until, reason, case)`: moderators warn and
  suspend for at most 7 days (the form offers 1, 2, 3, 5 or 7 days; just under 7 × 24 h so the 7-day limit holds); super admins
  also ban (empty end = permanent) and suspend longer. A trigger on `sanctions` enforces both limits again whatever function
  writes the row, and only the lift fields can ever change. One suspension or ban at a time (lift first); warnings stack. A
  suspension or ban deletes every `auth.sessions` row (signed out everywhere); a ban sets `auth.users.banned_until` (2999-12-31
  when permanent), which the phase 5 trigger already turns into revoked CVs. While suspended, a `before insert` trigger refuses
  the account's writes on 29 tables (posts, comments, messages, reactions, pins, votes, RSVPs, endorsements, ventures, invites,
  applications, updates, follows, contributions and confirmations, friend requests, credentials, code checks, share links, job
  applications, event registrations, contact requests, job posts, competition teams, ideas, supervisor comments, review
  requests and reviews); reports, feedback, appeals and account deletion still work. Only the acting user counts (`auth.uid()`),
  so jobs and other people's actions are never blocked. Every signed-in page shows a banner with a link to `/appeals`.
- 2026-10-02 (phase 11, slice 2): Organisations: `sanction_org(org, warn|throttle|suspend, …)` for accounts staff. A throttle caps
  contact requests at 1-50 in any 24 hours for up to 90 days (trigger on `contact_requests`, SQLSTATE 54000); a suspension sets
  the organisation's status to suspended until lifted (lifting restores verified). Admins of the organisation are notified and
  can appeal. The suspend/reinstate buttons in the verification form (phase 8) stay for verification problems and, like a
  rejection, aren't appealable; conduct problems use the sanction form on `/ops/orgs/[id]`.
- 2026-10-02 (phase 11, slice 2): Appeals (`appeals`, one per decision by a unique key): sanctions (not a warning from a report
  case, which is appealed through the case), removals and warnings from report cases, staff CV revocations, credential
  rejections and failed code checks, within 30 days, from `/appeals` (also open to recruiter accounts for their organisation).
  The decider role is fixed at filing (moderator; super admin for a ban; accounts for an organisation; trust reviewer for
  CVs, credentials and code checks) and the original staff member can never claim or decide it (check constraints plus a
  trigger, which also makes a decision final). Overturning lifts the sanction, restores a removed post or an unlisted venture
  (removed comments and messages were blanked and cleared photos deleted, so those stay gone), removes the case's penalty and
  warning, approves the credential, or passes the code check (skills recomputed); a revoked CV stays revoked (signed) and the
  student reissues. A banned account emails its appeal and any staff member files it (`ops_file_appeal`, audited). An appeal
  only the original decider could decide (one super admin) is marked "needs another super admin" in `/ops/appeals`.
- 2026-10-02 (phase 11, slice 2): New notification types (category account, emailed): `account_restricted`,
  `restriction_lifted`, `org_sanctioned`, `appeal_decided`; none names a staff member. `docs/emergency-ban.md` now describes
  `/ops/sanctions`; the dashboard ban is only for when `/ops` itself is down.
- 2026-10-02 (phase 11, slice 3): Users. Any staff role searches `/ops/users` (name or part of it, username, exact or partial
  email, GitHub login or id; 2 characters minimum, 50 results, wildcards escaped) and reads a record: account, two-factor state
  and unused backup codes, GitHub and last sync, score and skills, credentials and code checks, CVs, sanctions, appeals, deletion
  state, and ban-evasion hints (a GitHub clash with another account, or the same email name at another domain on an account that
  is restricted, banned or being deleted). Billing stays at `/ops/billing/user/[id]`. Trust reviewers force a GitHub re-sync
  (skips the student's hourly limit) or recompute skills; "score reset" in PRD 5.26 is read as this recompute, with the score
  following at the next nightly run like every other ranking change. Each is audited with before/after.
- 2026-10-02 (phase 11, slice 3): View as user is a read-only staff rendering of the user's own pages (profile, Me, CV,
  opportunities, privacy, notifications), not a session as the user, so staff can't act as them. Starting needs a reason the user
  reads, opens a one-hour `ops_view_sessions` row (new table, RLS on, no client access), writes `view_as.start` to the audit log
  and notifies the user ("Skilient support viewed your account on <date> for <reason>", in-app and instant email). Each page opened
  is appended to the session. No page reads a chat table, and chat notifications are left out of the notifications page.
- 2026-10-02 (phase 11, slice 3): Staff 2FA reset (`ops_reset_mfa`): super admins only, never their own, with an identity-check
  note of at least 20 characters; removes every factor and backup code and every session, audits the counts before/after, adds
  an in-app notice, and the app sends a security email through Resend directly (outside the 60-a-day notification cap, like the
  other security emails). `docs/recruiter-2fa-recovery.md` now covers every account type and the `/ops` steps.
- 2026-10-02 (phase 11, slice 3): "A moderator can't open a chat outside a report" is proven in pgTAP 47: staff (even a super admin
  on aal2) read no `chat_messages` or `chat_threads` rows and `thread_messages` returns nothing for a non-member; the only chat
  content staff see is `report_messages`, copied at report time.
- 2026-10-02 (phase 11, slice 4): Config. Every `platform_config` key has a row in the new `config_keys` (area, description,
  when it applies, JSON schema). The schemas were generated from each key's current value: same keys (no extras, none missing),
  same types, numbers never negative, arrays keep their element type; `pg_jsonschema` (enabled in `extensions`) checks a new value
  in SQL. Super admins save versions at `/ops/config/[key]` with a reason, against the version they started from (a newer save in
  between is refused); the editor shows a path-level diff before saving and every version's diff in the history; versions are
  never edited. `ranking.*` applies at the next nightly run (proven in pgTAP 48: published scores keep formula v1 until the run);
  everything else applies on save. A new config key needs a `config_keys` row (pgTAP 48 fails otherwise).
- 2026-10-02 (phase 11, slice 4): Plan prices are edited at `/ops/config/plans` (super admins, reason, audited before/after; the
  history is the audit log for that plan). They stay in `plans`, so new subscriptions and renewals use them (`renewal_quote` reads
  the plan at renewal) and paid periods keep their price. A plan keeps the currencies it has; staff-applied plans have no price.
- 2026-10-02 (phase 11, slice 4): The skill dictionary is at `/ops/config/skills` for trust reviewers: add (id, name, category,
  optional parent; no GitHub detectors until a developer adds them), rename, retire, restore, never delete; each audited.
- 2026-10-02 (phase 11, slice 4): Metrics. One materialised view (`private.ops_metrics_mv`: signups by account type for 90 days,
  L2+ evidence rate for the 15 largest universities, contact requests per week, hires per month, MRR per stream from live
  subscriptions) refreshed hourly by `ops-metrics` (:23), plus `private.ops_metric_snapshots` for weekly actives per university
  (daily) and queue backlogs (hourly), kept 400 days. `/ops/metrics` is open to every staff role and links to PostHog for funnels
  and retention. Charts use **Recharts** (Ahmed asked for a chart library): series colours are new `--series-1..4` tokens from
  the brand ramps (blue, vermillion, teal, amber), checked with the dataviz validator in both themes (light amber is below 3:1
  against the surface, so every chart also has a table view); one axis per chart, legends for two or more series, hover
  tooltips, 2px lines, 4px rounded bar ends; the chart itself is hidden from screen readers and not focusable, and the table view
  carries the numbers.
- 2026-10-02 (phase 11, slice 5): Audit sweep. pgTAP 49 reads the whole catalogue: every `private` function that requires a
  staff role and writes a table must insert into `ops_audit_log` with both `before` and `after` (or go through
  `private.billing_audit`, which does). Four older functions recorded one side only (`add_exam_period`, `remove_exam_period`,
  `ops_remove_uni_question`, `ops_resolve_spam_review`); they are redefined with both, behaviour unchanged. Two are excluded on
  purpose: `create_post` (a staff announcement is its own record, with its author) and `ops_view_as_page` (it appends to the view
  session, which is the log of that view). A new staff write function without both sides fails CI.
- 2026-10-02 (phase 11, slice 5): Organisation verification documents are optional: an organisation admin uploads a PDF (5 MB,
  `%PDF-` checked like the claim letter; the bucket also allows WebP for a later image path) at `/org/settings` into the private
  bucket `org-documents/{org_id}/`; a new upload replaces the old file (queued for deletion). Only that organisation's admins and
  accounts staff on two-factor can read it; `/ops/orgs/[id]` opens it through a 60-second link. Verification itself is unchanged
  (decide_org; unverified organisations still can't send contact requests or post jobs).
- 2026-10-02 (phase 11, slice 5): University onboarding at `/ops/universities` (search the HEC list by name or domain) and
  `/ops/universities/[id]` (admins and domains, ecosphere, exam calendar, invoices; plans and licences stay at `/ops/billing`).
  Accounts staff can assign an owner without a claim letter for a partner that signed with Skilient: the person must already
  have a university staff account at that university with two-factor on, and a university keeps one owner (the claim path's
  lock and rules). Staff can also add email domains (source `ops`, never touched by the HEC sync; public email domains and
  domains of another university are refused). Both audited. The phase 9 `ops_universities()` (the teacher form's list) is
  unchanged; the new reads are `ops_uni_list`/`ops_uni_record`.
- 2026-10-02 (phase 11): Phase 11 is done: five slices, PRs #55-#59. Every build-plan check is proven in pgTAP: a moderator
  can't suspend past 7 days (46) or read a chat outside a report (47); every ops write has its audit row (49, plus each slice's
  own tests); an appeal can't be decided by the original staff member (46); an unverified organisation can't send a contact
  request (41); a weight change shows up only after the next recompute (48).
- 2026-10-02 (Ahmed, phase 12 answers): Every default in `docs/marketing-design-plan.md` "Settled answers" was taken. In short:
  marketing pages render per request with the nonce CSP (data cached for an hour), not statically, so the signed-in check stays
  server-side and scripts never need `'unsafe-inline'`. Universities gain `live_at`: students and faculty sign up only at live
  universities (NUTECH for the closed beta); staff open them in `/ops/universities`, which emails confirmed requesters. Officials
  may sign up anywhere so portals can be claimed first. "Live at" lists live universities with 10+ verified students. Captures use
  fictional sample content at NUTECH. Higgsfield art is two-colour risograph (10 free credits until a top-up). About, Privacy,
  contact and socials wait for Ahmed's text. University leads go to `sales_leads` in `/ops/leads`. Code-led impeccable build.
  Lighthouse CI stays report-only. Claude merges each slice once CI is green.
- 2026-10-02 (phase 12, design deviations): (1) The hero headline uses a new `--text-hero` token (about 42 px at 1280) instead of
  `text/display`, which can't set the 12-word headline in two lines at 1280. (2) "For organisations" uses three index rows instead
  of three cards (the taste skill bans equal three-card rows). (3) The landing reuses `/api/universities/domains` (now with a live
  flag) instead of a new `/api/public/university-domains`. (4) The impeccable concept roll was skipped because PRD 5.1 and screen
  spec 3.1 pin both the world and the structure. (5) PostHog stays in phase 13; phase 12 only names its five marketing events.
- 2026-10-02 (phase 12, slice 1): The browser Sentry SDK is now its own chunk. The app loads it immediately; the public marketing
  pages load it once the page is idle (`instrumentation-client.ts`). It was most of a 121 KB (gzip) chunk on every page and held
  the landing below Lighthouse 90 (88, now 91 to 95). Errors in the first moment on a marketing page aren't reported. First-load JS
  on the landing is still above the PRD 10 soft budget of 90 KB: React and the Next.js runtime alone are close to it.
- 2026-10-02 (phase 12, slice 1): Nav and footer links appear only for marketing pages that exist (`BUILT_PAGES` in
  `content/marketing.ts`). Main deploys to production between slices, and links to unbuilt pages would 404.
- 2026-10-02 (phase 12, slice 1): The hero's focal sequence is built from real captures (`pnpm marketing:captures`): post A before
  the tick, post A answered (12), its public line at 11 and at 12 (the whole line rolls, because "11" and "12" differ in width),
  and post B. The reader had already answered post B, so only one post shows a question. Captures hide the app's fixed bars. The
  first card is preloaded for the device's colour scheme only.
- 2026-10-02 (phase 12, slice 1): University requests: one row per email address (asking again sends nothing), the token is
  hashed in SQL, and unsubscribing needs a button press (a POST), so link scanners in mailboxes can't unsubscribe anyone.
  A filled honeypot gets a fake success. The limit is 5 an hour per IP plus 300 an hour across the network.
- 2026-10-02 (phase 12, slice 2): Trust-gap figures rechecked. ResumeLab (70%, 1,900 US workers, August 2023, via SHRM) and
  Gallup Pakistan (about 5,000 of 25,000 IT graduates hired by leading firms, via ProPakistani 15 July 2020) match. The PBS Labour
  Force Survey 2024-25 puts 23.9% on women with a master's degree or higher (bachelor's 23.8%), so the copy now says "master's
  degree or higher". It drops the "degree holders overall 10.9%" figure, which wasn't confirmed, and keeps the national 7.1%.
  The P@SHA line is left out. Ahmed signs off before launch.
- 2026-10-02 (phase 12, slice 2): Lighthouse mobile on `/`, five local runs: 95, 93, 96, 90, 93. To get there:
  - On marketing pages, Sentry now loads only when an error happens (then reports it), instead of after idle. Its 148 KB chunk
    (Replay included) was competing with the page.
  - JetBrains Mono is no longer preloaded anywhere.
  - The landing's sample verify code is set in Barlow tabular figures.
  - The phone headline is 36 px, so it, not a capture, is the largest element.
  Tried and reverted: `experimental.inlineCss` (made first paint slower).
- 2026-10-02 (phase 12, slice 2): Plan changes after the design gates:
  - The how-it-works panels carry an icon and text, without capture crops. They are not boxed cards either (craft floor:
    same-size icon cards).
  - The "Our rules" heading is screen-reader only (no eyebrow above the band).
  - The sample CV is one labelled image for assistive tech, so its own h1 isn't the page's.
  - Feed captures carry a shadow only, because the captured card already has its border.
  The finish review ran in-thread: impeccable's reviewer agent isn't installed in this harness.
