### 5.25 Student portal (decided 2026-09-25)

The student experience ties sections 5.3–5.19 into one app with five areas, a progress card on the feed, an opportunities hub, a privacy centre and a graduate state. Launch is web-only: no installable app, no push notifications (in-app and email only), no "download my data" export.

**Navigation**

| Area | Contains | Phone |
| --- | --- | --- |
| Home | Feed with a progress card on top; the post composer | Bottom tab |
| Opportunities | Jobs, contact requests, applications, competitions and hackathons, job fairs, project ideas | Bottom tab |
| Ventures | Mine and browse | Bottom tab |
| Chat | DMs, groups, recruiter chats | Bottom tab |
| Me | Profile, skills, my work, CV, score, settings | Bottom tab |
| Explore, Leaderboard, Events, Friends, Notifications | Secondary | Top-bar icons or inside Me |

The Post action lives in the Home composer, not the tab bar.

**Home progress card** (above the feed, dismissible for the day): tier and points, the single most valuable next step (e.g. "Get 1 teammate to confirm a contribution to reach Spark"), and a to-do count (join requests, contact requests, contributions to confirm, endorsement prompts).

**Opportunities hub** (`/opportunities`)

| Tab | Contents |
| --- | --- |
| For you | Jobs, competitions, hackathons and ideas matched to the student's L2+ skills and "looking for" line; never sponsored |
| Jobs | All open roles with filters and salary range; sponsored posts labelled here only |
| Contact requests | Recruiter requests to accept or decline |
| Applications | Tracker per application: applied → screening → interview → offer → hired/rejected, with dates |
| Competitions and hackathons | Open, registered, past results |
| Job fairs | Upcoming fairs at their university, booths, live queue status |
| Project ideas | Teacher ideas to start a venture from |

**Me**

| Page | Contents |
| --- | --- |
| Profile | Public view and edit (5.4), "looking for" line, university badges |
| Skills (`/me/skills`) | Every skill with level, evidence and how to reach the next level; private L0 skills |
| My work (`/me/work`) | Ventures, contributions, reviews, endorsements given and received, credentials |
| CV (`/me/cv`) | Section 5.18 |
| Score (`/me/score`) | Section 5.17 |
| Settings | Account, notifications, privacy centre, billing, GitHub, delete account |

**Privacy centre** (`/settings/privacy`): profile visibility; recruiter visibility with the "looking for" line and blocked companies; leaderboard opt-out; CV visibility and share links; who viewed my CV (names with Pro); who at my university viewed my record (Pro, Growth/Campus universities); blocked users.

**Notifications:** in-app (Realtime bell) and email only. Per-type preference: instant email, daily digest or off; defaults are instant email for contact requests and application updates, daily digest for everything else.

**Graduates:** when the university's final-year batch rolls over, those students become **graduate** accounts. They keep profile, CV, skills and evidence, recruiter visibility, chat and friends, and can apply to jobs. They can no longer post in the university feed (global only) or join university-only ventures, lose sponsored Pro (they can buy it), and drop off university leaderboards 12 months after graduating. Not alumni accounts: alumni features stay post-launch.

**Delete account:** 14-day cooling-off, then permanent deletion (personal data removed, others' records anonymised, CVs revoked).

#### Build: student portal

- **Shell:** `app/(app)/layout.tsx` renders `Sidebar` (desktop) and `BottomTabs` (phone: Home, Opportunities, Ventures, Chat, Me) from one nav config in `lib/nav.ts`; badge counts from a `nav_badges(user_id)` SQL function, refreshed via Realtime on notifications.
- **Progress card:** `next_best_action(user_id)` SQL function returns one action from an ordered rule list (missing peer-verified contribution, unconfirmed teammate entries, missing endorsement for Flare, no completed venture for Shine, pending requests), plus the to-do count; dismissal stored in `ui_state(user_id, key, value)`.
- **Opportunities:** `app/opportunities/[tab]/page.tsx`; `opportunity_matches(user_id, cursor)` scores open jobs, competitions, hackathons and ideas against the student's `user_skills` (same weights as talent search, reversed) and availability; excludes sponsored boost from ordering; applications tracker reads `job_applications` with stage history.
- **Me pages:** `app/me/(skills|work|cv|score)` reading existing tables; no new data.
- **Notification prefs:** `notification_prefs(user_id, type, channel instant_email|digest|off)`; `notification-digest` job reads it.
- **Graduate state:** `profiles.status active|graduate|deleting`; a nightly `graduate-rollover` job sets `graduate` when a university advances `final_year_batch` past the student's batch, and RLS on university feed inserts and university-only venture joins checks `status = 'active'`; leaderboard queries exclude graduates older than 12 months.
- **Deletion:** `requestAccountDeletion()` sets `deleting` with `delete_after = now() + 14 days` (cancellable); `account-deletion` job anonymises and deletes after the window.
- **Done when:** every tab and Me page renders loading, empty and error states; "For you" never orders by sponsorship; a graduate can't post to the university feed; a cancelled deletion restores the account fully.
