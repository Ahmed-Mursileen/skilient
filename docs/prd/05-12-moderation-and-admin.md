### 5.12 Moderation and admin

- Report button on posts, profiles and messages. Reasons: Spam, Harassment, Inappropriate content, Misinformation, Impersonation, Other, plus optional detail. 60 s cooldown. Reporter sees only "thanks, we'll review this".
- All review and sanctions happen in the Skilient ops portal at `/ops` (5.26): moderators dismiss, remove, warn or suspend up to 7 days; super admins ban. University admins can hide content in their own ecosphere pending Skilient's decision (5.23).

#### Build: moderation and admin

- **Reporting:** `ReportButton` on posts, profiles, messages, ventures and job posts → `submitReport(targetType, targetId, reason, detail)`; 60 s rate limit via `rate_limit_events`; unique `(reporter_id, target_type, target_id)` so one person can't pile on.
- **Ops area:** see 5.26 (`/ops`, `staff_roles`, `is_staff()`, two-factor required). The reference build's `/admin` and `admin_users` are not rebuilt.
- **Queue:** reports grouped by target with count, preview snapshot (copied into `reports.target_snapshot` at report time so removed content is still reviewable), and reporter count.
- **Actions** (staff server actions in `lib/actions/ops/*`, all writing `ops_audit_log` with a reason): `dismissReport`, `removeContent(targetType, id)` (soft delete with `removed_at`, `removed_by`, hidden by RLS), `sanction(userOrOrg, kind, until)` (suspend revokes sessions and CVs and pauses subscriptions; moderators ≤ 7 days), `warnUser` (notification).
- **Staff accounts:** created through the GoTrue admin API by a super admin, never SQL; roles in `staff_roles` (5.26).
- **Done when:** a suspended user can't sign in and their CV verify pages show Revoked; every staff action appears in `ops_audit_log`.
