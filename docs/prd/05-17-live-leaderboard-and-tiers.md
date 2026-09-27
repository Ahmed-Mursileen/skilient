### 5.17 Live leaderboard and tiers

- Leaderboards by university (default), department, batch and global, all on the same formula (5.13). Others see rank, tier and weekly change.
- Tier badges on profiles, cards and posts, in the tier colours from section 9.
- `/me/score` shows the owner every component with its evidence, this week's change, any decay or exam pause, and what the next tier needs.
- Students can opt out of public boards; their tier still shows on their profile and to recruiters.

#### Build: leaderboard and score page

- **Routes:** `app/leaderboard/page.tsx` with params `scope=university|department|batch|global`, cursor pagination 50 rows; `app/me/score/page.tsx`.
- **Query:** `leaderboard(scope, filters, cursor)` SQL function over `ranking_scores` joined to public profile cards, excluding opted-out students (`profiles.leaderboard_opt_out`) and unranked ones; the viewer's own row is returned separately so it can be pinned.
- **Score page:** reads the owner's `ranking_scores.components` and renders each component with links to the evidence ids it contains, the delta from last week's snapshot, decay or exam-pause notices, and the next tier's missing requirements (computed by `next_tier_requirements(user_id)`).
- **Badges:** `TierBadge` component uses the tier colour tokens from section 9.
- **Done when:** opted-out students never appear in any scope; ranks are stable between nightly runs (no reordering on page load).
