### 5.28 Feed, micro-survey, ventures and chat — detail (decided 2026-09-25)

This section completes 5.6, 5.7, 5.9 and 5.15. Where they differ, this section wins.

#### Feed

**Two feeds:** **University Feed** (default; your university only) and **Global Feed** (all universities). The poster picks the audience for each post: University or Global. Global posts also appear in the author's University Feed.

**No likes, reactions, saves or share-to-chat.** The only public signal on a post is one line from the micro-survey: "12 people find this informative · 8 find this interesting". No image alt text field.

**Post types**

| Type | Who can post | Notes |
| --- | --- | --- |
| General | Anyone verified | Text, up to 4 images, link preview |
| Venture invite | Venture owner | Always creates or links a venture; shows open roles and an Apply button |
| Announcement | University admins, faculty | University Feed only; one may be pinned at a time for up to 7 days |
| Event | Anyone verified | Date, time, place or link, RSVP (Going / Interested) |
| Poll | Anyone verified | 2–4 options, closes after 1–7 days; results shown after voting or on close |
| Shipped | System | Created when a venture is completed; tags the team and links the venture |

**Filter chips:** All, Ventures, Events, Announcements, Shipped.

**Comments:** 1–1,000 chars, one level of replies, @mentions, no reactions on comments. Oldest first; the post author can pin one comment. 10-second cooldown between comments; author and mentioned people are notified.

**Other controls:** edit within 15 minutes (shows "edited"), delete, mute a person, hide a post ("Not for me"), report. Drafts save automatically. Link previews are fetched server-side.

#### Micro-survey

The micro-survey replaces likes. It is a permanent strip under every surveyable post — one question with a **tick** (yes) and a **cross** (no). Readers may ignore it, but **it can't be dismissed, hidden or skipped**; it stays under the post until that reader has answered. Its answers drive the feed algorithm (below), the public line on the post, the author's insights (paid) and the Content quality part of Momentum (5.13).

**Dimensions and question bank**

| Dimension | Shown publicly | Applies to | Example questions (tick = yes, cross = no) |
| --- | --- | --- | --- |
| Informative | Yes | All surveyable types | "Did you learn something from this?" / "Was this informative?" |
| Interesting | Yes | All surveyable types | "Was this interesting to you?" / "Would you want to see more like this?" |
| Relevant | No | All surveyable types | "Is this relevant to you?" / "Does this matter to students like you?" |
| Credible | No | All surveyable types | "Does this seem accurate?" / "Do you trust this information?" |
| Useful | No | General, Shipped | "Could you use this in your own work or studies?" |
| Clear | No | General, Venture invite, Event | "Was this clearly explained?" / "Is it clear what this is about?" |
| Original | No | General, Shipped | "Is this something new to you?" / "Is this original work or thinking?" |
| Worth sharing | No | All surveyable types | "Should more students see this?" |
| Appropriate | No | All surveyable types | "Is this appropriate for Skilient?" (a cross also counts as a soft report signal) |
| Impressive work | No | Shipped | "Is this impressive work?" / "Would you be proud to have built this?" |
| Would join | No | Venture invite | "Would you join a project like this?" |
| Would attend | No | Event | "Would you attend something like this?" |

Twelve dimensions, each with one to three wordings (about 25 questions at launch), seeded and editable in `/ops`; new dimensions can be added there. Answers are binary: tick counts as positive, cross as negative. Surveyable post types: General, Venture invite, Event and Shipped (never Announcements or Polls).

**How it works for a reader**

- The strip is always rendered under every surveyable post the reader sees, in both feeds and on the post page. There is no dismiss, skip or close control and no daily cap.
- **Each reader answers exactly one question per post.** The question is assigned the first time the post is shown to that reader and stays the same after refreshes or on other devices, so readers can't cycle questions.
- After a tick or cross, the strip settles into the public line with a small "Answered" mark.
- A reader can change their tick or cross within 10 minutes; after that it's final.
- Not shown on the reader's own posts (the author sees the public line only, or insights on a paid plan).
- Answering stays open for as long as the post exists; answers after the post leaves the ranked feed (7 days) still count toward its stats and the author's Content quality.

**Which question:** each post has target shares of answers — Informative 25%, Interesting 25%, and the remaining 50% split equally across the other dimensions eligible for its type. A new reader is assigned the dimension furthest below its target share on that post, so every post builds a balanced picture from one answer per reader. Ties go to Credible and Appropriate first (safety signals), then at random. The wording within a dimension is random. Target shares live in `platform_config` (`survey.shares`).

**How it looks:** a slim strip directly under the post body: question on the left, a tick and a cross on the right (44 px touch targets, keyboard reachable, labelled "Yes"/"No" for screen readers). No counts are shown until the reader answers.

**Public line:** each part shows only when at least 3 people answered positively on that dimension ("5 people find this informative"). Counts are raw people, not weighted, and not clickable. Nothing shows before that.

**Author insights — paid only** (post menu → Insights): the full tick/cross breakdown for every dimension, views and number of commenters, for the author's own posts. Available on Student Pro (including university-sponsored Pro) and on faculty and university accounts whose plan includes it; entitlement `insights.post_survey`. Free authors see the same public line as everyone else, plus an Insights button that explains the upgrade. Not shown on any plan: reach stage or score.

**Anti-gaming**

- Answers given less than 0.8 s after the strip came on screen are discarded.
- Readers who give the same answer to everything (20+ answers, no variation) count at 0.3 weight.
- The author's friends and venture teammates count at 0.5 weight; accounts younger than 3 days at 0.5.
- A reader must have had the post at least 60% on screen for 1.5 s (a qualified view) before an answer is accepted.
- 3 or more crosses on Appropriate from distinct non-friends add the post to the `/ops` report queue as a soft signal.
- Only responses from at least 3 non-friends count toward Content quality in 5.13 (unchanged).

#### Feed algorithm

The ranking is hidden from users. It is driven by trigger conditions, micro-survey answers and comments, with a time decay so strong posts don't stay on top forever. All weights and thresholds live in `platform_config` (`feed.*`) and are edited in `/ops`.

**Distribution stages (post trigger conditions)**

| Stage | Who sees it | Moves on when |
| --- | --- | --- |
| Seed | The author's friends, same program and batch, and followers of a linked venture; for Global posts, also the author's university. For the first 2 hours or 30 views | → Full if ≥ 5 survey answers with ≥ 40% positive, or ≥ 3 distinct non-friend commenters |
| Limited | Seed audience, plus low placement in the rest of the feed | Can still move to Full while under 7 days old if a Full trigger is met later |
| Full | Everyone in the chosen feed (University or Global) | — |
| Global boost | Global posts only: shown across all universities with higher placement | ≥ 10 survey answers with ≥ 50% positive, or ≥ 5 commenters from ≥ 2 universities |
| Demoted | Placement × 0.3 | ≥ 10 answers with ≥ 30% negative on Credible, or ≥ 30% "Not for me" hides among viewers |
| Held | Removed from both feeds, visible to the author only, sent to the `/ops` queue | ≥ 3 distinct reports; ≥ 5 hides it from the author's profile too until reviewed |

Shipped posts skip Seed and start at Full with a 1.5× boost for 24 hours. Pinned announcements sit above the ranked feed and aren't scored.

**Score for a post shown to a reader**

`score = (0.15 + Q) × (1 + E) × R × D ÷ (age_hours + 2)^G`

- **Q (quality):** Bayesian average of weighted positive answers on Informative and Interesting — (positive + 10 × platform mean) ÷ (answers + 10) — reduced by the Credible negative rate (× (1 − min(0.8, 2 × negative rate))).
- **E (conversation):** 0.5 × ln(1 + distinct commenters), not counting the author; friends count 0.5; comments under 10 characters are ignored; each person counts once.
- **R (relevance to this reader):** friend 1.4, follows the linked venture 1.4, same program 1.2, same batch 1.1, overlap with the reader's skills up to 1.3; multiplied together, capped at 2.0. Muted author → 0.
- **D (freshness of the reader's feed):** already seen × 0.3; second post from the same author on one page × 0.5; no two posts from the same author back to back.
- **Time decay:** gravity G = 1.5. Posts older than 7 days leave the ranked feed (Shipped posts: 14 days) and stay on the author's profile.
- **Exploration:** 1 slot in every 5 goes to a Seed-stage post under 2 hours old, so new posts always get tested.

#### Ventures

- **Team size:** maximum 6 members, including the owner.
- **Open roles:** the owner lists slots (title, skills, how many); applicants apply to a role and answer up to 3 questions the owner sets. A role closes when filled.
- **Visibility:** Public (any university can apply), University-only (own university only), or Unlisted (link only; applications by invite).
- **Invite by username:** the owner can invite someone directly; accepting joins them to the venture and its group chat.
- **Venture page tabs:** About (pitch, stage for startups, links), Team, Updates, Contributions, Deliverables, Reviews, Chat.
- **Members only:** Deliverables and Chat. Outsiders see only a count ("3 deliverables"). The verified CV shows that a venture has verified deliverables, not the links.
- **Updates:** members post progress notes (≤ 2,000 chars, ≤ 4 images); followers see them in their feed as venture updates.
- **Follow:** anyone can follow a Public venture to see its updates and its Shipped post.
- **Leave:** a member can leave; confirmed contributions stay on their record but stop counting toward the venture.
- **Startup extras:** stage (idea, prototype, launched, revenue), optional pitch deck link, incubator or university affiliation.
- **Browse** (`/ventures`): filters for type, "needs my skills", status, my university or all, open roles; a "Recommended for you" row uses the same matching as the Opportunities hub.

#### Chat

- **Thread types:** DM (friends, or after an accepted application), venture group chat, recruiter thread (5.20). No friend group chats.
- **Messages:** text and images only (no PDFs, voice notes or video); reply to a specific message; emoji reactions on messages (fixed set of 6); link previews; edit and delete as in 5.9.
- **Typing indicator** in all threads.
- **Read receipts** in DMs only, on by default; a user who turns them off neither sends nor sees them.
- **Controls:** mute a thread, search within a thread and across chats, pin up to 3 messages in a venture group (owner). Venture group membership follows venture membership; members can mute but not leave the group without leaving the venture.
- **Safety:** report a message (with up to 10 earlier messages attached by the reporter, 5.26); blocking closes the DM; 30 messages a minute per user.
- **Not at launch:** friend group chats, PDFs and files, voice notes, calls, disappearing messages.

#### Build: feed, micro-survey, ventures and chat

- **Posts:** `posts` gains `audience university|global`, `type general|invite|announcement|event|poll|shipped`, `venture_id` (required for invite and shipped), `edited_at`, `stage seed|limited|full|global_boost|demoted|held`, `stage_changed_at`. Events: `post_events(post_id, starts_at, place, url)`, `event_rsvps(post_id, user_id, status)`. Polls: `poll_options`, `poll_votes` unique (post\_id, user\_id). Shipped posts are inserted by the `transition_venture` function on completion. Edit allowed only while `now() < created_at + 15 min` (checked in the SQL function).
- **Comments:** `post_comments(id, post_id, parent_id, author_id, body, pinned, created_at, deleted_at)` with a check that a reply's parent has no parent; `add_comment` enforces length, cooldown and blocks.
- **Hides and mutes:** `post_hides(user_id, post_id)`, `user_mutes(user_id, muted_id)`.
- **Views:** the client batches qualified views (≥ 60% for ≥ 1.5 s) every 10 s to `record_views(post_ids[])`, stored as `post_views(post_id, user_id, first_seen_at)` unique per pair; used for "already seen", stage view counts, the survey's qualified-view check and author insights.
- **Micro-survey:** `micro_survey_questions(id, dimension, text, post_types[], public bool, active)`; `micro_survey_assignments(post_id, user_id, question_id, assigned_at)` primary key (post\_id, user\_id) — created by `survey_question_for(post_id)` the first time the feed payload includes that post for the reader (insert … on conflict do nothing, then read back), so the question never changes; `micro_survey_responses(post_id, user_id, question_id, dimension, answer bool, latency_ms, weight, created_at, locked_at)` primary key (post\_id, user\_id) — one answer per reader per post. The feed payload carries each post's assigned question, so the strip renders with the post and never pops in. `answer_survey(post_id, answer)` answers the assigned question only and checks the qualified view, latency ≥ 800 ms and not own post; an update is allowed until `locked_at` (created + 10 min). `post_stats(post_id, per-dimension ticks and crosses, weighted_pos, hides, commenters, commenter_unis, reports, views)` kept current by triggers; the assignment function reads its per-dimension counts to pick the dimension furthest below `config('survey.shares')`.
- **Insights (paid):** `getPostInsights(postId)` calls `requireEntitlement('insights.post_survey')` (4b.4) and author check; returns per-dimension ticks, crosses and weighted rates. The entitlement is added to the registry in 4b.3 for Student Pro and sponsored Pro.
- **Stages:** `feed-stage` job every 5 minutes applies the trigger table to posts under 7 days old and writes `stage`; reports trigger `held` immediately.
- **Ranking:** `feed_page(audience, filter, cursor)` SQL function builds candidates (last 7 days, reader's university or global, not hidden, not muted, not blocked, stage allowed for this reader), scores them with `config('feed.*')`, applies diversity and exploration rules, and stores the ordered id list in `feed_sessions(user_id, audience, filter, post_ids, created_at)` for 10 minutes so paging never repeats or skips; the cursor is a position in that list. "New posts" pill starts a fresh session.
- **Quality index:** the nightly `quality-index` job (5.13) reads `micro_survey_responses` with weights and writes `post_quality_index`; unchanged otherwise.
- **Ventures:** `ventures` gains `visibility public|university|unlisted`, `stage`, `pitch_url`; `venture_roles(venture_id, title, skill_ids, slots, filled)`, `venture_questions(venture_id, position 1–3, text)`, `application_threads.role_id` + `answers jsonb`, `venture_invites(venture_id, invitee_id, status)`, `venture_follows(venture_id, user_id)`, `venture_updates(venture_id, author_id, body, media, created_at)`. `decide_application` and `accept_invite` lock the venture row and refuse when members = 6. RLS: `venture_deliverables` and venture group chat readable by members only; University-only ventures refuse applicants from other universities.
- **Chat:** `chat_messages.reply_to_id`, `message_reactions(message_id, user_id, emoji)` with a 6-emoji check, `chat_pins(thread_id, message_id)` ≤ 3, `chat_thread_members.muted_until`. Typing uses Realtime broadcast (not stored), throttled to one event per 3 s. Read receipts expose the other member's `last_read_at` in DMs only when both have `privacy.read_receipts` on. Search: `tsvector` column on `chat_messages` with a GIN index, queried through a function that joins membership. Rate limit via `rate_limit_events` (30/min). Image-only media check unchanged from 5.9.
- **Link previews:** shared `link_previews(url_hash, title, description, image_url, fetched_at)` filled by an Edge Function that blocks private and loopback addresses, follows at most 3 redirects, times out at 3 s and caches for 7 days.
- **Done when:** no like, save or share control exists anywhere; the survey strip has no dismiss control and renders on every surveyable post except the reader's own; a reader's assigned question never changes and a second answer to the same post is refused (only an update within 10 minutes); an answer before a qualified view is refused; a free author calling `getPostInsights` directly is refused; the public survey line is absent below 3 ticks; a post older than 7 days never appears in the ranked feed; paging a feed returns no duplicates; a 7th member can't join a venture under parallel accepts; a non-member can't read deliverables; a user with read receipts off neither sends nor sees them.
