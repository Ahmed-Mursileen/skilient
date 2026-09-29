# Ranking reference students (formula v1)

PRD 5.13 "Done when": pgTAP fixtures reproduce hand-calculated scores for 10 reference
students. This page is the hand calculation; `supabase/tests/32_ranking_reference.test.sql`
builds exactly this data and checks `compute_ranking()` gives the same numbers, component by
component. All weights are formula v1 (`platform_config` key `ranking.formula`, version 1).

**As of:** Wednesday 9 December 2026, 12:00 PKT. The current ISO week starts Monday
7 December, so the 12-week consistency window starts Monday 21 September. R7 studies at
FAST-NUCES, everyone else at NUTECH. Q1–Q10 are other students who answer surveys, apply to
ventures and (for R10) endorse; Q1–Q4 are R5's friends.

**Rounding:** each component is rounded to 2 decimals after its cap; the total is the sum of
the rounded components (never below 0). Numeric rounding is half away from zero
(118.125 → 118.13).

## The rules used

| Part | Rule (formula v1) |
| --- | --- |
| Work (cap 1,125) | Each completed venture that passes every completion rule (≥ 2 members, a deliverable, ≥ 2 verified members): 150 × complexity × role (creator 1.3, member 1.0) × verified share. Counted pull requests 10 each, up to 200. |
| Complexity | 0.8 + 0.5 × average of: (team − 2)/4, (weeks − 1)/15, min(tags, 8)/8, min(deliverables − 1, 3)/3, each clamped to 0–1. Frozen at completion. |
| Verified share | Units = verified GitHub entries once per active day (PKT) + peer-verified manual entries 1 each + unconfirmed entries 0.25 each. Share = min(1, units ÷ median of the team's units); a median of 0 gives 1 to anyone with an entry. |
| Skills (cap 500) | L2 15, L3 20, L4 25 (L0, L1 0); × 1.1 when the counted skills span 3+ categories. |
| Endorsements (cap 375) | 15 × endorser weight (tier on the previous run: none/Raw 0.5, Spark 0.7, Flare 0.9, Shine 1.1, Radiant 1.3, Luminary 1.5) × 0.5 if the endorsee has endorsed the endorser × 0 in a ring. Hidden ones don't count. |
| Credentials (cap 125) | 40 per approved, unexpired credential (expiring today still counts); × 1.5 for a recognised issuer. |
| Content quality (cap 175) | Posts with ≥ 5 answers, ≥ 3 of them from non-friends: average of (feed Q × 100) × log2(1 + posts). Q = (weighted positives + 10 × 0.6) ÷ (weighted answers + 10) on Informative/Interesting, less the Credible penalty. |
| Consistency (cap 120) | 10 per ISO week (PKT) of the last 12 with a contribution entry, a counted pull request or a post. |
| Citizenship (cap 80) | 4 per join request answered within 72 hours (up to 40) + 2 per teammate entry confirmed (up to 40). |
| Momentum (cap 375) | Content + consistency + citizenship, then decay: × (1 − 0.02 × full weeks inactive after day 14), exam days not counted; never below 40% of the peak, never above what was earned. |
| Adjustments | Penalties within 12 months: low −50, medium −150, high −300. Upheld rapid gains: the held gain. |

## Ventures

| Venture | Team | Weeks | Tags | Deliverables | Complexity |
| --- | --- | --- | --- | --- | --- |
| V1 Timetable (owner R1; R2, R3, R4) completed 21 Sep | 4 → 0.5 | 1 Jun → 21 Sep = 16 → 1 | 4 → 0.5 | 1 → 0 | 0.8 + 0.5 × 2/4 = **1.05** |
| V2 Canteen (owner R5; R6) completed 29 Jul | 2 → 0 | 1 Jul → 29 Jul = 4 → 0.2 | 8 → 1 | 4 → 1 | 0.8 + 0.5 × 2.2/4 = **1.075** |
| V3 Library (owner R2; R3, R9, R10) in progress | | | | | |
| V4 Hostel (owner R7; R8) completed 1 Dec with one verified member: **fails the completion rules, counts for nobody** | | | | | |

V1 units: R1 4 confirmed entries = **4**; R2 GitHub entries on 2 days + 2 unconfirmed = 2 + 0.5 = **2.5**; R3 1 confirmed + 2 unconfirmed = **1.5**; R4 2 unconfirmed = **0.5**. Median of 0.5, 1.5, 2.5, 4 = **2**. Shares: R1 1, R2 1, R3 0.75, R4 0.25.

V2 units: R5 3 confirmed = 3; R6 GitHub on 3 days = 3. Median 3; both shares 1.

## The ten students

### R1 — creator with skills and credentials: **514.00**
- Work: 150 × 1.05 × 1.3 × 1 = **204.75**.
- Skills: React L3 20 + TypeScript L2 15 + Python L4 25 + Docker L2 15 = 75; framework, language, tool = 3 categories → × 1.1 = **82.50** (Rust L1 counts 0).
- Endorsements: from R2 (Spark 0.7, mutual) 15 × 0.7 × 0.5 = 5.25; from R3 (not ranked, 0.5) 7.5 → **12.75**.
- Credentials: AWS (recognised) 60 + a local course 40 = **100.00**; one expired yesterday and one pending don't count.
- Momentum: content 1 post, 10 Informative ticks → Q = 16/20 = 0.8 → 80 × log2(2) = 80; consistency weeks of 21 Sep (an entry) and 30 Nov (the post) = 20; citizenship 3 answers within 72 h (the 4th took 80 h) = 12 + 1 confirmation = 2 → 14. Raw 114; last active 1 Dec (8 days) → no decay → **114.00**.
- Total 204.75 + 82.50 + 12.75 + 100 + 114 = **514.00**.

### R2 — GitHub member, pull requests, a hidden endorsement: **285.25**
- Work: 157.50 (share 2.5/2 capped at 1) + 3 counted PRs × 10 = **187.50** (a PR to their own repository doesn't count).
- Skills: React L2 + JavaScript L2 = 30, 2 categories → **30.00**.
- Endorsements: from R1 (Shine 1.1, mutual) 8.25 + from R4 (0.5) 7.5 = **15.75**; R3's is hidden.
- Momentum: consistency weeks 5 Oct (PRs), 19 Oct (post), 9 Nov (entry, PR), 23 Nov (entry) = 40; citizenship 6 confirmations = 12; the post has 4 answers so it isn't scored. Raw 52; last active 3 Dec → **52.00**.
- Total **285.25**.

### R3 — partial share, decay, penalties: **91.93**
- Work: 157.50 × 1.5/2 = 118.125 → **118.13**.
- Skills: SQL L2 **15.00**.
- Momentum: one active week (12 Oct) = 10; last active 12 Oct, 58 days → 58 − 14 = 44 → 6 full weeks → × 0.88 = **8.80** (floor 40% of 10 = 4).
- Adjustments: low penalty 1 Nov 2026 **−50**; the medium one from 1 Nov 2025 is over 12 months old.
- Total 118.13 + 15 + 8.80 − 50 = **91.93**.

### R4 — unconfirmed entries only: **39.38**, not ranked yet
- Work: 157.50 × 0.5/2 = 39.375 → **39.38**. Everything else 0 (entries on 1 and 5 Sep are before the window).
- No peer-verified contribution, so R4 shows "not ranked yet".

### R5 — two-person creator, content with friends set aside: **588.36**
- Work: 150 × 1.075 × 1.3 = 209.625 → **209.63**.
- Skills: Python L3 20 + Django L3 20 + PostgreSQL L2 15 + pytest L2 15 = 70, 4 categories → **77.00**.
- Endorsements: from R6 (Radiant 1.3, mutual) 15 × 1.3 × 0.5 = **9.75**.
- Credentials: 3 recognised × 60 = 180 → cap **125.00**.
- Momentum: posts p5a (10 ticks → 80) and p5b (5 ticks, 5 crosses → Q = 11/20 → 55) score; p5c has 6 answers but only 2 from non-friends, so it doesn't. Content = 67.5 × log2(3) = 106.985; consistency weeks 2 Nov and 16 Nov = 20; citizenship 12 quick answers = 48 → 40. Raw 166.985; last active 6 Dec → **166.98**.
- Total 209.63 + 77 + 9.75 + 125 + 166.98 = **588.36**.

### R6 — member with capped pull requests: **496.42**
- Work: 150 × 1.075 = 161.25 + 25 PRs capped at 200 = **361.25**.
- Skills: Go L4 25 + Gin L3 20 + Docker L3 20 + Redis L2 15 + Kubernetes L2 15 = 95, 4 categories → **104.50**.
- Endorsements: from R5 (Flare 0.9, mutual) 15 × 0.9 × 0.5 = **6.75**.
- Momentum: consistency weeks 28 Sep and 26 Oct (PRs) = 20; citizenship 3 confirmations of R5's entries = 6 → raw 26. Last active 28 Oct, 42 days → 28 → 4 weeks → × 0.92 = **23.92**.
- Total 361.25 + 104.50 + 6.75 + 23.92 = **496.42**.

(The first draft of this page left out R6's three confirmations and said 18.40 / 490.90; the test caught it.)

### R7 — exam pause and the 40% floor: **118.00**
- Work: V4 fails the completion rules → **0**.
- Skills: HTML L2 + CSS L2, one category → **30.00**.
- Momentum: 1 post (10 ticks → 80) + 1 active week (28 Sep) = 10 → raw 90. Last active 30 Sep, 70 days, of which 30 are FAST-NUCES exam days (15 Oct–13 Nov) → 40 inactive → 26 → 3 weeks → × 0.94 = 84.60. The previous peak is 220 → floor 88 → **88.00**.
- Total **118.00**. With no previous peak: 84.60; with no exam period: 70 − 14 = 56 → 8 weeks → × 0.84 = 75.60.

### R8 — every Momentum cap: **442.50**
- Endorsements: from R7 (not ranked, 0.5) **7.50**. Credentials: NFTP (recognised), expiring today → **60.00**.
- Momentum: 7 posts at 80 → 80 × log2(8) = 240 → **175**; 7 post weeks + 5 entry weeks = 12 → **120**; 11 quick answers = 44 → 40, 20 confirmations = 40 → **80**. Raw 375; last active 8 Dec → **375.00**.
- Total 7.50 + 60 + 375 = **442.50**.

### R9 — a penalty larger than the score: **0.00**
- Skills: Rust L2 15; momentum: one active week (30 Nov) 10; high penalty −300 → 25 − 300 → floored at **0.00**.

### R10 — Proof caps: **875.00**
- Skills: 21 skills at L4 = 525 × 1.1 = 577.5 → cap **500.00**.
- Endorsements: 10 Luminary endorsers × 2 skills = 20 × 22.5 = 450 → cap **375.00**.
- Momentum 0 (the only entry, 1 June, is long before the window). Total **875.00**.

## Summary

| Student | Work | Skills | Endorsements | Credentials | Momentum | Adjustments | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R1 | 204.75 | 82.50 | 12.75 | 100.00 | 114.00 | 0 | **514.00** |
| R2 | 187.50 | 30.00 | 15.75 | 0 | 52.00 | 0 | **285.25** |
| R3 | 118.13 | 15.00 | 0 | 0 | 8.80 | −50 | **91.93** |
| R4 | 39.38 | 0 | 0 | 0 | 0 | 0 | **39.38** (not ranked) |
| R5 | 209.63 | 77.00 | 9.75 | 125.00 | 166.98 | 0 | **588.36** |
| R6 | 361.25 | 104.50 | 6.75 | 0 | 23.92 | 0 | **496.42** |
| R7 | 0 | 30.00 | 0 | 0 | 88.00 | 0 | **118.00** |
| R8 | 0 | 0 | 7.50 | 60.00 | 375.00 | 0 | **442.50** |
| R9 | 0 | 15.00 | 0 | 0 | 10.00 | −300 | **0.00** |
| R10 | 0 | 500.00 | 375.00 | 0 | 0 | 0 | **875.00** |
