## 9. Design system and UX

Skilient uses the **Editorial** system from your Figma frames (received 2026-09-24). It replaces Terminal Cool: warm-tinted neutrals, light and dark modes as equals, vermillion for action and deep teal reserved for verified proof. Voice line: "Prove it. Don't claim it." Components reference semantic tokens only, never ramp steps directly.

### 9.1 Logo

The wordmark keeps Montserrat Bold with the arrow-K; the platform UI never uses Montserrat. Colour option (a): wordmark and icon spine in text/primary #0E0D0B, arrow, i-dot and icon accents in primary #C03910. Reversed: #E7E7E3 with the dark-mode primary #E04020. Delivered as 14 SVG variants (icon, app icon, favicon, lockups, wordmark, stacked, mono). They go into `public/brand/` at milestone 0 (the old navy/cyan v0 files were already removed from `social-layer`).

### 9.2 Typography

Three faces with fixed roles: Spectral (serif) for display, h1 and h2; Barlow for everything from h3 down; JetBrains Mono only for real data such as commit hashes, repo names, paths and endpoints.

| Token | Size | Face / weight | Line height | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| text/display | clamp(2.75rem, 5.5vw, 4.5rem) | Spectral 500 | 1.05 | −0.025em | Hero headlines only |
| text/h1 | 40px | Spectral 500 | 1.10 | −0.02em | Page titles, largest profile names |
| text/h2 | 30px | Spectral 500 | 1.15 | −0.015em | Section headings, modal titles |
| text/h3 | 22px | Barlow 600 | 1.25 | −0.005em | Card titles, panel headers |
| text/h4 | 17px | Barlow 600 | 1.30 | 0 | Subsection labels, sidebar group headers |
| text/body-lg | 18px | Barlow 400 | 1.65 | 0 | Landing intro paragraphs only |
| text/body | 15px | Barlow 400 | 1.60 | 0 | Default body copy |
| text/body-sm | 13px | Barlow 400 | 1.55 | 0 | Helper text, secondary descriptions in cards |
| text/label | 12px | Barlow 600 | 1.40 | 0.08em | Form labels and table headers only; never section eyebrows |
| text/caption | 11px | Barlow 500 | 1.45 | 0 | Timestamps, meta; smallest readable size |
| text/code | 13px | JetBrains Mono 400 | 1.55 | 0 | Hashes, repos, paths, endpoints |
| text/code-sm | 11px | JetBrains Mono 400 | 1.50 | 0 | Inline refs inside tight components |

### 9.3 Colour

No pure black or grey anywhere: every neutral carries a warm tint (hue \~40°). Ramps run 50 → 950.

| Ramp | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Neutral (light) | #FAF9F7 | #F0EFED | #E4E3DF | #CECDCA | #AEADA8 | #7A7975 | #636260 | #484744 | #2E2D2A | #1A1A17 | #0E0D0B |
| Neutral (dark, 50d → 950d) | #E7E7E3 | #D8D7D2 | #B8B7B2 | #8A8984 | #686862 | #4E4D48 | #3A3A35 | #2A2A26 | #1D1D1A | #131311 | #0A0A09 |
| Primary: Vermillion \~16° (action, CTA) | #FFF2EE | #FFD9CE | #FFB09A | #FF8060 | #F55C38 | #E04020 | #C03910 | #9E2E08 | #7A2204 | #5C1800 | #3C0E00 |
| Secondary: Warm Steel \~220° (supporting surfaces) | #F2F4F8 | #E0E6F4 | #C4CEEC | #9AAAD8 | #7088BC | #4E6AA0 | #3A5288 | #2C3E6E | #1E2C54 | #121C38 | #0A1022 |
| Accent: Institutional Blue \~220° (verification context, links) | #EBF2FF | #CCDEFF | #99BEFF | #5C9AFF | #2878F8 | #0A58E0 | #0050C8 | #003FA8 | #002E82 | #001E5C | #001038 |
| Verified: Deep Teal \~178° (proof artifacts only) | #E8F8F6 | #BEF0EA | #7CDDD5 | #36C4BC | #10AAAA | #0A9290 | #076C6A | #065E5C | #044646 | #032E2E | #021E1E |

**Semantic tokens** (what components use)

| Token | Light | Dark | Contrast (light / dark) | Use |
| --- | --- | --- | --- | --- |
| bg/page | #F0EFED | #0A0A09 | — | Page ground |
| bg/surface | #FAF9F7 | #131311 | — | Cards, panels |
| bg/elevated | #FFFFFF | #1D1D1A | — | Modals, tooltips, popovers |
| bg/muted | #E4E3DF | #1D1D1A | — | Disabled and placeholder fills |
| bg/subtle | #EAEAE7 | #252523 | — | Hover tint, input background |
| text/primary | #0E0D0B | #E7E7E3 | 17.3 / 16.8 | Body, headings |
| text/secondary | #484744 | #B8B7B2 | 8.9 / 10.4 | Supporting labels |
| text/muted | #636260 | #8A8A84 | 5.3 / 6.5 | Captions, timestamps (body-safe) |
| text/subtle | #7A7975 | #686862 | 3.83 / 3.4 | Large or decorative text only |
| text/disabled | #AEADA8 | #4E4D48 | 2.0 / 2.2 | Disabled, no content |
| text/on-primary | #FFFFFF | #0A0A09 | 5.1 / 5.0 | Text on primary button |
| text/on-accent | #FFFFFF | #0A0A09 | 6.4 / 4.7 | Text on accent |
| text/on-verified | #FFFFFF | #0A0A09 | 6.25 / 9.1 | Text on verified (dark verified #10C4B8) |
| border/default | #CECDCA | #2A2A26 | — | Card edges, hairlines |
| border/strong | #AEADA8 | #3A3A35 | — | Focus, emphasis |
| border/muted | #DDDCD8 | #232320 | — | Subtle dividers |
| interactive/primary default · hover · active | #C03910 · #9E2E08 · #7A2204 | #E04020 · #EC5430 · #C03910 | — | Primary buttons |
| interactive/primary/subtle | #FFF2EE | #2E1408 | — | Primary tinted surface |
| interactive/accent default · hover · subtle | #0050C8 · #003FA8 · #EBF2FF | #2878E0 · #4090F0 · #081830 | — | Accent buttons, links |
| interactive/focus-ring | #C03910 | #E04020 | — | 2px ring, 2px offset |
| verified | #076C6A | #10C4B8 | 5.50 on page / 9.1 | Endorsement rows, contribution entries, verified-skill marks |
| semantic success · warning · error · info | #0A8844 · #C47800 · #C41010 · #006ACE | #14B860 · #F5A000 · #E83030 · #3A94F8 | — | Status only; never brand |

**Tiers** (dot and border colour · chip text colour; all text ≥ 4.5:1 on cards)

| Tier | Meaning | Light | Dark |
| --- | --- | --- | --- |
| Raw | Identity verified, no contributions yet | #5E6E84 · #3E4E64 | #9AAEC6 · #C0D0E4 |
| Spark | First verified contribution | #1E60C0 · #1E60C0 | #6298F0 · #98C0FF |
| Flare | Active across projects, endorsements accumulating | #5E28CC · #5E28CC | #9C78F0 · #BAAAF8 |
| Shine | Consistent output, recruiter interest | #7A5800 · #7A5800 | #E0B830 · #F0D060 |
| Radiant | Top 10% of verified contributors | #B83808 · #B83808 | #F07040 · #FF9870 |
| Luminary | Exceptional verified record, the ceiling | #5E3E00 · #5E3E00 | #D0A020 · #ECC840 |

### 9.4 Spacing, radius, elevation, motion

- **Spacing:** 4px base, 13 steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128. Slots: chip 8×4, component 16×12 with 12 gap, card padding 20 and inner gap 16, section 80 (dense pages 64), page gutter clamp(1rem, 5vw, 2.5rem), max width 1280px. No off-scale values.
- **Radius:** none 0, sm 3 (tags, chips, code), md 6 (buttons, inputs), lg 10 (cards, dialogs), xl 16 (bottom sheets), full (avatars, pills). Nested surfaces always use a smaller radius than their container.
- **Elevation:** light-mode shadows use warm #0E0D0B at low opacity: shadow/1 `0 1px 2px .05, 0 1px 3px .04`; shadow/2 `0 2px 6px .06, 0 4px 14px .06`; shadow/3 `0 4px 12px .08, 0 8px 28px .09`; shadow/4 `0 8px 24px .10, 0 20px 52px .12`; inset `inset 0 1px 2px .06`. Dark mode builds depth from fills (#0A0A09 → #131311 → #1D1D1A) and borders; shadows only from level 3.
- **Motion:** no bounce, no spring. Easing standard (0.4, 0, 0.2, 1), decelerate (0, 0, 0.2, 1), accelerate (0.4, 0, 1, 1), sharp (0.4, 0, 0.6, 1). Durations 0 / 120 / 200 / 300 / 500 ms. The single 500 ms moment is the **Verified Stamp**: the border sweeps down (500 ms, decelerate), the shield icon settles 0.5 → 1.03 → 1.0, the row tints verified-subtle (300 ms), and "Verified" slides in after 200 ms.

### 9.5 UX requirements

- Theme via `next-themes` (`attribute: class`, default `system`); light and dark are both first-class and every screen is designed in both. Guard theme-dependent renders with `useMounted`.
- Load Spectral, Barlow and JetBrains Mono via `next/font`, mapped in an `@theme inline` block (Tailwind v4 generates `font-*` utilities only from `@theme`).
- Responsive from 360px phones up; bottom tab bar on mobile, sidebar on desktop.
- Every async view has loading, empty and error states; no silent failures.
- Error is always an icon plus text, never colour alone: #C41010 and primary #C03910 are too close for many colour-blind users. Keep error styling away from primary buttons.
- Dark-mode fix to apply: bg/muted equals bg/elevated (#1D1D1A) in the frames, so move bg/muted to #171715 so disabled fills don't read as raised cards.
- Accessibility: 2px focus ring with 2px offset in primary; labelled icon buttons; keyboard-operable composer, dialogs and chat; honour `prefers-reduced-motion` (skip the stamp animation, keep the end state).
- Icons: one stroke library (Phosphor recommended), never emoji; brand icons as local SVG.

#### Build: design system

- **Tokens:** `app/styles/tokens.css` defines every token from 9.2–9.4 as CSS variables on `:root` (light) and `.dark` (dark); `app/globals.css` imports it and maps them into Tailwind v4 with `@theme inline` (`--color-bg-page: var(--bg-page)`, `--font-display`, `--radius-lg`, …), so utilities like `bg-bg-page` and `font-display` work.
- **Fonts:** `next/font/google` for Spectral (500, 600), Barlow (400, 500, 600) and JetBrains Mono (400), exposed as CSS variables in the root layout.
- **Primitives:** `components/ui/` hand-built on Radix primitives where behaviour is complex (Dialog, Popover, DropdownMenu, Tabs, Toast): Button, Input, Select, Textarea, Checkbox, Switch, Tabs, Dialog/Sheet, Toast, Avatar, Badge, TierBadge, SkillChip, EmptyState, Skeleton; each with every state in section 9.5.
- **Motion:** `lib/motion.ts` exports the easing and duration tokens for framer-motion; `VerifiedStamp` component implements the 500 ms signature sequence and respects `prefers-reduced-motion`.
- **Gallery:** `app/(dev)/ui/page.tsx` (dev-only) renders every primitive in both themes; Playwright screenshots it in CI for visual regression.
- **Done when:** both design gates pass on the gallery; axe-core reports no violations.

Screen-by-screen wireframes and the design review process: Screen spec
