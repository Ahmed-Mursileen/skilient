### 5.15 Venture lifecycle

- Status: `recruiting` → `in_progress` → `completed` or `abandoned`; only the owner transitions it.
- Completing requires ≥ 2 members and ≥ 1 deliverable link. Completion locks membership and the contribution log, and prompts every member to endorse teammates.
- Before completion the owner can remove members, assign roles (lead, developer, designer, researcher, other), transfer ownership and link a GitHub repo.

#### Build: venture lifecycle

- **State machine in SQL:** `transition_venture(venture_id, to_status)` (owner only) enforces allowed moves recruiting → in\_progress → completed | abandoned, and recruiting → abandoned. Completing requires ≥ 2 members, ≥ 1 `venture_deliverables` row (url, label) and peer-verified contributions from ≥ 2 members; it sets `completed_at`, locks membership and contributions (RLS checks `status`), and queues endorsement prompts to every member.
- **Team management:** `removeMember` (owner, before completion; removed members' contributions stay but stop counting toward the venture), `setMemberRole` (lead, developer, designer, researcher, other), `transferOwnership` (target must be a member; both notified), `linkRepo(full_name)` (the owner's GitHub App installation must have access).
- **Complexity score:** `venture_complexity(venture_id)` SQL function (team size, duration in weeks, distinct skill tags, deliverables) returns 0.8–1.3; recomputed on completion and stored on the venture.
- **Done when:** every illegal transition is refused; a completed venture refuses new members and contributions.
