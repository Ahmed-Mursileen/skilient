# Marketing site design plan (Phase 12)

The plan every Phase 12 slice follows. Sources: PRD 5.1, 4a, 9, 10; screen spec 3.1; decisions.md. Written 2026-10-02 and approved by Ahmed with every default taken (see "Settled answers" at the end). Product truth is in `PRODUCT.md`; the impeccable direction contract is in the landing's surface brief (`impeccable surface-brief read "app/(marketing)/page.tsx"`).

The impeccable concept roll was skipped: the visual world (Editorial, PRD 9) and the page structure (15 sections, split hero, focal motion; PRD 5.1 and screen spec 3.1) are fixed by the brief. The build path is code-led.

### 1. Design read and dials
Reading this as: a Persuade landing for Pakistani university students (with recruiters, universities and faculty as second audiences). The language is a two-colour editorial record: the HEC-attested document, the stamped result card, the notice board. Spectral/Barlow, ink and vermillion. Dials **7 / 6 / 4** (screen spec).

Thesis: *the page is a record you can check.* Every claim on it is either a real capture of the product, a sourced figure, or a rule we commit to. It refuses the generic SaaS split hero with a gradient blob, three equal feature cards, and a logo wall.

Raising the pinned world past its softest version (impeccable calibration): vermillion gets **one full-bleed field** ("Our rules") instead of only accent specks. Ink does the heavy lifting in type weight and scale. Warm paper stays the ground. There are no hairline-grid decorations and no small tracked mono labels.

### 2. Type, grid, colour, shape
- **Type:** Spectral 500 for display/h1/h2, Barlow for the rest, JetBrains Mono only for the CV verify code. Hero headline: new token `--text-hero: clamp(2rem, 1.1rem + 2.6vw, 2.75rem)`, tuned so the 12-word headline sets in exactly two lines in an 8-column measure at 1280. The PRD display token (72 px at 1280) can't do that, so this is logged as a deviation. Section heads use h1 (40) on the landing and h2 inside sections. Body-lg 18 for intros, max 62ch. No eyebrows at all (PRD 9 bans them). Zero em-dashes in any visible string.
- **Grid:** 12 columns, max 1280, gutter `clamp(1rem,5vw,2.5rem)`, column gap 24. Section padding 80 (64 on dense sections), with more space above a heading than below. Phone (<768): one column, 16 px gutters.
- **Colour (Restrained + one Drenched moment):** bg/page ground, bg/surface for raised bands, ink text, vermillion for actions and links. The "Our rules" band is the one field coloured end to end. Teal appears only where verified proof appears (CV status, verified marks inside captures). Tier colours appear only on the ladder. Dark mode is designed as an equal: ink ground, chalk text, vermillion text only ≥ 24 px, smaller links in the lighter tint (PRD 5.1).
- **Shape lock:** radius md 6 for buttons and inputs, lg 10 for capture frames and sheets, full for nothing except avatars inside captures. Hairline borders only where they separate real content.
- **Icons:** Phosphor via `@phosphor-icons/react/dist/ssr` (zero client JS), weight `regular`, 20/24 px, `aria-hidden` next to text. They're used only where they carry meaning: email-detection states (CheckCircle, WarningCircle, Question), how-it-works rail heads (EnvelopeSimple, GithubLogo, SealCheck, Briefcase), the opportunities bento (Briefcase, ChatCenteredText, Trophy, Storefront), FAQ caret, arrows on links (ArrowRight / ArrowUpRight), menu (List / X), socials (Phosphor logos). No icon tiles, no emoji, and the PRD's "✓" becomes a CheckCircle.

### 3. Motion thesis (impeccable `animate`)
- **Focal moment (hero, once, ≈1.6 s):** IntersectionObserver at 50% fires once. t=0: a 24 px ink tap ring at the tick (scale .6→1, 180 ms) and the strip crossfades to the ticked capture (150 ms). t=350: the count rolls 11→12 inside a masked line (translateY, 300 ms, decelerate). t=900: FLIP swap, so the post moves up one place (400 ms, `cubic-bezier(0.16,1,0.3,1)`). It never loops. Built with the Web Animations API, about 3 KB, no motion library, `will-change` only during the run, cancelled cleanly on unmount.
- **Scroll-linked (tier ladder only):** the vermillion rule fills Raw→Luminary via `animation-timeline: view()` inside `@supports`; without support it shows filled. No scroll listeners.
- **Feedback only elsewhere:** detection result crossfade 150 ms; button press `scale(.98)` 120 ms; FAQ open 250 ms via `::details-content` + `interpolate-size` (CSS only); caret rotates 200 ms; org index-row arrow nudges 4 px on hover (120 ms); pricing toggle indicator slides 200 ms; the phone menu (Popover API) fades 150 ms. Section reveals, parallax, marquees and load choreography: none.
- **Reduced motion:** the hero becomes a 200 ms crossfade of the count only, the ladder shows filled, FAQ opens instantly, everything else is instant.
- **JS off:** a nonce'd one-line head script sets `data-js` on `<html>`. Without it, CSS shows the hero end state (ticked, 12, moved up) and every section is plainly visible.

### 4. Voice
Plain, direct, second person, short sentences, no idioms that don't travel, no hype verbs (no "unlock/elevate/seamless"). Claims only for live features. Numbers only with a source line. Honest FAQ answers (yes, your university can see your record on Growth/Campus). One label per intent: **Join** (student signup), **Request it** (university request), **Talk to us** (university sales), **Create a recruiter account**, **Join as faculty**, **Open Skilient** (signed in).

### 5. Product captures (never Higgsfield)
`scripts/marketing/captures.ts` (Playwright) runs against the local stack. It seeds fictional demo content through a direct DB connection, as `cv.spec.ts` does (never production), signs in a demo student, and takes **element screenshots** at DPR 2 in light and dark. sharp then writes AVIF + WebP to `public/marketing/captures/` and a `content/captures.json` manifest (width, height, alt). The set:
- hero card A before and after the tick (the strip and count line as separate crops, for the animation)
- hero card B
- feed post with survey strip
- venture Team tab with open roles
- the Shipped post
- jobs list
- a contact request
- a competition card

Re-run with `pnpm marketing:captures` whenever the UI changes. `CaptureImage` renders a light and a dark `<img>` with `dark:hidden` / `hidden dark:block` and `loading="lazy"`, so only the theme in use downloads and the footer toggle stays in sync (a `<picture>` media query would follow the OS, not the toggle). Each capture sits in a plain frame: a phone frame (CSS border-radius bezel, no fake chrome) for the hero, otherwise a bordered lg-radius plate. Nothing on the site is a div mock-up.

### 6. Landing `/`: section by section
(Each row: what it says · layout family · key visual · states · phone 390 / desktop 1280.)

1. **Hero.** PRD headline and subline, the university email field, Join. **Asymmetric split 8/4.** Phone capture of the University Feed; the frame is cropped hard by the section's bottom edge. States: idle, detecting, live, personal, not live, unknown, invalid, signed in ("Open Skilient"), JS off (end state). 1280: copy in 8 columns, headline 2 lines, field and Join on one row, phone frame about 340 wide and clipped at 600 tall, so the hero is ≤ 720. 390: headline (~5 lines), subline, then the stacked field and full-width Join, then the top of the phone frame showing the post being ticked, all inside 844.
2. **Live at.** "Live at NUTECH, …" as a typeset inline list of university names (text only; logos need written permission). Below it, numbers in large Spectral numerals with Barlow labels, each shown only when ≥ `marketing.stats_min` (200). The SQL returns null below the threshold, so small numbers never reach the HTML. **Inline gazette list** family. States: names only, names plus numbers, hidden when no university qualifies.
3. **The trust gap.** "Anyone can write 'React' on a CV." **Asymmetric stat sheet:** the lead stat (70%) huge in 7 columns, two smaller stats stacked in 5. Each has its source line (publisher, date, link). Phone: stacked, lead first.
4. **How it works.** Four panels in a **horizontal scroll-snap rail:** "Sign up with your university email" · "Build ventures with classmates and connect GitHub" · "Get verified by your code, your teammates and your faculty" · "Get recognised: verified CV, recruiter requests, jobs". Each panel has an icon, a verb-led title, one line and a small capture crop. The rail is focusable (`tabindex=0`, labelled region) for the keyboard, and each panel is 80% of the viewport on phone and about 3.3 visible at 1280. It is native scroll-snap with no animation.
5. **Feed.** "Posts go viral because they provide value, not entertainment." **Split, media left (7) and copy right (5):** a large capture of a post with its tick/cross strip and the "X people find this informative" line. Phone: capture after the copy.
6. **Ventures.** "Teams of up to 6, open roles, the Shipped post." **Full-width media plus a caption list:** a wide capture of the venture Team tab, with three short definition items in a row beneath it (Team of up to 6 · Open roles · Shipped). This breaks the split-section run.
7. **Verified skills and rank.** "Skills you've proven, not skills you've typed." **Ruler diagram:** the six tiers (Raw → Luminary) as marks on a full-width horizontal ruler, with tier-colour dots, names and one-line meanings. The vermillion rule fills along it as you scroll. Phone: a vertical ruler that fills top→bottom. Evidence levels are not mentioned.
8. **Verified CV.** **Document specimen:** the real `CvDocument` with `lib/cv/sample.ts`, scaled as a paper sheet (columns 6–12) that overlaps into the next section's padding, with the verify code (mono) and the "Verified by Skilient" status (static VerifiedStamp end state). Copy sits in columns 1–4, aligned to the top. Phone: the sheet is cropped to its top half; a "Verify a CV" link follows.
9. **Opportunities.** **Bento of exactly four cells:** jobs (capture, large), contact requests (capture), competitions and hackathons (typographic on primary-subtle tint), job fairs (typographic on surface). Each cell has an icon and a title. Phone: one column.
10. **Our rules.** "Rank can't be bought. Proof is free. No ads. We never sell your data." **Manifesto band:** a full-bleed vermillion field with four stacked Spectral lines, left aligned, in on-primary colour (white in light, ink in dark; both ≥ 5:1).
11. **For organisations.** **Index rows** instead of three cards (the taste skill bans equal 3-card rows): Recruiters / Universities / Faculty, each a full-width link row with the audience in Spectral h2, one line and an arrow. Logged as a deviation from "three cards".
12. **Pricing teaser.** "Free is enough to prove yourself." **Statement + price figure:** the statement in 7 columns. The Student Pro monthly and yearly prices come from `plans` with three lines on what Pro adds, then "See pricing". If plans can't load, the price line is hidden and the link stays.
13. **FAQ.** Six questions from the PRD with honest answers (the GitHub answer is written from what phase 2 actually reads). **Accordion** on native `details/summary`, 8 columns, offset. It works with JS off.
14. **Final CTA.** "Prove it. Don't claim it." and the university email field again. **Centred statement:** the page's only centred block.
15. **Footer.** Large wordmark, link columns (About, Pricing, For recruiters, For universities, For faculty, Verify a CV, Terms, Privacy, Contact), socials, theme toggle, © Skilient.

**Nav:** wordmark · For recruiters · For universities · For faculty · Pricing · Verify a CV · Sign in · **Join**. 64 px, one line at ≥1024. Below 1024 a Popover-API menu sheet (works without JS), and Join is always in the bar. When signed in: "Open Skilient" replaces Sign in and Join.

### 7. Other pages
- **`/recruiters`:** a split hero (copy plus Higgsfield art), then proof captures (talent search showing verified skills and evidence, a faculty-reviewed venture, a verified CV), "How contact works" (contact requests with salary range) as a three-step line, job posts and fairs, org verification, and recruiter plan cards from `plans` (Explore / Starter / Growth / Enterprise). CTA: "Create a recruiter account" → `/signup/recruiter`. A signed-in recruiter sees "Open dashboard".
- **`/universities`:** an editorial long-form single column with full-bleed capture breaks (dashboard, ecosphere, fair), then the licence plan table (Free / Basic / Growth / Campus) with records on Growth and Campus stated plainly. CTA: a "Talk to us" form (name, role, university, email, message, Turnstile, honeypot) → a `sales_leads` row in `/ops/leads`. State: form sent.
- **`/faculty`:** a two-column feature list (supervise ventures, confirm contributions, code checks, project ideas, endorsements), with "Free for faculty". CTA: "Join as faculty" → `/signup?role=faculty`. Hero art from Higgsfield.
- **`/about`:** an editorial single column: story, founders, incubation, award, values, with two full-bleed image breaks (Ahmed's real photos, or risograph art, settled answer 8). Founders, incubation and award render only when Ahmed has supplied them.
- **`/pricing`:** audience tabs as anchors (Students · Recruiters · Universities). A monthly/yearly toggle built with CSS radios + `:has()` (no JS). Plan cards list entitlements, with numbers read from `plans.grants`, so copy never drifts from what billing enforces. Add-ons and the hiring fee are shown. Universities get "Talk to us". There is an FAQ. PKR only.
- **`/request-university`:** the full-page version of the request sheet. It is the JS-off target, and confirm/unsubscribe links land here. States: form, sent, rate-limited, already requested, confirmed, unsubscribed.
- **`/verify`, `/verify/[code]`:** existing pages, moved under the marketing nav and footer with the same URLs.
- **`/terms`, `/privacy`:** settled answer 9. **`/demo`:** 404 (tested).

### 8. Higgsfield assets (never product screenshots)
Style for all of them: **two-colour risograph print.** Ink #0E0D0B and vermillion #C03910 on warm off-white paper, visible halftone dots and slight mis-registration, still-life objects from Pakistani university life, flat lighting, no people's faces, no text or letters. That makes the art read as printed matter rather than a render.
| # | Asset | Purpose | Prompt direction |
|---|---|---|---|
| 1 | `/recruiters` hero, 4:5 | Proof you can check | A stack of attested certificates with a round vermillion seal stamp, a loupe resting on top, a lanyard |
| 2 | `/universities` hero, 4:5 | Campus as an ecosystem | A cork notice board with pinned notices and a ribbon-tied file, a vermillion pin row |
| 3 | `/faculty` hero, 4:5 | Review and supervision | A code printout marked up with vermillion pen ticks and a signature line, a fountain pen |
| 4–5 | `/about` breaks, 21:9 (only if no real photos) | Pace the long read | A university corridor of doors in perspective; a desk with a laptop and printed CV |
| 6 | OG plate, 1200×630 base | Social cards | An abstract risograph field with the arrow-K motif as a large stamped impression, plus space on the left for type |
- The OG images are composed with `next/og` (wordmark + page title in Spectral from `lib/cv/fonts/`) over plate 6, one per marketing route.
- There are no motion loops or video. Motion is code, which keeps the "no video" rule and the JS budget.
- Each final raster is exported to `public/marketing/art/` as AVIF/WebP, with its generation prompt embedded (impeccable provenance).

### 9. How the build meets the checks
- **Lighthouse mobile ≥ 90:** server components everywhere. The client islands are `UniEmailField` (native `<dialog>` for the sheet, no Radix; Turnstile loaded only when the sheet opens) and `HeroFeedCapture`. Theme, menu, FAQ and pricing need no JS (Popover API, `details`, radios). The phone frame uses lazy theme-matched images and the LCP element is the headline text. Fonts come through `next/font` with size-adjusted fallbacks (zero CLS), and every image has explicit sizes. The budget is marketing JS ≤ 90 KB, measured by size-limit per route. Lighthouse CI covers every marketing URL (report-only, settled answer 15) and is run locally per slice.
- **Hero fit:** an E2E at 1280×720 and 390×844 asserts the email field and Join (and on phone the survey strip) sit inside the viewport, and the headline is two lines at 1280.
- **JS off:** an E2E with `javaScriptEnabled:false` asserts every section heading is visible, nothing has opacity 0, the hero shows its end state, and the email form posts to `/join`. `/join` does the detection on the server and redirects to `/signup?email=`, back to `/?email=…&state=personal#join`, or to `/request-university?email=…`.
- **Live numbers < 200:** pgTAP on `landing_stats()` (null below `marketing.stats_min`) and a unit test of `LiveAt`.
- **Email detection:** unit tests of the extended `detectUniversity` (live / not live / personal / unknown / invalid), debounce 300 ms, and one fetch of the cached directory (no request per keystroke).
- **Tier ladder:** an E2E checks the ladder is filled under reduced motion and in a browser without support (forced by `@supports` override).
- **Design gates:** Gate A uses this plan plus impeccable `critique` and the taste pre-flight on each slice's pages before building. Gate B is `impeccable detect`, the impeccable finish-reviewer subagent on desktop and phone captures in both themes (authorised by your impeccable request), one fix batch, then polish. impeccable's documenter writes `DESIGN.md` + `.impeccable/design.json` in the last slice.

---

## Slices (one PR each, same branch `claude/bold-newton-k654a5`, merge commits as in phase 11)

**Slice 1: Shell, data and hero.**
- Migration `…_marketing.sql`:
  - `university_requests` (token hash, consent, confirmed/notified/unsubscribed)
  - `request_university` (anonymous, 5/hour/IP, honeypot checked in the action)
  - `confirm_university_request` / `unsubscribe_…`
  - `landing_stats()` over the `public_stats` materialised view with hourly cron
  - `public_plans()`
  - `config_keys` rows `marketing.stats_min` and `marketing.live_at_min`
  - `universities.live_at` and the signup gate (settled answer 2)
  - pgTAP `50_marketing`
- Directory route gets the `live` flag; signup gets the `?email` prefill.
- `app/(marketing)/layout.tsx` (nav, footer, `data-js`), `content/marketing.ts`, `components/marketing/{Hero,UniEmailField,UniversityRequestSheet,HeroFeedCapture,LiveAt,MarketingNav,MarketingFooter,CaptureImage}`, `/join`, `/request-university` (+ confirm/unsubscribe), `requestUniversity` action, the confirmation email, `/ops/leads` (request counts per domain, accounts staff).
- The capture script and the hero captures; `app/page.tsx` removed in favour of `(marketing)/page.tsx`, with the hero, Live at and the footer for now; `isPublicPath` widened for the new routes.
- Done when: unit tests, pgTAP, `tests/e2e/marketing.spec.ts` (detection states, request flow plus rate limit, JS off, hero fit at both viewports, reduced motion, signed-in "Open Skilient", axe in both themes at both widths), Lighthouse ≥ 90 on `/` locally, Gate B on the hero.

**Slice 2: Landing sections 3–14.** TrustGap (sources re-checked against the primary reports, settled answer 17), HowItWorks, Feed, Ventures, TierLadder, CvPreview, Opportunities, OurRules, ForOrgs, PricingTeaser, Faq, FinalCta, plus their captures. Done when: E2E (ladder fallback, FAQ keyboard, rail keyboard, pricing teaser from DB, every section visible with JS off), axe in both themes, Lighthouse ≥ 90, size-limit ≤ 90 KB for `/`, taste pre-flight (eyebrow count 0, no em-dash, layout families all different), Gate B finish review on the whole landing.

**Slice 3: Organisation pages, pricing, about.** `/recruiters`, `/universities` (+ `sales_leads`, the `submit_sales_lead` action, the `/ops/leads` tab with claim/status, audited), `/faculty`, `/pricing`, `/about`, Higgsfield assets 1–5. Done when: E2E per page (CTAs and their signed-in variants, lead form sent / rate-limited, pricing toggle with JS off, prices equal `plans`), axe in both themes, Lighthouse ≥ 90 on each, Gate B.

**Slice 4: SEO, verify, launch email, wrap-up.**
- SEO: `generateMetadata` on every page (canonical from `NEXT_PUBLIC_SITE_URL`), `opengraph-image.tsx` per route with plate 6, `sitemap.ts`, `robots.ts`, Organization JSON-LD, a check that signed-in routes are noindex.
- `/verify` under marketing chrome; `/terms` and `/privacy`; the `university-launch` job (a notify-worker kind, emails confirmed requesters once when a university goes live, `pnpm test:worker`); a `/demo` 404 test; Lighthouse CI URLs for every route.
- Docs: impeccable documenter → `DESIGN.md`; `docs/setup-checklist.md` Phase 12 (domain, Search Console + sitemap, OG debuggers, Resend sender, Turnstile site keys for the new forms, recheck stats, supply About/legal text); CLAUDE.md code map (phase 12); tick the build-plan boxes.
- Done when: all four phase checks are green on the final head, plus the PRD 5.1 "done when" list.

**Process per slice:** local typecheck, lint, the slice's unit tests, pgTAP for new files, the slice's E2E, Lighthouse and the design gates → open the PR → `subscribe_pr_activity` and watch CI → fix only the failing lines (at most two attempts, then report) → merge when green. The next slice is built locally while CI runs and pushed after the merge. A short report per slice.

---

## Settled answers (2026-10-02, all defaults)

1. Marketing pages render per request with the nonce CSP; plans, stats and the domain directory are cached for an hour. The signed-in check stays server-side.
2. `universities.live_at`: students and faculty sign up only at live universities (NUTECH at the closed beta). Staff open universities in `/ops/universities` (audited, with "open all" for public launch); opening one emails its confirmed requesters. University officials may sign up at any university so portals can be claimed before launch.
3. "Live at" lists live universities with at least `marketing.live_at_min` (10) verified students, and hides while none qualifies.
4. Captures show fictional students and posts at NUTECH; alt text says "sample posts"; no visible label.
5. The hero uses layered real captures, animated as specified.
6. Higgsfield: Ahmed tops up credits for about 3 candidates per asset. Until then, only the free credits are spent, starting with the OG plate and the org heroes.
7. Art is two-colour risograph still-lifes: ink and vermillion, halftone, no faces, no text.
8. About shows only story and values until Ahmed supplies founders, incubation, award and photos. No generated people.
9. `/terms` renders the current signup agreement; `/privacy` shows headings only until Ahmed supplies the text (launch blocker).
10. Contact and social links are hidden until Ahmed confirms the addresses.
11. University leads go to `sales_leads` and `/ops/leads` (accounts staff, claim and status, audited), with no email alert.
12. For organisations uses index rows, not three equal cards.
13. The new `--text-hero` token sets the headline in two lines at 1280.
14. impeccable build path: code-led.
15. Lighthouse CI stays report-only; each slice is checked locally to at least 90.
16. Claude merges each slice PR once CI is green, with a merge commit.
17. Trust-gap figures are rechecked against their primary reports in slice 2; Ahmed signs off before launch.
18. Universities show by full name; there is no short-name column for now.
