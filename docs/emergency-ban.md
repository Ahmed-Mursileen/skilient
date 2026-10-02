# Stopping an account now

Since phase 11 suspensions and bans are done in `/ops` (decisions.md "Phase 11"). They take effect at once: every session of the
account is revoked, a suspended account can only read, appeal and delete itself (the database refuses its posts, comments,
messages, applications, endorsements and the rest), and a ban also blocks sign-in and revokes every verified CV and share link.
Each step writes `ops_audit_log` with the reason and the before/after, and the account is told and can appeal.

## Suspend (moderator, up to 7 days)

1. `/ops/sanctions` → **Sanction an account**: type the email or username, **Find**.
2. Choose **Suspend**, how long (1 to 7 days), and a reason the account owner will read. **Suspend**.

From a report: the case page (`/ops/reports/[id]`) has the same form for the content's owner, linked to the case.

## Ban (super admin)

Same form; super admins also see **Ban** (leave the end date empty for a permanent ban) and suspensions longer than 7 days.

## Lift

`/ops/sanctions` → the row → **Lift**, with a reason. Moderators lift suspensions, super admins bans. Lifting a ban restores
sign-in but not the revoked CVs; the student reissues from `/me/cv` (or gets one at the next monthly refresh).

## Appeals

The account appeals from `/appeals` within 30 days; a banned account can't sign in, so it emails support and any staff member
files it at `/ops/appeals` → **File an emailed appeal** (audited). The staff member who made the decision can't decide the appeal.

## Only if `/ops` itself is down

Ban sign-in from the Supabase dashboard (**Authentication → Users → Ban user**), then once `/ops` is back, ban the account properly
at `/ops/sanctions` (so the restriction, the audit row and the appeal path exist) and lift the dashboard ban. Rows recorded by hand
before phase 11 (`action = 'emergency_ban'`) are turned into sanctions with the SQL in `docs/setup-checklist.md` → Phase 11.
