### 5.11 Notifications, requests and announcements

- Notifications are written only by DB triggers (full list in the build notes below). `/notifications` lists the latest 50 with mark-read and mark-all-read; the bell badge updates via Realtime. Email follows each user's per-type preference: instant email, daily digest or off (5.25).
- `/requests`: pending join requests on the user's invite posts, with accept and decline.
- Announcements are feed posts of type Announcement (5.28), written by university admins and faculty for their own university (targeting from 5.23) and by Skilient staff for platform news; `/announcements` lists them with category filters. Categories: University Update, Scholarship, Competition, Workshop, Hackathon, Internship, Deadline, Skilient Update, plus each university's custom categories.

#### Build: notifications, requests and announcements

- **Notifications:** table `notifications(user_id, actor_id, type, entity_type, entity_id, body, read_at)` with index `(user_id, created_at desc)`; written only by `security definer` trigger functions (friend request sent/accepted, application received/decided, new message when the thread isn't open, endorsement received, tier change, CV viewed for Pro, billing events). No insert policy for users.
- **Delivery:** in-app via Realtime channel `notifications:user_id`; email per `notification_prefs(user_id, type, channel instant_email|digest|off)` — instant emails sent by trigger through a queue, daily digests by the `notification-digest` job through Resend.
- **Actions:** `markRead(id)`, `markAllRead()`; list paginated 50 at a time.
- **Announcements:** stored as `posts` with `type = announcement` plus `announcement_targets` (5.23); RLS: read by signed-in users of that university (or all, for staff platform news); write by university admins and approved faculty for their own university, and by staff.
- **Done when:** each trigger fires exactly once per event; no user can insert a notification for someone else.
