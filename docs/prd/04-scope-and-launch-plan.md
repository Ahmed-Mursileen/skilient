## 4. Scope and launch plan

Skilient launches once, as the complete platform. Every feature in section 5 ships together; there are no staged public releases. The build is sequenced internally (section 11), but nothing goes public until the whole platform passes the launch gate below.

| Pillar | What is live on launch day |
| --- | --- |
| Identity and social | Marketing pages (landing, recruiters, universities, faculty, about, pricing, CV verify), auth, onboarding, profiles, feed and micro-survey, ventures and join flows, friends, chat, explore, notifications, announcements, moderation |
| Trust and proof | GitHub skill verification (L1–L4), contribution log, venture lifecycle, peer endorsements, credentials, live leaderboard and tiers, verified CV with signed QR |
| Two-sided network | Recruiter portal and talent search, teacher role, multiple universities, university and global feeds |
| Ecosphere and revenue | Per-university ecosphere, events and competitions, university dashboard, billing and all revenue streams in section 4a |

**Launch gate** (all must pass)

- Every screen in the Screen spec tab is built, reviewed through both design gates, and works in light and dark.
- Playwright E2E passes for every cross-account flow, including student, recruiter, teacher, university admin and Skilient staff journeys.
- Security audit clean: every must-fix in section 8 resolved, RLS tests pass for every role.
- A closed beta (one university, at least 200 students, 4 weeks) has produced real evidence, so skills, tiers and the leaderboard are populated on launch day.
- Billing processes a real test transaction end to end in PKR and USD.
- At least one partner university and one paying recruiter are signed for launch.

#### Launch plan (decided 2026-09-25; no calendar dates — each stage starts when the previous one's exit criteria are met)

| Stage | What happens | Exit criteria |
| --- | --- | --- |
| Business track (runs alongside the build from phase 0) | Company registration; payment-gateway merchant accounts (local PKR gateway and USD merchant-of-record); final user agreement and privacy notice; Skilient domain, Resend sender, trademark and social handles; sign 3 partner universities (NUTECH first) and at least 1 paying recruiter; line up 10+ approved teachers per partner university | Every item done before the closed beta starts |
| Internal alpha | The founder and \~10 internal testers use the vertical slice, then each new phase as it lands | Slice checkpoint passed (section 11) |
| Closed beta at NUTECH | NUTECH only, invite by university email, at least 200 students for 4 weeks; NUTECH teachers seed project ideas; at least one recruiter and the NUTECH career office test their portals; PostHog replays and the feedback centre watched daily | Onboarding completion ≥ 70%; L2 precision audit ≥ 90%; no Sev 1 or Sev 2 bugs open; tiers and the leaderboard populated with real evidence; beta feedback triaged |
| Launch gate | The checklist above (screens, E2E, security, beta evidence, billing, partners) | All items pass |
| Public launch | **Signup opens to every HEC university at once** (all domains preloaded). Partner universities get admin onboarding, a launch announcement in their feed and a job fair or hackathon in the first semester; the landing page, organisation pages and "Request your university" go live | — |
| Hypercare (first 2 weeks) | Daily review of errors, alerts, signups, activation and feedback; fixes shipped daily; ops queues cleared within their timers | No Sev 1 open; activation and retention dashboards baselined |
| Steady state | Weekly metrics review against section 3 targets for 3 months; monthly L2 precision audit; quarterly taxonomy and survey-bank review; post-launch revenue streams considered only after this | — |
