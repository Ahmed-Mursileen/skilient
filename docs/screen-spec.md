# Skilient — Screen spec

## 1. Design process

Every screen below passes two review gates before it is built and again before it ships: [impeccable](https://github.com/pbakaus/impeccable) (v4.3.1) and [taste-skill](https://github.com/Leonxlnx/taste-skill). All imagery comes from Higgsfield. The logo is redrawn to match the chosen direction and delivered as SVG before any screen uses it.

**Pipeline per screen**

1. **Shape** (impeccable `shape`): confirm the job, the user and the states before drawing anything.
2. **Mode and dials:** marketing pages are impeccable Persuade (taste dials 7 / 6 / 4 for variance / motion / density). App screens are Operate (4 / 3 / 6). Admin and recruiter tools are Operate at high density (3 / 2 / 7).
3. **Wireframe** from the spec below, then high-fidelity in AIDesigner.
4. **Gate A, before build:** impeccable `critique` (heuristic score) plus the taste-skill pre-flight checklist. Any failed box sends the screen back.
5. **Build**, then **Gate B, before ship:** impeccable `audit` (accessibility, performance, responsive) and `polish`, plus the impeccable craft floor: contrast, states, themed browser surfaces (selection, caret, scrollbars, focus rings), and copy.

**How the Editorial system settles the review-skill conflicts** (decided 2026-09-24)

| Was (Terminal Cool) | Rule | Now (Editorial, PRD section 9) |
| --- | --- | --- |
| Inter body | taste-skill: avoid Inter | Barlow body, Spectral display |
| lucide-react | taste-skill: prefer Phosphor, HugeIcons, Radix or Tabler | Phosphor, one stroke weight |
| Mono on tags and tier labels | impeccable: mono only for real data | JetBrains Mono only for hashes, repos, paths, endpoints |
| Emoji post-type picker | Both: no emoji as icons | Phosphor glyphs |
| Eyebrows, equal 3-card rows | Both: banned | text/label is for form labels and table headers only; landing recomposed |
| Em-dashes in UI copy | taste-skill: zero | Rewrite all strings |

**Imagery (Higgsfield MCP):** hero art, onboarding illustrations, empty-state art, OG images and any GIF or motion loops. No stock photos, no `<div>` fake screenshots; product previews use real captures of the built app.

**Logo:** the logo keeps its Montserrat wordmark and arrow-K, recoloured to the Editorial palette (option a): ink #0E0D0B with vermillion #C03910 accents; reversed uses #E7E7E3 with #E04020. There are 14 SVG variants: icon (colour, reversed, mono dark, mono light), app icon, favicon, lockup (primary, reversed, vermillion, mono dark, mono light), wordmark and reversed wordmark, stacked. They land in `public/brand/` at milestone 0. The favicon likely needs a simplified mark to read at 16px.

## 2. Layout system

The app uses one shell with three widths; marketing pages have their own full-bleed layout. The sizes below are starting points to confirm at Gate A.

| Breakpoint | Width | App shell | Content column |
| --- | --- | --- | --- |
| Phone | 360–767px | Top bar (logo, notifications, search) + bottom tab bar (Home, Opportunities, Ventures, Chat, Me) | Full width, 16px gutters |
| Tablet | 768–1023px | Collapsed icon rail (72px) + top bar | Single column, max 680px |
| Desktop | ≥ 1024px | Sidebar (240px) + main + right rail (320px) on feed, profile and ventures | Main max 680px; chat and ops use the full width |

**Sidebar groups:** the same five areas as the phone tab bar (PRD 5.25) — Home, Opportunities, Ventures, Chat, Me — then Explore, Leaderboard, Events, Friends, Notifications and Feedback. Every item has a tooltip (PRD 5.27). Recruiter, teacher, university and staff users get their own sidebar.

**Shared components** (one implementation each)

| Component | Contents | States |
| --- | --- | --- |
| Person chip | Avatar, name, tier badge, university | Default, you, blocked |
| Post | Author chip, time, body, media (uncropped, ≤ 480px tall), skills, actions (react-free: Join / Survey / Report) | Loading skeleton, removed, failed to load |
| Venture row | Title, type, status, needed skills, team slots x/y, owner chip | Recruiting, in progress, completed, abandoned |
| Skill tag | Name + provenance icon (GitHub, peer-verified, self-added) | Default, hidden |
| Composer | Type switch, body, media tray, invite fields | Empty, draft, uploading, cooldown, error |
| Chat bubble | Body, image, time, edited, delivery state | Sending, sent, failed (retry), deleted |
| Empty state | Generated illustration, one sentence, one action | — |
| Confirm sheet | Bottom sheet on phone, dialog on desktop; only for destructive actions (block, remove member, delete) | — |

Every list screen defines loading, empty, error and end-of-list states. Every form defines inline validation, a submitting state and an error that names the fix.

## 3. Screens

There are 103 screens, all live at launch. Each row gives the layout from phone to desktop, the elements in priority order, and the states that must be designed. Quoted strings are draft copy.

### 3.1 Public (Persuade)

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Landing | `/` | Follows the device theme (light or dark). Hero split: copy left, real feed capture in a phone frame right; stacks on phone. Then 14 sections, each a different layout family (PRD 5.1) | Headline "Join Pakistan's first social media platform exclusively for university students." (two lines at 1280 px), subline "Build with classmates, prove your skills with real work, and get recognised by recruiters. No more rejected CVs.", university email field with live detection + Join. Focal hero motion once (tick → count up → post moves up); scroll-linked tier ladder fill; no section reveals | Signed-in ("Open Skilient"), live numbers hidden below 200, reduced motion, JS disabled (all content visible) |
| University email field | Hero and final CTA | Inline field + result line | Detected university, personal-email warning, not-live "Request it", unknown domain | Detected, personal email, not live, unknown |
| Request your university | Sheet from the email field | Sheet | Email, university name (unknown domains), consent, confirmation message | Sent, rate-limited, already requested |
| For recruiters | `/recruiters` | Split hero (Higgsfield art) + proof captures + plan cards | What you see, how contact works, jobs and fairs, verification, plans, Create a recruiter account | Signed-in recruiter ("Open dashboard") |
| For universities | `/universities` | Editorial long-form + plan table | Dashboards, records (Growth/Campus), ecosphere, fairs, hackathons, sponsored Pro, Talk to us form | Form sent |
| For faculty | `/faculty` | Two-column feature list | Supervision, contribution confirmation, code checks, project ideas, endorsements, Join as faculty | — |
| About | `/about` | Editorial single column, full-bleed photo breaks | Story, founders, incubation, award, values | — |
| Pricing | `/pricing` | Plan comparison by audience: students free, recruiter plans, university licence | Plan cards with entitlements, FAQ, "Talk to us" for universities | Monthly or yearly toggle |
| CV verify | `/verify/[code]` | Single card, print-friendly | CV snapshot, issued date, signature status | Valid, revoked, expired, not found |

### 3.2 Auth and onboarding (Operate, low density)

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Sign up | `/signup` | Two-column on desktop (form + generated art), form only on phone | University email, password with strength meter, terms | Wrong domain (names allowed domains), already registered, check inbox (auto-advances on confirm) |
| Sign in | `/signin` | Same frame as sign up | Email, password, forgot link | Wrong credentials, suspended account, unconfirmed email |
| Forgot / reset password | `/forgot-password`, `/reset-password` | Same frame | One field each | Sent, expired link, success |
| Email confirmed | `/auth/confirmed` | Centered message | "You're confirmed. You can close this tab." | — |
| Onboarding | `/onboarding` | Full-screen stepper, progress at top, one step per view | Replaced by the six-step wizard in 3.12 (PRD 5.27) | Resume mid-flow, sync failed, sync still running |

### 3.3 Core app (Operate)

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Feed | `/feed` | Main column + right rail (suggested ventures, people, upcoming events) | See 3.13 (University Feed / Global Feed tabs, filter chips All, Ventures, Events, Announcements, Shipped; survey strip) | Empty university feed, new posts pill, cooldown, end of feed |
| Post detail | `/post/[id]` | Main column | Post, join status, report | Removed, not visible to you |
| Profile | `/profile/[username]` | Cover + identity header; tabs: Overview, Ventures, Skills, Activity | Tier badge, provenance-marked skills, ventures with roles, endorsements, actions (Add friend, Message, Report) | Own, friend, stranger, restricted card, blocked |
| Edit profile | `/settings/profile` | Settings layout: section list left, form right; sections stack on phone | Identity, avatar and cover crop, visibility, recruiter visibility, GitHub (App connection, repo exclusions, resync, held items), private L0 skills | Unsaved changes, upload progress, save error |
| Explore | `/explore` | Search bar + tabs (People, Projects, Startups) + filter row | Department, skill, university filters; person rows with friendship state | No results (suggests clearing filters), loading |
| Leaderboard | `/leaderboard` | Table of rank, person chip, tier, weekly change | University / Global switch, department filter, your position pinned | Opted out, not ranked yet |
| Score breakdown | `/me/score` | Single column | Proof and Momentum components with evidence links, weekly change, decay notice, how to improve | New user, decaying |
| Notifications | `/notifications` | List grouped Today / Earlier | Actor, action, target, time | Unread, empty |
| Announcements | `/announcements` | List with category filter; admin composer on top | Category, title, body, link, image | Empty, admin view |
| Settings | `/settings` | Section list | Account, privacy, notifications, blocked users, sign out | — |

### 3.4 Ventures

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Ventures | `/ventures` | Tabs Projects / Startups, filter row, venture rows | Status, needed skills, team slots, "Start a venture" | Empty, no matches |
| New venture | `/ventures/new` | Single form | Type, title, description, skills, team size, repo link | Validation, submitting |
| Venture | `/ventures/[id]` | Header (title, status, owner) + tabs: About, Team, Contributions, Reviews | Apply button with message, team list, lifecycle controls for the owner | Visitor, applied, member, owner, completed (read-only) |
| Requests | `/requests` | Two lists: received and sent | Applicant chip, message, accept / decline | Empty, handled |

### 3.5 Social

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Friends | `/friends` | Tabs: Friends, Received, Sent, Blocked | Person rows with actions (Message, Unfriend, Accept, Decline, Cancel, Unblock); add by username | Empty per tab |
| Chat list | `/chat` | Phone: list only. Desktop: list (320px) + open thread | Thread rows with unread count, direct and group icons | Empty, offline |
| Chat thread | `/chat/[id]` | Header (name or venture), messages, composer pinned to bottom | Image attach with preview, edit, delete, report | Reconnecting banner, failed send with retry, deleted message |

### 3.6 Trust and CV

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Log contribution | Sheet on venture page | Bottom sheet / side panel | Kind, description, evidence link, hours | Correction window, locked venture |
| Endorse teammates | Sheet after completion | Stepper per teammate | Skill picks (≤ 5), note | Already endorsed |
| My CV | `/me/cv` | Live preview (A4 ratio) + controls rail | Include / reorder sections, next refresh date (Free) or Refresh now (Pro), export ATS PDF (Pro), share link (Spark+), versions, view log | Generating, revoked |
| Credentials | `/me/credentials` | List + upload | File, issuer, dates | Pending, approved, rejected, expired |

### 3.7 Recruiter, teacher and university (Operate high density)

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Org onboarding | `/org/join` | Stepper | Company email, org details, verification pending | Pending review, rejected |
| Talent search | `/recruit/search` | Filter panel left, results table right, candidate preview drawer | Skill (verified only), university, department, batch, tier, activity filters; shortlist | No results, credits exhausted |
| Shortlists | `/recruit/shortlists` | Kanban by stage | Candidate cards, private notes | Empty |
| Job post editor | `/recruit/jobs/[id]` | Form + preview | Role, skills, location, sponsored boost | Draft, live, closed |
| Applicants | `/recruit/jobs/[id]/applicants` | Pipeline board | Applied → screening → interview → offer → hired / rejected | Hire confirmation and feedback |
| Billing | `/org/billing` | Settings layout | Plan, seats, invoices, payment method | Past due, trial |
| Teacher home | `/teach` | Two columns: ideas and review queue | To-do counts (review requests, code checks, supervisor comments), my ideas, supervised ventures, endorsements used this month; links to Ideas, Reviews, Supervision, Code checks, Settings | Empty queue |
| Review venture | `/teach/review/[id]` | Venture summary + rubric form | Five-part rubric (1–5 + comment each), decline option, due date; supervision view with contributions to confirm and the supervisor thread; code-check grading form (snippet, answers, 4-part rubric) | Submitted |
| University dashboard | `/uni` | Metric overview + charts by department and batch | Active students, ventures, skill and tier distribution, placements, export | Group below 5 hidden, no data |
| Events | `/events`, `/events/[id]` | List + detail | Type, date, RSVP, check-in | Full, past |

**More recruiter screens**

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Company page | `/companies/[slug]` | Header + about + open roles list | Logo, about, locations, roles (no hiring statistics) | Pending verification, no open roles |
| Candidate page | `/recruit/candidates/[id]` | Drawer from search, expands to a page | Live CV with verified badge, evidence per skill, ventures, tier, availability; shortlist, note, contact, invite to apply | Explore (upgrade prompt), no longer visible, blocked |
| Contact request composer | Sheet from candidate | Dialog | Role, message ≥ 50 chars, templates, credits left | Out of credits, 90-day cool-off, daily cap |
| Recruiter analytics | `/recruit/analytics` | Metric row + funnel + trends | Views → contacts → accepted → applied → hired; times; skills demand | Empty, Explore (locked) |
| Org members | `/org/members` | Settings layout | Invite by email on the domain, roles, seat usage | Seat limit, pending invites |

### 3.8 Admin (Operate high density)

Superseded by 3.11 (Skilient ops at `/ops`). The rows below keep their layouts but move to `/ops`, `/ops/evidence` and `/ops/billing`.

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Moderation queue | `/``ops` | Table + detail drawer | Report reason, target preview, dismiss / remove / suspend | Empty queue, action confirmation |
| Verification queues | `/``ops/evidence` | Tabs: organisations, teachers, credentials, GitHub activity flags | Approve / reject with reason | Empty |
| Revenue | `/``ops/billing` | Metric overview + tables | MRR, subscriptions, sponsored spend, hires | — |

### 3.9 Plans, billing, competitions and job fairs

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Student billing | `/settings/billing` | Settings layout | Current plan, Pro benefits, upgrade, payment method, invoices, cancel | Trial, active, past due, sponsored by university |
| Upgrade sheet | Sheet from any Pro-gated action | Bottom sheet / dialog | What the feature does, price, trial CTA, "check if your university sponsors Pro" | Already sponsored, payment failed |
| Recruiter Explore | `/recruit/search` (free plan) | Same as talent search | Anonymised result rows (tier, skills, university), aggregate counts, upgrade prompt on open | No results |
| Plan and credits | `/org/plan` | Settings layout | Plan, seats used, contact credits left this month, buy credits, compare plans | Credits exhausted, seat limit |
| Competition manager | `/recruit/competitions`, `/recruit/competitions/[id]` | List + detail with tabs: Brief, Participants, Submissions, Judging, Results | Create from template, eligibility, prize, rubric scoring, publish results | Draft, live, judging, published, quota used |
| Sponsored post checkout | Sheet on a job post | Dialog | Duration, price, preview of "Sponsored" label | Paid, expired |
| API tokens | `/org/settings/api` | Settings layout | Create, scope, revoke tokens; usage | Plan below Growth |
| Job fair (university admin) | `/uni/fairs/[id]` | Setup stepper + live dashboard | Dates, invited recruiters, booths, attendance | Draft, live, ended, quota used |
| Job fair (student and recruiter) | `/fairs/[id]` | Booth grid + queue panel | Company booths, open roles, join queue, chat or book slot | Queue full, fair ended |

### 3.10 Student portal additions

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Progress card | Top of `/feed` | Card above the composer | Tier, points, one next step, to-do count | New student, all caught up, dismissed today |
| Opportunities | `/opportunities/[tab]` | Tabs + filter row + list | For you, Jobs, Contact requests, Applications, Competitions and hackathons, Job fairs, Project ideas | Empty per tab, no matches (suggests skills to level up) |
| Application tracker | `/opportunities/applications/[id]` | Timeline | Stages with dates, company, role, generic rejection reason | Withdrawn, rejected, hired |
| My skills | `/me/skills` | List grouped by category | Level, evidence, next-level guidance, private L0 list | No GitHub connected |
| My work | `/me/work` | Tabs | Ventures, contributions, reviews, endorsements, credentials | Empty |
| Privacy centre | `/settings/privacy` | Settings layout | All visibility controls, viewer lists (Pro), blocked users and companies | Free (counts only) |
| Notification settings | `/settings/notifications` | Settings layout | Per-type instant email / digest / off | — |
| Delete account | `/settings/account/delete` | Confirm flow | Consequences, 14-day cooling-off, cancel link | Pending deletion |

### 3.11 Admin portal (Skilient ops)

Dense, desk-only (min width 1024px). Same Editorial tokens with a compact table density; a persistent "Staff" marker in the top bar.

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Queues | `/ops` | Sidebar + queue list | Counts, age timers, claim button, filters by queue | Empty, item claimed by someone else |
| Report detail | `/ops/reports/[id]` | Content + context rail | Reported content, attached messages only, author and reporter history, action + reason code | Already actioned |
| Evidence review | `/ops/evidence/[id]` | Split: evidence / decision | Commits, flags, approve/reject/reset | Resolved |
| Organisations | `/ops/orgs` | Table + detail drawer | Verification docs, plan, reputation metrics, sanctions | Pending, verified, suspended |
| Universities | `/ops/universities/[id]` | Tabs | Admins, plan, ecosphere config, exam calendar, invoices | Not onboarded |
| User record | `/ops/users/[id]` | Tabs | Score breakdown, evidence, CVs, billing, sanctions, view-as button | Deleting, banned |
| Billing | `/ops/billing` | Tabs | Subscriptions, gateway events, invoices, refunds, grants | Failed payment |
| Appeals | `/ops/appeals/[id]` | Original decision + appeal | Decide (blocked for the original staff member) | Decided |
| Config | `/ops/config` | Key list + versioned editor | Current value, history, reason, effective-at | Validation error |
| Metrics | `/ops/metrics` | Chart grid | Growth, evidence, hiring, revenue, backlogs | Loading |
| Audit log | `/ops/audit` | Filterable table | Staff, action, target, reason, before/after | — |

### 3.12 Signup, onboarding and learning

These rows take precedence over any earlier signup or onboarding row where they differ.

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Signup (student/faculty) | `/signup` | Centred card | Role choice, fields, "Continue with Google", detected university, agreement checkbox | Personal email refused, university not on Skilient (waitlist), non-university Google account, breached password |
| Recruiter signup | `/signup/recruiter` | Centred card | Company, work email, password, agreement | Personal email domain warning |
| Verify email | `/signup/verify` | Centred card | 6-digit code, resend timer | Expired, too many attempts |
| Agreement sheet | Overlay | Side sheet | Version, headings, close | — |
| Re-accept agreement | `/agreement` | Full page | What changed, full text, accept | — |
| Onboarding step | `/onboarding/[step]` | Wizard card + progress bar | One step per screen, Back / Continue / Skip (GitHub) | Resumed, validation error |
| You're in | `/onboarding/done` | Celebration card | Checklist preview, Take the tour | — |
| Tour coach mark | Overlay on Home | Spotlight + popover | Title, body, Step x of y, Next/Back/Skip | Mobile (anchored to tab bar), reduced motion |
| First-visit tip | Inline, top of page | Dismissible card | Two lines, Show me more | Expanded |
| Feedback | `/feedback` | Form + My feedback list | Type, text, screenshot, status timeline, staff reply | Sent, empty list |
| Ops feedback triage | `/ops/feedback` | Table + drawer | Status, reply, tags | — |

### 3.13 Feed, micro-survey, ventures and chat

No like, reaction, save or share controls on posts anywhere.

| Screen | Route | Layout | Key elements | States |
| --- | --- | --- | --- | --- |
| Feed | `/feed?tab=university\|global` | Tabs + filter chips + list | University Feed / Global Feed, pinned announcement, "new posts" pill, survey strip under each surveyable post | Empty feed (suggest ventures and classmates), offline |
| Composer | Sheet from Home | Card | Type picker, audience (University/Global), images, venture picker for invites, event and poll fields, draft saved | Cooldown, validation error |
| Micro-survey strip | Under every surveyable post (not dismissible) | Slim strip | Question, tick and cross (44 px), one assigned question per reader per post; after answering, the public line + "Answered" | Unanswered, answered, change-answer window (10 min), own post (hidden) |
| Post insights | Post menu → Insights (author) | Sheet | Paid: per-dimension tick/cross breakdown, views, commenters. Free: upgrade explanation | Too few answers, free plan |
| Comments | Post detail `/p/[id]` | Post + thread | One reply level, pinned comment, mentions | No comments, deleted comment |
| Event and poll posts | In feed | Card variants | RSVP buttons / options with results after vote | Closed poll, past event |
| Ventures browse | `/ventures` | Filters + card grid | Type, needs my skills, open roles, recommended row | No matches |
| Venture page | `/ventures/[id]/[tab]` | Header + tabs | About, Team, Updates, Contributions, Deliverables (members), Reviews, Chat (members), Follow | Full (6/6), completed, outsider view |
| Apply to role | Sheet on venture page | Form | Role, up to 3 questions, message | Role filled, already applied |
| Chat thread | `/chat/[threadId]` | Messages + composer | Reply-to, reactions, typing indicator, read receipts (DMs), pins (groups), image attach | Reconnecting, failed send, blocked |
| Chat search | `/chat/search` | Search + results | Across all threads, jump to message | No results |

Route note: this spec merges `/projects` and `/startups` into `/ventures` with tabs, and moves `/profile/edit` to `/settings/profile`. Keep redirects from the old routes.
