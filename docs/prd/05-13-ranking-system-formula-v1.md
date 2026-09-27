### 5.13 Ranking system (formula v1, decided 2026-09-25)

Score = **Proof** (verified work, never decays) + **Momentum** (recent community activity, decays). Each component has a points cap, so the weights are real; the maximum is 2,500 points. This replaces both earlier specs (the company-context 50/20/20/10 split and the ranking doc's Foundation 60 / Reputation 40).

| Layer | Component | Weight | Max points | How points are earned |
| --- | --- | --- | --- | --- |
| Proof | Work | 45% | 1,125 | Each **completed** venture = 150 × complexity (0.8–1.3) × role (creator **1.3**, member 1.0) × verified share. Merged PRs to repos the student doesn't own (GitHub L3) = 10 each, up to 200 |
| Proof | Verified skills | 20% | 500 | Per skill: L2 = 15, L3 = 20, L4 = 25 (L0, L1 = 0); +10% for spanning 3+ categories |
| Proof | Endorsements | 15% | 375 | 15 × endorser weight (endorser tier 0.5–1.5; teachers 1.5) × mutual discount (a pair endorsing each other counts 50%) |
| Proof | Credentials | 5% | 125 | 40 per admin-verified certificate, 1.5× for recognised issuers; expired ones drop out |
| Momentum | Content, consistency, citizenship | 15% | 375 | Content quality 175, consistency 120, citizenship 80 (below) |

- **Verified share:** the student's peer-verified contribution entries ÷ the team median, capped at 1; self-reported entries count 0.25.
- Complexity: a simple formula over team size (2–6), duration, distinct skill tags and deliverables; no AI.
- **Content quality:** average post quality index × log2(1 + posts), counting only posts with ≥ 5 survey responses from ≥ 3 people who aren't the author's friends.
- **Consistency:** 10 points per active week in the last 12 (a contribution, verified PR or post).
- **Citizenship:** answering join requests within 72 hours and confirming teammates' contribution entries.
- **Penalties:** an upheld report subtracts 50, 150 or 300 points by severity.

**Decay (Momentum only):** 2% a week after **14 days** with no activity, never below 40% of its peak. Exam periods set by each university admin pause decay for that university's students. Proof never decays.

**Tiers:** points plus a real-world milestone for each tier; percentile for the top two.

| Tier | Points | Also requires |
| --- | --- | --- |
| Raw | 0+ | Verified identity |
| Spark | 100+ | ≥ 1 peer-verified contribution |
| Flare | 250+ | Active in ≥ 2 ventures, ≥ 3 endorsements |
| Shine | 500+ | ≥ 1 completed venture, ≥ 1 skill at L3+ |
| Radiant | 1,000+ | Top 10% of ranked students on the platform |
| Luminary | 2,000+ | Top 2%, plus a teacher endorsement or a completed recruiter hire |

- A student drops a tier only after 14 consecutive days below its threshold.
- Students with no verified contribution show "not ranked yet".
- Percentiles are computed across all ranked students on the platform, so a tier means the same thing at every university.

**Anti-gaming**

- Endorsements only between teammates on a shared venture; at most 5 skills per teammate per venture and 20 given per month; detected rings get weight 0.
- A venture counts as completed only with ≥ 2 members, a deliverable and peer-verified contributions from ≥ 2 members.
- More than 150 points gained in 24 hours goes to the admin review queue before it counts.
- Survey responses from users who answer every post the same way are down-weighted.

**Jobs and versioning**

- `ranking-compute` runs nightly: recompute components → percentiles → tiers. `decay-apply` and `anti-gaming` apply the rules above. Scores accumulate from the first day of the closed beta so tiers are meaningful at launch.
- The formula is versioned (v1 at launch). Any change is announced in-app and applied to everyone in one recompute; every score records the version that produced it.

#### Build: ranking

- **Where it runs:** the scoring logic lives in SQL (`compute_ranking(user_id)` returning components jsonb) so it runs close to the data and can be unit-tested with pgTAP; `ranking-compute` (Edge Function, 03:00) calls it in batches of 500 users, then `assign_percentiles_and_tiers()` in one statement using `percent_rank()` over all ranked students.
- **Components:** one SQL function per component (`score_work`, `score_skills`, `score_endorsements`, `score_credentials`, `score_momentum`), each returning capped points plus the evidence ids used, stored in `components` so `/me/score` can link every point to its source.
- **Decay:** `decay-apply` (daily 04:00) reduces momentum by 2% per full inactive week beyond 14 days, skipping students whose university has an active `exam_periods` row, and never below 40% of `momentum_peak`.
- **Tier hysteresis:** `below_since` set when total drops under the current tier's threshold; the tier drops only when `now() - below_since >= 14 days`.
- **Anti-gaming:** `anti-gaming` (05:00) runs ring detection on endorsements (pairs and cliques with no other shared ventures) and rapid-gain checks against yesterday's snapshot, writing `anti_gaming_flags` that hold points until an admin clears them.
- **Snapshots:** Sunday job copies `ranking_scores` into `ranking_snapshots`.
- **Formula version:** `formula_version` constant in SQL; changing it requires a migration that bumps it and a full recompute.
- **Done when:** pgTAP fixtures reproduce hand-calculated scores for 10 reference students; percentile tiers assign correctly at 1,000 synthetic students; decay pauses during an exam period.
