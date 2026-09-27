### 5.26 Admin portal — Skilient ops (decided 2026-09-25)

Internal tool at `/ops` for Skilient staff. It replaces the reference build's single `/admin` page (gated by `admin_users`) and handles everything earlier sections assign to "Skilient admins". Only staff accounts can reach it.

**Staff roles** (least privilege; a person can hold several)

| Role | Can do |
| --- | --- |
| Moderator | Reports, content removal, warnings, suspensions up to 7 days |
| Trust reviewer | Evidence holds, anti-gaming flags, contribution disputes, faculty code-check fallback, CV revocation |
| Accounts | Universities, recruiter orgs, recruiter verification, plans, invoices, refunds, entitlement grants |
| Super admin | All of the above, plus staff roles, permanent bans, platform config, audit-log export |

Every staff account needs 2FA. Every staff action needs a reason and is written to an append-only audit log that nobody can edit or delete.

**Areas**

| Area | Contents |
| --- | --- |
| Queues | One inbox with counts and age timers: reports, evidence holds, code-check fallbacks (48 h), recruiter verification, university hide-pending-review escalations, appeals |
| Moderation | Report with context (content, author and reporter history); dismiss, remove, warn, suspend, ban with a reason code |
| Trust and evidence | Approve, reject or reset held evidence; resolve contribution disputes; review code checks no teacher picked up; revoke a verified CV (verify page shows "Revoked") |
| Organisations | Recruiter org verification; university onboarding from the HEC list (admins, plan, ecosphere config); exam-period calendars |
| Recruiter reputation | Response rate, decline patterns, 90-day outcome confirmations, complaints; warn, throttle contact requests, suspend org. Visible to staff only |
| Billing | Subscriptions, gateway events, failed payments, refunds, university invoices, hiring-fee invoices, manual entitlement grants with expiry and reason |
| Users | Search by name, email or GitHub id; read-only record (score breakdown, evidence, CVs, subscriptions, sanctions); force GitHub re-sync; score reset; deletion requests; ban-evasion hints (same GitHub id or email) |
| Appeals | One appeal per decision, decided by a different staff member; the decision is final |
| Platform config | Plan prices, tier thresholds, ranking weights, decay settings, skill dictionary, feature flags; versioned, logged, applied at the next nightly recompute |
| Metrics | Signups, weekly actives per university, L2+ evidence rate, contact-request acceptance, hires, MRR per stream, queue backlogs |

**Decisions**

- Four staff roles at launch, not a single admin role.
- **View as user:** read-only, logged, and the user is notified ("Skilient support viewed your account on \<date> for \<reason>"). Staff can't act as the user.
- **Appeals:** one per decision, decided by a different staff member, final.
- **Recruiter verification:** manual check (company domain email plus business registration or a verifiable company page) before an org can send contact requests or post jobs. Until then it can set up its profile only.
- **Config in the ops UI:** prices, weights, thresholds and flags are edited in ops, not by deploy. Every change is a new version with a reason; ranking changes apply at the next nightly recompute; price changes apply to new subscriptions and renewals only.
- **Private chats:** staff see only the messages attached to a report (the reported message plus up to 10 before it, which the reporter chooses to include). No full-thread access, including in view-as-user.

#### Build: admin portal

- **Access:** `staff_roles(user_id, role, granted_by, granted_at)`; `is_staff(role text)` SQL function (security definer) used in RLS; `proxy.ts` blocks `/ops` for non-staff; Supabase MFA (TOTP) required, checked via the `aal2` claim on every ops request.
- **Writes:** all go through `lib/actions/ops/*`, each calling `requireStaff(role)` and a Postgres function that makes the change and inserts into `ops_audit_log(id, staff_id, action, target_type, target_id, reason, before, after, created_at)` in one transaction. No update/delete policy on `ops_audit_log`. The service role is never used from the ops UI.
- **Queues:** `ops_queue` view unioning `reports`, `evidence_holds`, `code_check_requests` older than 48 h, `org_verifications`, `content_hides` escalated, `appeals`; each row has `claimed_by` and `claimed_at` so two staff don't work the same item.
- **Sanctions:** `sanctions(user_or_org_id, kind warn|suspend|ban|throttle, until, reason, staff_id)`; RLS on posting, chat, contact requests and job posts checks `active_sanction()`; moderators limited to `suspend` with `until <= now() + 7 days`.
- **Report context:** `report_messages(report_id, message_id)` chosen by the reporter at report time; the ops report view reads messages only through this table (RLS on `messages` gives staff no other access).
- **View as user:** `ops_view_as(user_id)` renders the user's pages server-side in read-only mode with a banner; logs to `ops_audit_log` and creates a notification for the user.
- **Appeals:** `appeals(decision_id, appellant_id, text, status, decided_by)`; a check constraint plus trigger stops `decided_by` equalling the original decision's `staff_id`; one appeal per decision (unique).
- **Org verification:** `org_verifications(org_id, domain, registration_doc_path, status, staff_id)`; `can_contact(org_id)` requires `verified`; documents stored in a private bucket readable by Accounts staff only.
- **Config:** `platform_config(key, version, value jsonb, reason, staff_id, effective_at)`; `config(key)` reads the latest effective version; `rank-recompute` and billing read through it. The editor validates each key against a JSON schema before saving.
- **Metrics:** business metrics (MRR, hires, evidence, rank, queue backlogs) from materialised views refreshed hourly by pg\_cron; product funnels, retention, session replays and heatmaps in PostHog (see "Observability, monitoring and analytics"), linked from `/ops/metrics`.
- **Done when:** a moderator can't suspend longer than 7 days or open a chat thread outside a report; every ops write has a matching audit row; an appeal can't be decided by the original staff member; an unverified org can't send a contact request; a weight change shows up only after the next recompute.
