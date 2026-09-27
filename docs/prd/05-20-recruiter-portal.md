### 5.20 Recruiter portal (decided 2026-09-25)

Recruiters find, contact and hire students on verified evidence. Plan limits come from section 4a; everything below is live at launch.

**Org signup and verification**

- `/signup/recruiter` creates the recruiter's account (5.27), then the `/org/join` stepper collects company name, website, work-email domain, industry, size, city and the signer's role. The email domain must match the website domain; free-mail domains are refused; the signer confirms their email and sets up two-factor.
- A Skilient admin reviews the company (website, LinkedIn page, registration or tax number if given) within 2 working days. States: pending → verified (Explore active) → suspended. Pending orgs can build their company page but see no talent data.
- Team: the org admin invites teammates on the same domain. Roles: admin (everything), recruiter (search, contact, jobs), billing (plans and invoices). Seats per plan.

**Company page** (`/companies/[slug]`): logo, about, locations and open roles. Students see it before answering a contact request. Hiring and response statistics are **not** shown publicly.

**Talent search**

- Only students who opted in to recruiter visibility appear; a student can also hide from specific companies.
- Filters: skill with minimum level (L2/L3/L4), has code check, university, department, batch or graduation year, tier, active in the last 30/90/180 days, availability (internship, full-time, part-time), city or remote.
- Never filterable or sortable: gender, age, religion, ethnicity, photo. Skilient doesn't collect these for recruiters; every search is logged for audit.
- Ordering: best match on required skills weighted by level, then recent activity, then tier; never by payment. Each result shows a "why this match" line.
- Explore (free) shows only tier, skills and levels, university, department, batch and activity band: no names, photos or profile links.
- Saved searches (Starter+) email new matches daily or weekly.

**Candidate view:** a drawer that expands to a page, with the live CV and verified badge, skills with evidence, ventures with team, role and faculty-review badges, tier and percentile, the "looking for" line and availability. Actions: shortlist, private note, contact request, invite to apply.

**Contact requests**

- One credit per request; the message must name a role or opportunity (≥ 50 characters, templates provided).
- The student accepts, declines (optional reason) or ignores; requests expire after 14 days. Accepting opens a recruiter–student chat labelled with the company, which the student can close anytime.
- Credits are spent on send and not refunded on decline.
- No re-contacting the same student within 90 days of a decline; at most 50 requests per recruiter per day.
- Response rate, response time and decline rate are visible **only to Skilient admins**. Orgs above 80% declines over 30 days get an admin spam review.

**Jobs and applications**

- Post fields: title, type, location or remote, **stipend or salary range (required)**, skills with minimum level, openings, deadline, description. Needs a free job-post slot; sponsored boost optional.
- Students apply in one click with their live CV and an optional 300-character note; recruiters may require a minimum tier or skill level.
- Pipeline applied → screening → interview → offer → hired | rejected as a Kanban board with bulk actions; every stage change notifies the student. Rejection needs a reason (skills gap, position filled, other); the student sees the stage and a generic reason, never private notes.
- **Hired** triggers the hiring fee (section 4b.9) and records the hire. **After 90 days** the recruiter gets one question: "Is this hire meeting expectations?" (yes / partly / no / left). This starts the Outcome trust layer; answers feed admin analytics and, in aggregate only, university placement stats.

**Skill competitions** (Growth: 1 per quarter): role, skills, brief (template or custom), dates (7–21 days), eligibility (universities, minimum tier), team size 1–3, a required prize and a rubric. An admin reviews the brief before launch and rejects "build our product for free" briefs. Each team gets a private repo from the Skilient GitHub App; submissions freeze at the deadline; the recruiter scores top entries; participants earn L3 evidence and the winner a badge counted as an L4 signal.

**Shortlists and team work:** named lists with drag-to-reorder and bulk "invite to apply", shared across the org's seats; org-private notes; an org activity feed so two recruiters don't contact the same student twice.

**Recruiter analytics** (Starter+): funnel from views → contacts → accepted → applied → hired, their own response and hiring times, skills-demand trends for their searches, and plan usage.

**API and ATS export** (Growth+): `GET /api/v1/candidates/{id}` (signed CV JSON), `GET /api/v1/shortlists`, `GET /api/v1/shortlists/{id}/candidates`, `GET /api/v1/jobs/{id}/applications`, and webhooks for `application.created` and `contact.accepted`. Scope: only recruiter-visible students who have interacted with that org (contacted, applied or shortlisted); never bulk export of the talent pool. Tokens per org, stored hashed, 60 requests/minute.

**Enterprise:** SSO (SAML/OIDC), annual invoicing, a dedicated account manager, 99.9% uptime SLA.

**Student controls:** recruiter visibility defaults to off (offered in onboarding and settings with the "looking for" line); block a company (hidden from all its seats); report a recruiter; see which companies viewed them (names with Pro, counts on Free) and every company that contacted them.

**Retention:** when a student turns off recruiter visibility they disappear from all searches within 24 hours; existing shortlist entries and org notes are **kept** but the entry shows "no longer visible" and the profile can't be opened. When a student deletes their account, their personal data is removed and org notes and hire records are anonymised.

**Success measures:** org verification ≤ 2 working days; contact acceptance ≥ 40%; Explore → paid within 60 days ≥ 10%; median time-to-shortlist and 90-day outcome answers tracked.

#### Build: recruiter portal

- **Routes:** `app/org/join`, `app/companies/[slug]`, `app/recruit/layout.tsx` (active org membership, role admin or recruiter), `recruit/search`, `recruit/candidates/[id]`, `recruit/shortlists`, `recruit/jobs`, `recruit/jobs/[id]/applicants`, `recruit/competitions`, `recruit/analytics`, `app/org/(plan|billing|members|settings/api)`, `app/api/v1/*`.
- **Tables:** `organizations(id, slug, name, domain, website, industry, size, city, status pending|verified|suspended, verified_by, verified_at)`, `org_members(org_id, user_id, role, status active|inactive)`, `org_invites`, `company_blocks(student_id, org_id)`, `saved_searches(org_id, user_id, filters jsonb, frequency)`, `search_audit(org_id, user_id, filters jsonb, at)`, `profile_views(org_id, student_id, viewer_id, at)`, `contact_requests(id, org_id, recruiter_id, student_id, message, status pending|accepted|declined|expired, created_at, decided_at)`, `recruiter_shortlists`, `shortlist_items`, `recruiter_notes`, `job_posts(…, salary_min, salary_max not null, min_tier, min_skill_levels jsonb)`, `job_applications(stage, reject_reason)`, `hires(org_id, student_id, job_id, kind, hired_at)`, `hire_outcomes(hire_id, answer yes|partly|no|left, answered_at)`, `api_tokens(org_id, hash, scopes, last_used_at, revoked_at)`, `api_webhooks(org_id, url, secret, events[])`.
- **Search:** `search_talent(filters, cursor)` SQL function over a `talent_index` materialised view (recruiter-visible students only: skill levels as jsonb with a GIN index, university, department, batch, tier, last\_active\_at, availability), refreshed every 15 minutes and on visibility change; excludes students who blocked the org. Explore calls it through `talent_explore` (anonymised columns); full results require `talent.full_profile`. Every call writes `search_audit`. The function has no parameters for protected attributes.
- **Contact:** `send_contact_request(student_id, message)` (security definer): org verified, `consume_quota('contact.credits')`, message length, 90-day decline cool-off, 50/day per recruiter, company not blocked; `respond_contact_request(id, accept)` by the student opens the chat via `get_or_create_dm` with org context; `contact-expiry` job expires at 14 days.
- **Jobs:** `publish_job` checks `jobs.active_posts` and requires salary fields; `apply_to_job` checks requirements; `move_application(id, stage, reason?)` notifies the student; moving to hired creates `hires` and the fee; `hire-outcome` job asks the 90-day question.
- **Reputation (staff-only):** `org_response_stats` view (response rate, median response time, decline rate over 30 days) readable only through `is_staff()`; anti-gaming opens a spam review above 80% declines.
- **Visibility change:** a trigger on `profiles.recruiter_visible` refreshes `talent_index` for that student and marks their shortlist items `hidden`.
- **API:** route handlers verify hashed bearer tokens, require `api.access`, limit 60 requests/min, and only return students with a contact, application or shortlist link to that org; webhooks are signed with HMAC-SHA256 and retried with backoff.
- **Done when:** Explore can't return names or photos even via direct view queries; protected attributes can't be filtered because they aren't in the index; a declined student can't be re-contacted within 90 days; salary-less job posts are refused; turning off visibility removes a student from search within 24 hours while notes remain.
