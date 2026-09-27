### 5.21 Teacher portal (decided 2026-09-25)

Teachers add the most trusted human signal to the proof chain. They post project ideas, supervise and review ventures, endorse students at 1.5 weight and grade L4 code checks. They are never ranked and never appear in recruiter search.

**Verification**

- Faculty sign up with their university email, then request the teacher role (department, title).
- Approved by the university admin in `/uni/people`, by a faculty CSV that pre-approves matching emails, or, where a university has no admin, by a Skilient admin checking the university's public faculty page.
- University admins can revoke the role anytime; past reviews and endorsements stay, marked "former faculty".

**What teachers do**

| Job | Rules |
| --- | --- |
| Project ideas | Title, brief ≤ 2,000 chars, skills, difficulty (intro/intermediate/advanced), team size, duration, deliverables, max teams, optional deadline and course label (a label only, no LMS). Scope: my university (default) or global. Students "Start a venture from this idea" (prefilled, linked); the idea closes at its team limit or deadline. |
| Supervision | Accept a venture started from their idea, or an owner's invitation; one supervisor per venture; ≤ 15 active per teacher. Supervisors read contributions and deliverables, comment in a supervisor thread (separate from team chat) and confirm contributions, which are marked **faculty-confirmed** (count as peer-verified and show on the CV). |
| Reviews | Requested by the venture owner from any approved teacher at their university, or started by the supervisor. Rubric v1, each 1–5 with a comment: problem and scope, technical quality, collaboration, documentation, outcome. Due in 14 days (reminders at 7 and 12); unanswered requests expire. Shown on the venture's Reviews tab; the CV project entry shows a **"Reviewed by faculty" badge only, no score**. Reviews don't change ranking directly. |
| Endorsements | Only for members of ventures the teacher reviewed or supervised, on skills tagged in that venture; ≤ 40 per month; flagged if > 30% in 90 days go to one student. Weight 1.5; count toward L4 and Luminary's external signal. |
| Code-check grading | Opt-in with a weekly cap (default 10) and chosen skills. Queue of their university's checks, oldest first, due in 72 h; unclaimed after 48 h moves to Skilient reviewers. No grading of students in ventures they supervise. Rubric: explains behaviour, justifies design, handles the change, accuracy; pass = 3 of 4, with comments to the student. |

**Incentives:** a Faculty engagement panel on the university dashboard (ideas posted, ventures supervised, reviews, code checks graded, per teacher and department) for recognition and accreditation; supervised project outcomes on the teacher's profile; one weekly digest email instead of per-event notifications.

**Success measures:** ≥ 10 approved teachers per partner university at launch; median review turnaround ≤ 7 days; ≥ 90% of code checks graded within 72 h; share of first-year ventures started from teacher ideas tracked (aim ≥ 20%).

#### Build: teacher portal

- **Routes:** `app/teach/layout.tsx` (requires `teacher_profiles.status = approved`), `teach/page.tsx` (home with to-do counts, my ideas, supervised ventures, endorsements used this month), `teach/ideas`, `teach/ideas/new`, `teach/ideas/[id]`, `teach/reviews`, `teach/reviews/[requestId]`, `teach/ventures/[id]`, `teach/code-checks`, `teach/settings`; Explore gains a "Project ideas" tab.
- **Tables:** `teacher_profiles(user_id, university_id, department, title, status pending|approved|revoked, approved_by, approved_at)`, `teacher_settings(user_id, grading_opt_in, weekly_grading_cap, grading_skills[], digest)`, `project_ideas(id, teacher_id, title, brief, skills[], difficulty, team_size, duration_weeks, deliverables, max_teams, deadline, course_label, audience, status)`, `ventures.idea_id`, `venture_supervisors(venture_id unique, teacher_id, status invited|active|ended, started_at)`, `supervisor_comments(venture_id, author_id, body, created_at)`, `review_requests(venture_id, teacher_id, requested_by, status, due_at)`, `venture_reviews(venture_id, teacher_id, rubric jsonb, comments, average, created_at)`, `contribution_confirmations.confirmer_role peer|supervisor`, `code_checks.claimed_by, claimed_at, due_at`.
- **SQL functions (security definer, all check `auth.uid()`):** `approve_teacher(user_id)` (university admin of that university or Skilient staff), `import_faculty_csv(rows)`, `accept_supervision(venture_id)` (enforces one supervisor and the 15 cap), `submit_review(request_id, rubric, comments)`, `teacher_endorse(...)` (checks reviewed-or-supervised and the monthly cap), `claim_code_check(id)` (enforces weekly cap, skill match, conflict of interest; `FOR UPDATE SKIP LOCKED` so two teachers can't claim the same check).
- **RLS:** teachers read full venture data only where they supervise or hold an open review request; otherwise the same as a student at their university; supervisor threads readable by the venture's members and supervisor only.
- **Jobs:** `teacher-reminders` (daily: review reminders at 7 and 12 days, expiry at 14; code-check reassignment at 48 h), `teacher-digest` (weekly email), endorsement-concentration check inside `anti-gaming`.
- **Done when:** an unapproved teacher gets student permissions only; parallel claims never double-assign a code check; a teacher can't endorse outside reviewed or supervised ventures; the CV shows the faculty badge without a score.
