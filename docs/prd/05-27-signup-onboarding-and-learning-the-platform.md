### 5.27 Signup, onboarding and learning the platform (decided 2026-09-25)

Goal: a new user always knows where they are, what each area is for and what to do next. Signup proves who they are; onboarding sets up their profile and evidence; a tutorial layer (tour, nav tooltips, first-visit tips, checklist, teaching empty states) teaches the platform; a feedback centre catches what we got wrong.

**Entry points**

| Who | How | Verified by | Access before verification |
| --- | --- | --- | --- |
| Student | `/signup` → Student | University email only (code or university Google account). No student ID check | Nothing until the email is verified |
| Teacher | `/signup` → Faculty | Faculty email domain + university admin approval | Onboarding only |
| Recruiter | `/signup/recruiter` | Work email; org verification (5.26) | Company profile only |
| University admin | Claim or invite | Claim at `/uni/claim` with an authorisation letter (5.23), or an invite from Skilient Accounts; two-factor required | — |

**Sign-in methods:** email and password, or **Google sign-in restricted to university-domain accounts** (students and faculty). A Google account whose email domain isn't in the university domain list is refused with "Use your university Google account". Recruiters and university admins use email and password.

**Student signup**

1. Name, university email, password (min 10 chars, checked against a breached-password list) — or "Continue with Google" (university account only).
2. University detected from the domain ("Signing up as a student of FAST-NUCES"); "Not your university?" opens a picker limited to universities that own that domain. Personal email domains (gmail.com, outlook.com, etc.) are refused with "Use your university email".
3. Required checkbox: "I agree to the Skilient User Agreement and Privacy Notice"; the link opens the agreement in a side sheet.
4. Email verification: 6-digit code plus magic link, 15-minute expiry, resend limited to 3 per hour. Skipped for Google (email already verified by Google).
5. Verified → straight into the onboarding wizard. Every student account is tied to one university email; changing it later needs a new verification.

**User agreement (template):** versioned. The launch version is a placeholder with these headings, each followed by "\[To be written\]" — Ahmed provides the final text:

1. Who we are and what Skilient is
2. Eligibility (enrolled at or graduated from a listed university, with a university email)
3. Your account (accurate information, one account per person, security)
4. Your content and our licence to display it
5. Verification and evidence (GitHub data we read, how skill levels and rank are computed, no guarantee of employment)
6. University records (individual records visible to your university on Growth and Campus plans; viewer list on Pro)
7. Recruiter visibility and your controls
8. Acceptable use and anti-gaming
9. Paid plans, billing and refunds
10. Moderation, suspension and appeals
11. Account deletion and data retention
12. Liability and disclaimers
13. Changes to this agreement
14. Governing law (Pakistan) and contact

Publishing a new version shows a blocking re-accept screen at the next sign-in, with a short "What changed" summary.

**Onboarding wizard (students)** — one step per screen, progress bar, Back always works, progress saved and resumed.

| Step | Content | Why (shown to the user) |
| --- | --- | --- |
| 1. University details | Program, batch/graduation year, campus | Puts you in your university feed, leaderboards and job fairs |
| 2. Profile basics | Username (live check), photo, one-line intro | How classmates and recruiters recognise you |
| 3. Connect GitHub (skippable) | Install the Skilient GitHub App, choose repos; what we read and never do | Your code becomes verified skill evidence |
| 4. Your skills | Detected skills with level badges and "Improve this" hints; L0 private; manual skills as "claimed" (no points until verified) | Shows how proof works from day one |
| 5. What you're looking for | Internships, jobs, teammates, competitions, learning; recruiter visibility on/off | Drives "For you" and recruiter visibility |
| 6. Find your people | Suggested classmates (same program and batch), open ventures at your university | So your feed isn't empty |

Skipping GitHub adds "Connect GitHub" to the checklist and shows a one-line reminder on `/me/skills`. The wizard ends on "You're in", which starts the tour. Faculty and recruiter wizards follow the same pattern with their own steps.

**Tutorial layer**

1. **Guided tour** — auto-starts the first time a verified user lands on Home. About 8 coach marks, one per nav item, "Step 3 of 8", Next / Back / Skip. Copy:
   - Home: "Your university feed — posts, announcements and your progress card."
   - Opportunities: "Jobs, recruiter requests, competitions and hackathons matched to your verified skills."
   - Ventures: "Projects you build with others. Finished ventures count most toward your rank."
   - Chat: "Messages with friends, teammates and recruiters."
   - Me: "Your profile, skills, CV and score — see exactly how your rank is calculated."
   - Explore, Leaderboard, Events, Notifications: one tip each.
   - Last step: the feedback button ("Something confusing? Tell us here."). Replay from Me → Settings → "Replay tour". Separate tours for faculty, recruiters and university admins.
2. **Nav tooltips** — always on: every nav item shows its name and a one-line description on hover or keyboard focus (desktop) and on long-press (phone).
3. **First-visit tip cards** — the first time a user opens Opportunities, a venture, the CV builder, the score page or the privacy centre: one dismissible card explaining the page in two lines, with "Show me more" expanding inline (no help centre at launch).
4. **Getting-started checklist** in the progress card: finish profile, connect GitHub, reach first L2 skill, join or start a venture, get first endorsement, build your CV. Each shows its point reward; the card hides itself when done or when dismissed.
5. **Teaching empty states** — every empty screen says what goes there and offers one action.

**Feedback centre** (`/feedback`, also a "Feedback" button in the top bar and Me menu): type (bug, idea, confusing, praise), text, optional screenshot; current page, device and app version attached automatically. "My feedback" lists each submission with its status: received → reviewing → planned → shipped / won't do, with a staff reply. Triage happens in `/ops`. No public voting board at launch. No help centre at launch.

#### Build: signup, onboarding and learning

- **Auth:** Supabase Auth email/password + Google provider. Signup action rejects any email whose domain isn't in `university_domains` (students/faculty). Google: pass `hd` as a hint and enforce server-side in an Auth hook (`before-user-created`) with the same domain check; `/auth/callback` re-checks on every sign-in. Password check against a k-anonymity breached-password range API.
- **Domains:** `university_domains(university_id, domain, kind student|faculty|both)` seeded from the HEC list; editable in `/ops`. A student whose university domain is missing sees "Your university isn't on Skilient yet" and can request their university (5.1).
- **Access gate:** RLS on feed, chat, ventures, opportunities, contact requests and leaderboards requires a confirmed email (`auth.users.email_confirmed_at`) and completed onboarding; `proxy.ts` routes users with incomplete onboarding to their current step.
- **Agreement:** `agreement_versions(version, body_md, summary_md, published_at)`, `agreement_acceptances(user_id, version, accepted_at, ip_hash)`; signup action refuses without acceptance of the current version; `proxy.ts` redirects to `/agreement` when the latest published version isn't accepted.
- **Onboarding:** `onboarding_state(user_id, role, step, data jsonb, completed_at)`; each step is a server action that validates and saves its slice; `app/onboarding/[step]/page.tsx`.
- **Tutorial:** tours defined in `lib/tours/{student,faculty,recruiter,uni-admin}.ts` (anchor `data-tour` id, title, body); `CoachMark` on Floating UI with focus trap, Esc to close, `prefers-reduced-motion` respected, `aria-live` announcements. `tour_progress(user_id, tour_id, step, completed_at, skipped)`, `tips_seen(user_id, tip_id)`. Nav tooltips from the same `lib/nav.ts` config (label + description), rendered with `aria-describedby`.
- **Checklist:** `getting_started(user_id)` SQL function computes each item from existing tables; nothing stored except dismissal in `ui_state`.
- **Feedback:** `feedback(id, user_id, type, body, screenshot_path, page, device, app_version, status, staff_reply, created_at)`; screenshots in private bucket `feedback`; status changes notify the user.
- **Ops additions (5.26):** the Queues inbox gains "Feedback" (any staff role) with the same claim and audit rules.
- **Done when:** a personal-email or non-university Google account can't create a student account; an unconfirmed email can't reach the feed; a new agreement version blocks until accepted; the tour starts once, can be skipped and replayed, and works by keyboard alone; every nav item has a tooltip.
