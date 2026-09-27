### 5.1 Marketing and public pages

Landing page detailed 2026-09-25. Public marketing routes: `/` (students), `/recruiters`, `/universities`, `/faculty`, `/about`, `/pricing`, `/verify/[code]`. **There is no `/demo` at launch** (dropped 2026-09-25). English only at launch. Landing copy never claims a feature that isn't live.

**Theme:** marketing pages and the signed-in app both **follow the device setting** (light or dark), with a manual light/dark/system toggle in the footer and in settings. Both Editorial modes are designed as equals (dark: ink `#0E0D0B` ground, warm chalk text, vermillion accents). In dark mode vermillion is used for text only at 24 px and up or for UI elements; smaller links use a lighter vermillion tint that reaches 4.5:1.

**Top navigation:** wordmark · For recruiters · For universities · For faculty · Pricing · Verify a CV · Sign in · **Join** (vermillion button). Phone: menu sheet, with Join always visible in the bar.

**Landing page `/` — sections in order** (each a different layout family, Screen spec 3.1)

| # | Section | Content |
| --- | --- | --- |
| 1 | Hero (split: copy left, product right; stacks on phone) | Headline: "Join Pakistan's first social media platform exclusively for university students." Subline: "Build with classmates, prove your skills with real work, and get recognised by recruiters. No more rejected CVs." University email field with live detection (below) and a Join button. Right: a real product capture of the University Feed in a phone frame, showing a post with its survey strip. Headline sized to fit two lines at 1280 px wide; the whole hero, including the field, fits the first screen on desktop and phone |
| 2 | Live at | Text list of universities already on Skilient (logos only with written permission). Live numbers — verified students, ventures, ventures shipped — each appear only once it passes **200**; the row is hidden while none does |
| 3 | The trust gap | "Anyone can write 'React' on a CV." Three stat cards, each with its source line: (1) "70% of workers admit lying on their CVs" — ResumeLab survey of 1,900 US workers, Aug 2023, reported by SHRM (19 Oct 2023). (2) "Of \~25,000 IT graduates a year, only \~5,000 are hired by Pakistan's leading IT companies" — Gallup Pakistan study, reported by ProPakistani (15 Jul 2020); P@SHA puts employable IT graduates at 10% (Dawn, 30 Nov 2022). (3) "23.9% of women with a degree or higher are unemployed" (degree holders overall 10.9%, national 7.1%) — Pakistan Bureau of Statistics, Labour Force Survey 2024-25, reported by The News (26 Nov 2025). Recheck each figure against the primary report before launch and update when newer data is published. |
| 4 | How it works | Four steps in a horizontal scroll-snap row: Sign up with your university email → Build ventures with classmates and connect GitHub → Get verified by your code, your teammates and your faculty → Get recognised: verified CV, recruiter requests, jobs |
| 5 | Feed | "Posts go viral because they provide value, not entertainment." The tick/cross survey strip and the "X people find this informative" line |
| 6 | Ventures | Teams of up to 6, open roles, the Shipped post |
| 7 | Verified skills and rank | "Skills you've proven, not skills you've typed." Tier ladder Raw → Spark → Flare → Shine → Radiant → Luminary. Evidence levels are **not** explained on the landing page |
| 8 | Verified CV | A sample CV with its verify code and the "Verified by Skilient" status |
| 9 | Opportunities | Jobs, contact requests, competitions and hackathons, job fairs |
| 10 | Our rules | "Rank can't be bought. Proof is free. No ads. We never sell your data." |
| 11 | For organisations | Three cards — Recruiters, Universities, Faculty — one line each, linking to their pages |
| 12 | Pricing teaser | "Free is enough to prove yourself." Student Pro price from the `plans` table, link to `/pricing` |
| 13 | FAQ | Who can join? Is it free? What do you read from my GitHub? Can my university see my activity? (Honest answer: yes, if your university is on a Growth or Campus plan; Pro members see who viewed their record.) What happens when I graduate? How do recruiters contact me? |
| 14 | Final CTA | The university email field again |
| 15 | Footer | About, Pricing, For recruiters, For universities, For faculty, Verify a CV, Terms, Privacy, Contact, social links, theme toggle, © Skilient |

**University email field (hero and final CTA)**

- As the visitor types, the domain is matched after 300 ms against a cached list; no request per keystroke.
- Live university → "✓ FAST-NUCES is on Skilient" and Join continues to `/signup` with the email prefilled.
- Personal email (gmail.com, outlook.com, …) → "Use your university email".
- Known Pakistani university not yet live → "FAST-NUCES isn't on Skilient yet — Request it" opens a sheet: email, consent "Email me when my university joins". A confirmation email is sent; requests are counted per university in `/ops` as sales leads, and everyone who asked is emailed at launch.
- Unknown domain → "We don't recognise this university — Request it" with a university-name field.
- Signed-in visitors see "Open Skilient" instead of the field.

**Motion** (passes the impeccable animate rules and taste-skill; no fade-and-rise section reveals, no content hidden before scripts run)

- **One focal moment, in the hero:** once, when the hero is on screen, the phone capture plays a single sequence (about 1.6 s): a reader taps the tick on a post's survey strip → the public line counts up ("11 → 12 people find this informative") → the post moves up one place in the feed (FLIP transform, 400 ms, `cubic-bezier(0.16, 1, 0.3, 1)`). It shows the product's idea — value, not likes, moves a post — and never loops.
- **One scroll-linked element, where scroll carries meaning:** on the tier ladder, a vermillion rule fills from Raw toward Luminary as the ladder passes through the viewport (CSS scroll-driven animation; without support it shows fully filled).
- **Feedback only elsewhere:** the email field's detection result crossfades in (150 ms); buttons have a press state; FAQ items open with a 250 ms height transition; how-it-works uses native scroll-snap, no animation.
- **Reduced motion:** the hero sequence is replaced by a 200 ms crossfade of the count; the ladder shows filled; the FAQ opens instantly.

**Organisation pages** (same system and tokens, their own layouts)

| Page | Content | Call to action |
| --- | --- | --- |
| `/recruiters` | What you see (verified skills and evidence, faculty-reviewed ventures, verified CVs); how contact works (contact requests with salary range, 5.20); job posts and job fairs; org verification; recruiter plans | Create a recruiter account |
| `/universities` | What the university gets (dashboards, individual records on Growth and Campus, ecosphere customisation, job fairs, hackathons, exam calendars, sponsored Pro); university plans | Talk to us (form → `/ops` lead) |
| `/faculty` | Supervise ventures, confirm contributions, code checks, project ideas, endorsements; free for faculty | Join as faculty (faculty email) |

#### Build: marketing pages

- **Routes:** `app/(marketing)/page.tsx`, `recruiters/page.tsx`, `universities/page.tsx`, `faculty/page.tsx`, `about/page.tsx`, `pricing/page.tsx`, `verify/[code]/page.tsx`, sharing `app/(marketing)/layout.tsx` (marketing nav + footer). All are React Server Components rendered statically (`export const revalidate = 3600`); only interactive islands are client components. No `/demo` route, component or API.
- **Components:** `components/marketing/*`: `Hero`, `UniEmailField` (client), `HeroFeedCapture` (client; static end-state image plus the focal sequence), `LiveAt`, `TrustGap`, `HowItWorks` (scroll-snap), `FeatureBlock` variants, `TierLadder` (CSS scroll-driven fill), `CvPreview`, `OurRules`, `ForOrgs`, `PricingTeaser` (reads `plans`), `Faq` (native `details`/`summary`), `FinalCta`, `UniversityRequestSheet` (client), `OrgPageHero`.
- **Content source:** copy lives in `content/marketing.ts` (typed object), so copy edits don't touch components; plan prices come from the `plans` table.
- **Domain detection:** `app/api/public/university-domains/route.ts` returns a static JSON map (domain → university name, live flag) from `university_domains` + `universities`, revalidated hourly and cached by the browser; `UniEmailField` matches locally. A personal-domain list ships in the bundle.
- **University requests:** `university_requests(id, email, university_name, domain, consent, confirmed_at, notified_at, created_at)`; server action `requestUniversity` (Zod, honeypot field, 5 per hour per IP via `rate_limit_events`) sends a confirmation email through Resend with an unsubscribe link; `/ops` shows counts per domain; when a university goes live, the `university-launch` job emails confirmed requesters once. Replaces the reference build's unthrottled `/api/waitlist`.
- **Live numbers:** `public_stats` materialised view (verified students, ventures, shipped ventures, live universities) refreshed hourly by pg\_cron; `LiveAt` renders each number only when ≥ 200 (threshold in `platform_config`: `marketing.stats_min`).
- **Theme:** the root `ThemeProvider` uses `defaultTheme="system"` for marketing and app alike (a stored choice from the toggle wins); no route overrides it. Tokens from `app/globals.css` (Editorial light and dark sets); every marketing section and the hero capture are checked in both modes, with a light and a dark product capture served by `prefers-color-scheme`.
- **Motion:** focal sequence with the Web Animations API inside `HeroFeedCapture`, triggered once by an IntersectionObserver at 50% visibility; tier ladder via `animation-timeline: view()` inside `@supports`, static fallback; no scroll event listeners; every animation has a `prefers-reduced-motion` alternative as specified above.
- **SEO:** `generateMetadata` per page (title, description, canonical, Open Graph image from `app/opengraph-image.tsx`), `app/sitemap.ts`, `app/robots.ts` (disallow signed-in routes). English only (`lang="en"`).
- **Images:** the hero and feature visuals are real product captures (AVIF/WebP, explicit width and height, hero `priority`); Higgsfield-generated art only for organisation-page heroes and the Open Graph image, exported to `public/marketing/`.
- **Signed-in visitors:** `proxy.ts` doesn't redirect `/`; the CTA reads the session server-side and shows "Open Skilient".
- **Analytics:** PostHog events (see "Observability, monitoring and analytics"): `signup_start`, `uni_detected`, `uni_not_live`, `uni_requested`, `org_cta_click`, plus Vercel Analytics page views. No advertising or marketing trackers.
- **Done when:** Lighthouse mobile ≥ 90 (performance, SEO, accessibility); both design gates pass; the hero with its email field fits the first screen at 1280×720 and 390×844; all content is visible with JavaScript disabled; live numbers stay hidden below 200; `/demo` returns 404; university requests are rate-limited; zero layout shift from fonts (`next/font` with `display: swap` and size-adjusted fallbacks).
