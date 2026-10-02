# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students at Pakistani universities** (primary). They have a university email address and want work that recruiters will believe. They usually reach the site on a mid-range Android phone over 4G.
- **Recruiters at Pakistani companies.** They search verified talent, contact students and post jobs.
- **Universities** (career offices, coordinators, comms). They run their ecosphere, dashboards, fairs and hackathons.
- **Faculty.** They supervise ventures, confirm contributions, grade code checks, publish project ideas and endorse students.
- **Skilient staff** run `/ops`.

## Product Purpose

Skilient is a university-gated social platform. Students prove skills through real project work: GitHub evidence, ventures with classmates, peer and faculty verification. That proof becomes a signed, verifiable CV that recruiters trust. Success means a recruiter can rely on a Skilient CV without re-testing claims, and a student is recognised for proven work rather than for what their CV says.

## Positioning

Proof, not claims. Skills come from evidence (code, teammates, faculty), never from self-description. The CV is cryptographically signed and checkable at `/verify`. Posts rise because readers find them informative (a one-question survey), not because of likes. Rank can't be bought.

## Operating Context

- Signup needs a university email whose domain is in the HEC-seeded list. A closed beta runs at NUTECH, then signup opens to every HEC university at once.
- Hosting is in Mumbai, and performance targets assume a mid-range Android on 4G. English only at launch.
- Marketing pages and the app both follow the device theme, and light and dark are designed as equals.

## Capabilities and Constraints

- Live features: feed with micro-survey, ventures (teams of up to 6, open roles, Shipped posts), GitHub skill extraction, endorsements, credentials, code checks, ranking and tiers (Raw, Spark, Flare, Shine, Radiant, Luminary), leaderboards, the verified CV (Ed25519, `/verify/[code]`), chat, recruiter, teacher, university and ops portals, and billing.
- Never in the product: AI/LLM APIs, likes or reactions, video, public profile pages, paid rank or visibility, ads, selling student data.
- Plan prices are placeholders to validate and come only from the `plans` table.
- Landing copy never claims a feature that isn't live.

## Brand Commitments

- Editorial system (PRD 9): ink #0E0D0B, vermillion #C03910 (action), deep teal only for verified proof, warm neutrals. Spectral (display, h1, h2), Barlow (h3 down, body), JetBrains Mono for real data only. Phosphor icons, one weight. No emoji.
- Logo: Montserrat wordmark with the arrow-K, 14 SVGs in `brand/` and `public/brand/`.
- Voice line: "Prove it. Don't claim it." Plain sentences, no em-dashes in UI copy, no eyebrows.
- Imagery comes from Higgsfield, except product previews, which are real captures of the built app. No stock photos and no fake `<div>` screenshots.

## Evidence on Hand

- Three sourced trust-gap figures (PRD 5.1: ResumeLab 2023 via SHRM; Gallup Pakistan 2020 via ProPakistani, plus P@SHA via Dawn; PBS LFS 2024-25 via The News). Recheck before launch.
- The built app itself: captures come from the local stack with fictional sample content.
- A sample CV snapshot (`lib/cv/sample.ts`).
- Absent, and never to be invented: customer logos, testimonials, user counts below 200, press, founder photos, incubation or award details. Ahmed supplies those.

## Product Principles

1. Proof stays free forever. Money buys convenience, never rank or visibility.
2. Every claim on a public page is checkable: a capture, a source, or a rule we keep.
3. Students own their visibility to recruiters (opt-in, revocable). Universities on Growth or Campus can see their own students' records, and we say so plainly.
4. Built for a phone on 4G first.

## Accessibility & Inclusion

WCAG 2.2 AA (axe clean in both themes). Keyboard-operable throughout. Honour `prefers-reduced-motion`. Errors are an icon plus text, never colour alone.
