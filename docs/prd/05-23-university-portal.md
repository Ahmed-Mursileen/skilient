### 5.23 University portal (decided 2026-09-25)

Universities run their own customised ecosphere on Skilient, manage faculty and structure, host events and job fairs, and (on paid licences) see analytics and individual student records. Licence levels come from section 4a.

**Onboarding**

- Every HEC-recognised university and its email domains are preloaded before launch, so any student can sign up on day one and their university's ecosphere exists automatically, free.
- A university official claims admin access at `/uni/claim` with an official email plus an authorisation letter or signed MoU; a Skilient admin verifies and makes them the **owner**.
- Owners can request extra email domains; Skilient approves and they apply to signup immediately.

**Admin roles** (seats per licence: free 1, Basic 2, Growth 5, Campus 10)

| Role | Can do |
| --- | --- |
| Owner (1) | Everything, including billing and managing admins |
| Admin | Everything except billing and the owner role |
| Career office | Job fairs, recruiter invitations, placement analytics |
| Department coordinator | Teacher approvals, announcements, dashboard and student records for their department only |
| Communications | Announcements and events |

**Customised ecosphere** (resolves the section 12 open question: customised per university)

- Each university configures its own ecosphere at `/uni/settings/ecosphere`:
  - **Modules on/off:** feed, events, project ideas, teachers directory, university leaderboard page, job board (global features like verification, CV and recruiter search are always on).
  - **Pages:** up to 10 custom pages built from blocks (rich text, image, link list, embedded announcements, events list, featured ventures, faculty spotlight).
  - **Branding:** logo, cover image, primary and accent colours (checked automatically against the design system's contrast rules, 4.5:1 for text), welcome message, custom domain-style slug.
  - **Structure:** departments, programmes, batch labels, academic calendar, custom announcement categories, custom onboarding questions (up to 3, multiple choice, e.g. society membership).
  - **Awards:** university-defined badges (e.g. "Dean's Innovation Award") granted by admins to students, shown on profiles and the CV as awarded by that university.
- **Global invariants no university can change:** identity verification, skill levels, the ranking formula and tiers, CV content and format, privacy rules, moderation policy.

**People and structure**

- Departments, programmes and the current final-year batch (drives sponsored Pro).
- Teachers: approve, revoke, faculty CSV import, department assignment (coordinators for their own department).

**Individual student records (Growth and Campus only)**

- Admins and coordinators (for their department) see each of their students' Skilient record: profile, verified skills and levels, ventures and contributions, endorsements, credentials, tier and ranking history, event attendance, CV and application outcomes with their university's job fairs.
- Students cannot opt out. University access to student records is covered by the user agreement every student accepts at signup (legal terms handled separately). Every access is logged; **students on Student Pro** can see who at their university viewed their record and when.
- Never visible to universities: chat, L0 skills, recruiter notes, which recruiters contacted a student, individual CV views.
- Basic and free universities see aggregates only.

**Communication and calendar:** announcements targeted to the whole university, departments or batches, with categories, pinning, expiry and notifications; events (talks, workshops, hackathons, competitions) with RSVP, capacity and QR check-in; semester dates and exam periods (exam periods pause ranking decay).

**University hackathons** (Growth and Campus, included): the competition engine from section 5.20 for university-run hackathons: private team repos from the Skilient GitHub App, rubric judging by teachers, L3 evidence for participants and a winner badge. Limit: Growth 2 per year, Campus 4 per year.

**Analytics dashboard** (aggregates always groups of ≥ 5)

| Area | Basic | Growth | Campus |
| --- | --- | --- | --- |
| Adoption (verified, active % by department and batch) | Yes | Yes | Yes |
| Activity (ventures, contributions, cross-university collaboration) | Totals | Full trends | Full trends |
| Skills (distribution by level, top per department, growth) | Top-line | Full | Full |
| Skills gap (recruiter search demand vs. students' L2+ skills) | No | Yes | Yes |
| Tiers and platform percentile by department | Summary | Full | Full |
| Outcomes (contacts, applications, hires, 90-day outcomes, totals) | No | Yes | Yes |
| Faculty engagement panel | No | Yes | Yes |
| Benchmark vs. anonymised platform average | No | No | Yes |
| Individual student records | No | Yes | Yes |
| CSV/PDF exports | No | Yes | Yes |
| Accreditation report templates (outcome-based-education evidence, confirmed with partners) | No | No | Yes |

**Sponsored Pro:** eligible count, active grants, yearly reminder to update the final-year batch; 30-day notice to students before sponsorship ends (4b.7).

**Job fairs** (Growth 1/year, Campus 2/year): the career office sets dates, invites companies by email (free fair access even without a plan), booths and interview slots; live dashboard of queues, conversations and interviews; post-fair report with attendance, contacts and hires tracked for 90 days.

**Moderation:** university admins can hide a post or event in their own ecosphere, which sends it to Skilient's queue for the final decision; suspensions stay Skilient-only; reports on ecosphere content are visible to that university's admins and Skilient.

**Billing:** annual licence by invoice (provincial tax, purchase-order number on the invoice), paid by bank transfer or pay link; activates when marked paid, or on a signed contract with 30-day terms; renewal reminders at 60, 30 and 7 days; 30-day grace, then the free level with all data kept.

**Success measures:** ≥ 3 partner universities with a verified owner at launch; ≥ 30% of enrolled students verified at partner universities within one semester; licence renewal ≥ 80%; an owner or admin active monthly at every licensed university.

#### Build: university portal

- **Routes:** `app/uni/claim`, `app/uni/layout.tsx` (requires a `university_admins` row and two-factor), uni/page.tsx (home: key numbers and to-dos), uni/people, uni/students and uni/students/\[id\] (Growth+), uni/settings/(ecosphere|branding|calendar|domains|admins), uni/announcements, uni/events, uni/hackathons, uni/dashboard/(adoption|activity|skills|tiers|outcomes|faculty|benchmark), uni/reports, uni/sponsorship, uni/fairs, uni/fairs/\[id\], uni/moderation, uni/billing; the university's ecosphere pages at `app/u/[slug]/[[...page]]` are for signed-in users only (no public per-university pages, 5.1).
- **Tables:** `universities(…, slug, claimed_at, owner_id)`, `university_domains`, `university_claims(university_id, requester_id, letter_path, status, reviewed_by)`, `university_admins(university_id, user_id, role owner|admin|career|coordinator|comms, department_id)`, `departments`, `programmes`, `ecosphere_config(university_id, modules jsonb, branding jsonb, onboarding_questions jsonb)`, `ecosphere_pages(university_id, slug, title, blocks jsonb, published)`, `university_badges(university_id, name, description, icon)`, `badge_awards(badge_id, student_id, awarded_by, awarded_at)`, `announcement_targets(announcement_id, department_id, batch_year)`, `exam_periods`, `events`, `event_rsvps`, `student_record_access_log(university_id, viewer_id, student_id, at)`, plus licence subscriptions in `subscriptions` (subject org of type university).
- **Seed:** `supabase/seed/hec_universities.csv` (name, city, domains) loaded into `universities` and `university_domains`; verified manually before launch.
- **Customisation:** `ecosphere_config` validated by a Zod schema; a contrast checker (WCAG formula) rejects colours below 4.5:1 against `bg/page` in both themes; custom page blocks rendered by a fixed component set (no raw HTML).
- **Student records:** `university_student_record(student_id)` security-definer function returns the record only if the caller is an admin or the coordinator of that student's department at a university with `uni.student_records` entitlement (Growth/Campus), writes `student_record_access_log`, and never touches chat, L0, recruiter or CV-view tables. `Pro students (privacy.record_viewers) see the log at /settings/privacy.`
- **Dashboard:** nightly materialised views (`uni_stats_daily` and per-area views) with `having count(*) >= 5`; skills-gap view joins aggregated `search_audit` skill demand with student skill supply.
- **Moderation:** `hide_in_ecosphere(target)` sets `hidden_by_university` and creates a report for the Skilient queue.
- **Billing:** `create_university_invoice(licence)` issues an invoice with a PO field; `activate_licence(subscription_id, reason paid|contract)` by Accounts staff; reminder and grace jobs as in 4b.
- **Done when:** a Basic university gets no individual records even via direct RPC calls; every record view is logged and shown only to Pro students; a colour failing contrast is refused; hidden content reaches the Skilient queue; a new preloaded domain works for signup immediately.

* **Events:** `events(scope, university_id, type, title, starts_at, ends_at, location_or_link, capacity)`, `event_rsvps(event_id, user_id, status, checked_in_at)`; check-in via a rotating QR on the organiser's screen (`/events/[id]/check-in`, token rotates every 30 s) that students scan; capacity enforced in `rsvp_event()`.
* **Hackathons:** reuse `competitions` with `host_type university`, consuming `uni.hackathons`; judges are the university's approved teachers.
* **Job fairs:** `createJobFair` consumes `uni.job_fairs`; `job_fairs(university_id, starts_at, ends_at, status)`, `job_fair_booths(fair_id, org_id, roles, slots)`, `job_fair_queue(booth_id, student_id, position, status)`; invited orgs get a temporary fair-only access grant; students join queues through Realtime; recruiters call the next student into a chat (`get_or_create_dm` with fair context) or offer an interview slot; `fair_outcomes` roll into the dashboard. Done when a queue stays consistent with 200 concurrent students.
