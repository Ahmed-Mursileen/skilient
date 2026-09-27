### 5.6 Feed, posts and micro-survey

> **Completed by 5.28.** Feed ranking (algorithm, not chronological), University and Global feeds, post types, filter chips, comments and the micro-survey follow 5.28 where they differ from this section. Invite posts always create or link a venture.

- Limits: body 1–2,000 chars; ≤ 4 images per post (JPG, PNG, WebP, ≤ 5 MB each). **No video in posts.** Media URLs must point at the `post-media` bucket; 30 s cooldown between posts; size and type validated server-side.
- Invite cards show a Join button with states Join → Requested → Accepted (see 5.7).
- Every post has a Report action.

#### Build: feed, posts and micro-survey

- **Routes:** `app/feed/page.tsx` (server component renders the first page) + `FeedList` client component (infinite scroll with IntersectionObserver; the cursor is a position in the reader's `feed_sessions` list, 5.28).
- **Query:** `lib/data/feed.ts#getFeed({audience, filter, cursor})` calls `feed_page` (5.28), which reads posts with author card, media, survey assignment and join status; RLS limits university posts to the reader's university and global posts to everyone signed in; blocked and muted authors excluded.
- **Composer:** `Composer` client component; server action `createPost(input)`: Zod (body 1–2,000, type enum, invite fields required for invites, ≤ 4 media paths under `post-media/{user_id}/`), rate limit via `rate_limit_events` (30 s), insert post + media in one transaction (SQL function `create_post`), revalidate.
- **Media upload:** client uploads directly to `post-media/{user_id}/{uuid}` (storage policy: own folder, images only — JPG, PNG, WebP ≤ 5 MB; any video MIME type is refused); the server re-reads object metadata (size, content type) before accepting the path.
- **Realtime:** a Realtime channel on `posts` for the reader's university shows a "new posts" pill instead of inserting mid-scroll.
- **Invite join:** "Request to join" calls `requestJoin(postId)` (section 5.7), storing `post_id` on the application thread.
- **Done when:** pagination returns no duplicates or gaps under concurrent inserts; every limit rejected server-side when calling the action directly; cross-university reads return nothing.
