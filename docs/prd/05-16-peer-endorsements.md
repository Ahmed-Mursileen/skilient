### 5.16 Peer endorsements

- Allowed only between members of a shared venture that is `in_progress` or `completed`.
- Up to 5 skills per teammate per venture; the skill must be in the venture's tags or the endorsee's skills; optional note ≤ 280 chars.
- One endorsement per (endorser, endorsee, skill, venture); no self-endorsement. Weight = endorser tier multiplier; ring-detected endorsements carry 0 weight.
- A skill endorsed by ≥ 2 distinct teammates shows as **peer-verified**. The endorsee can hide an endorsement but not edit it.

#### Build: peer endorsements

- **Data:** `endorsements(id, endorser_id, endorsee_id, venture_id, skill_id, evidence_ref, note, weight, hidden, created_at)` with unique `(endorser_id, endorsee_id, skill_id, venture_id)`.
- **Create:** `endorse(endorseeId, ventureId, skillIds[], note?)` → SQL function checks: both are members of that venture, venture `in_progress` or `completed`, not self, ≤ 5 skills per endorsee per venture, ≤ 20 given by the endorser this calendar month, each skill is in the venture's tags or the endorsee's `user_skills`. Teachers endorse through the same function with `role = teacher` (they may endorse any student at their university whose venture they reviewed).
- **Weight:** computed at ranking time, not stored permanently (endorser tier can change): tier weight 0.5–1.5, teacher 1.5, mutual pair × 0.5, ring-flagged × 0.
- **Skill level:** an endorsement tied to evidence counts toward L4; `recompute_user_skills` treats ≥ 2 distinct teammate endorsements on a skill as peer-verified.
- **Hide:** the endorsee can set `hidden = true` (not counted, not shown); edits are impossible.
- **Done when:** every limit is refused when calling the SQL function directly; mutual and ring discounts appear in the score breakdown.
