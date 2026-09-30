# Emergency ban (until phase 11)

Suspensions and bans in `/ops` arrive in phase 11 (decisions.md, 2026-09-28). Until then,
when an account must be stopped now (harassment, abuse, a compromised account), a super
admin does this by hand. Use it only for emergencies; everything else goes through the
`/ops` moderation queue (dismiss, remove content, warn).

## 1. Ban sign-in

1. Supabase Dashboard → the Skilient project → **Authentication → Users**.
2. Find the user by email, open the row's menu and choose **Ban user**. Pick a duration
   (a suspension) or the longest one offered (a ban until phase 11 reviews it).

What this does: the user can't sign in and their session can't refresh. A browser that is
already signed in keeps working until its access token expires (1 hour by default), then
is signed out. Their content stays visible; remove specific posts, comments or messages
through `/ops` if needed.

Since phase 5 a ban also revokes every version of the student's verified CV and every share
link, automatically (a trigger on `auth.users.banned_until`; decisions.md 2026-10-01): their
verify pages show Revoked and their links say the CV is no longer available. Lifting the ban
restores none of them; the student gets a new CV at the next monthly refresh (or reissues it).

To lift it, open the same menu and choose **Unban user**.

## 2. Record it in `ops_audit_log`

Every staff action needs an audit row (PRD 5.26). The dashboard ban writes none, so add one
in **SQL Editor** straight after banning (and again when unbanning):

```sql
insert into public.ops_audit_log (staff_id, action, target_type, target_id, reason, after)
values (
  '<your user id>',                -- the staff member who banned
  'emergency_ban',                 -- or 'emergency_unban'
  'user',
  '<banned user id>',
  '<reason code>: <what happened, report ids, who decided>',
  jsonb_build_object('banned_until', '<timestamp or "indefinite">', 'via', 'supabase_dashboard')
);
```

The table is append-only (no update or delete for anyone), so check the row before you run
it. Tell Ahmed the same day.

## 3. When phase 11 lands

Phase 11 replaces this with `sanction()` in `/ops`: moderators up to 7 days, super admins
for bans, with sessions and CVs revoked in one step. Review every `emergency_ban` row then
and turn the ones still in force into sanctions.
