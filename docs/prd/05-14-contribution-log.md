### 5.14 Contribution log

- Venture members log contributions: kind (code, design, research, docs, management, other), description ≤ 500 chars, optional evidence URL (commit, PR, file, design link), optional hours.
- Entries are insert-only. Within 24 h the author can add a correction entry; nothing is ever edited or deleted.
- If the venture links a GitHub repo, commits by the member's connected GitHub account become auto-verified entries.
- A teammate can confirm an entry, marking it **peer-verified**; unconfirmed entries show as **self-reported**.
- Venture page shows a contribution timeline; profiles show a per-venture summary. Any new entry pauses reputation decay.

#### Build: contribution log

- **Data:** `contributions(id, venture_id, user_id, kind, description, evidence_url, hours, corrects_id, source manual|github, commit_sha, created_at)`; no update or delete policy at all (insert-only by design); a `correction` is a new row with `corrects_id` allowed only within 24 h of the original. `contribution_confirmations(contribution_id, confirmer_id, created_at)` primary key both; a confirmer must be another member of the same venture.
- **Insert:** `logContribution(ventureId, input)`: member check, venture not locked (`status in ('recruiting','in_progress')`), description ≤ 500, evidence URL validated (http/https), 20 entries/day limit.
- **GitHub sync:** when a venture has `repo_full_name` and the member's GitHub id authored commits there, the GitHub worker inserts `source = github` rows (one per commit, auto-confirmed).
- **Status:** view `contributions_with_status` derives peer-verified (≥ 1 confirmation or GitHub-sourced) versus self-reported.
- **UI:** `ContributionTimeline` on the venture page (grouped by week), `LogContributionSheet`, a Confirm button on teammates' entries; any insert updates `last_activity_at` (pauses decay).
- **Done when:** a direct update or delete via the API fails; corrections after 24 h are refused; non-members can't confirm.
