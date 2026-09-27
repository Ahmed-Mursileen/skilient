### 5.7 Ventures and join flows

> **Completed by 5.28.** Team size (max 6), open roles, visibility, invites, updates, follows and members-only deliverables follow 5.28.

- One `ventures` table with `type = project | startup`, browsed at `/ventures` with type tabs (old `/projects` and `/startups` URLs redirect).
- Create: title, description, skill tags, team size. Creator is added as `venture_members.role = creator`.
- **Venture join:** "Apply to join" with a message → `application_threads` (candidate + owner only) → owner accepts or declines. Accept adds a `member` row and adds the candidate to the venture's group chat, creating it on the first acceptance.
- Invite-post join: every invite post is linked to a venture (5.28), so Join on an invite opens the venture's role application, tied to both the venture and the post (the reference build keys it to the owner, not the post — fix). Accepting adds the member and the venture group chat exactly like a venture application.
- Only the owner may accept or decline; the server checks this explicitly, not just through RLS.
- Venture status follows the full lifecycle in 5.15 (`recruiting` → `in_progress` → `completed` or `abandoned`).

#### Build: ventures and join flows

- **Routes:** `app/ventures/page.tsx` (tabs by `?type=project|startup`), `ventures/new/page.tsx`, `ventures/[id]/(about|team|contributions|reviews)`, `app/requests/page.tsx`; redirects from `/projects*` and `/startups*` in `next.config.ts`.
- **Data:** `ventures` (+ `status` enum, `repo_full_name`, `completed_at`), `venture_members` unique `(venture_id, user_id)`, `application_threads` (+ `post_id`, unique partial index on `(candidate_id, venture_id)` and `(candidate_id, post_id)` where `status = 'pending'`), `application_messages`.
- **Create:** `createVenture(input)` → SQL function `create_venture` inserts venture + creator membership in one transaction.
- **Apply:** `applyToVenture(ventureId, message)` / `requestJoin(postId)`: checks not already a member, not blocked by the owner, unique pending thread; inserts thread + first message; notification trigger to the owner.
- **Decide:** `decideApplication(threadId, 'accept' | 'decline')` calls SQL function `decide_application` (security definer) which verifies `auth.uid()` is the owner, locks the thread, and on accept: inserts the membership, creates or reuses the venture's group chat and adds the member (the same function, so chat access is atomic), or for invite-post joins creates the owner–applicant DM; sends notifications.
- **Requests page:** received and sent lists from `application_threads` with RLS (candidate or owner only).
- **Done when:** accept is atomic (membership and chat access both or neither), a non-owner calling `decide_application` is refused, duplicate pending applications are impossible under parallel clicks.
