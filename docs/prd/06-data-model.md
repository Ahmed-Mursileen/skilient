## 6. Data model

The tables below are the starting schema; where a feature section (5.x) defines columns or tables differently, the feature section wins. All tables are RLS-enabled. Keep every migration in the repo under `supabase/migrations/` (the reference build keeps schema only in the remote project, which makes a clean rebuild impossible).

| Domain | Table | Key columns | Notes |
| --- | --- | --- | --- |
| Identity | `universities` | id, name, slug, logo\_path, final\_year\_batch; domains in `university_domains` | All HEC universities preloaded; signup gate reads `university_domains` |
| Identity | `profiles` | user\_id (PK, FK auth.users), username (unique), name, university\_id, batch\_year, department, bio, avatar\_url, cover\_url, visibility, github\_username, github\_connected, onboarding\_complete | Row created on signup by trigger |
| Identity | `profiles_public_card` (view) | user\_id, name, department, batch\_year | Bypasses visibility for discovery only |
| Identity | staff\_roles | user\_id, role (moderator \| trust \| accounts \| super\_admin), granted\_by, granted\_at | Replaces the reference build's `admin_users` (5.26) |
| Skills | `skills` | Replaced by the taxonomy `skills` (id, name, category, parent\_id, detectors jsonb, taxonomy\_version) plus `user_skills` (user\_id, skill\_id, level 0–4, active\_days, lines, last\_used\_at) | Levels L0–L4; see section 5.5 |
| Ventures | `ventures` | id, type (project \| startup), owner\_id, university\_id, title, description, status, visibility (public \| university \| unlisted), stage, team\_size (≤ 6), skill\_tags\[\], duration\_start, duration\_end | Shared table by design |
| Ventures | `venture_members` | venture\_id, user\_id, role (`creator` \| `member`), joined\_at | Unique (venture\_id, user\_id) |
| Ventures | `application_threads` | id, venture\_id (nullable), post\_id (add), candidate\_id, owner\_id, status (`pending` \| `accepted` \| `declined` \| `closed`) | Visible to candidate and owner only |
| Ventures | `application_messages` | thread\_id, sender\_id, body, created\_at | Separate from chat on purpose |
| Feed | `posts` | id, author\_id, university\_id, audience, type, body, venture\_id, stage, edited\_at, created\_at | Types: general, invite, announcement, event, poll, shipped (5.28) |
| Feed | `post_media` | post\_id, url, media\_type (`image` only; no video) | ≤ 4 per post |
| Feed | `micro_survey_questions` | id, dimension, text, post\_types\[\], public, active | 12 dimensions, \~25 questions at launch |
| Feed | `micro_survey_responses` | post\_id, user\_id, question\_id, dimension, answer (bool), latency\_ms, weight, locked\_at | Primary key (post\_id, user\_id): one answer per reader per post |
| Feed | `post_quality_index` | post\_id, qi\_score (0–100), response\_count | Counts only when responses ≥ 5 |
| Social | `friend_requests` | id, sender\_id, receiver\_id, status (`pending` \| `accepted` \| `declined`) | Add partial unique index on the unordered pair where status in (pending, accepted) |
| Social | `friendships` | user\_id\_a, user\_id\_b (a < b), created\_at | One ordered row per pair |
| Social | `blocks` | blocker\_id, blocked\_id, created\_at |  |
| Chat | `chat_threads` | id, type (`direct` \| `group`), venture\_id |  |
| Chat | `chat_thread_members` | thread\_id, user\_id, last\_read\_at | Drives unread counts |
| Chat | `chat_messages` | id, thread\_id, sender\_id, body, media\_url, media\_type, created\_at, delivered\_at, edited\_at, deleted\_at | Soft delete |
| Engagement | `notifications` | id, user\_id, actor\_id, type, entity\_type, entity\_id, body, read, created\_at | Trigger-written only; no insert policy |
| Engagement | `announcements` | id, publisher\_id, university\_id, title, description, category, link, media\_url, created\_at | Admin write, all-authed read |
| Trust & safety | `reports` | id, reporter\_id, target\_type (post \| comment \| user \| message \| venture \| job\_post \| event), target\_id, reason, detail, target\_snapshot, status (pending \| reviewed \| actioned), reviewed\_by, reviewed\_at |  |
| Trust & safety | `rate_limit_events` (new) | user\_id, action, created\_at | Replaces the reference build's reuse of `anti_gaming_flags` for cooldown markers |
| Ranking | `ranking_scores` | user\_id, formula\_version, components (jsonb), proof, momentum, momentum\_peak, total, tier, percentile, below\_since, computed\_at | Owner reads full row; others see tier, rank, percentile |
| Ranking | `ranking_snapshots` | user\_id, week, formula\_version, components (jsonb), total, tier; plus `exam_periods` (university\_id, starts\_on, ends\_on) | Weekly history for weekly change and appeals; owner-read |
| Ranking | `endorsements` | endorser\_id, endorsee\_id, venture\_id, skill\_id, weight | Used by peer endorsements (5.16) |
| Ranking | `anti_gaming_flags` | user\_id, flag\_type, detail, reviewed, created\_at | Automated flags for admin review |

**GitHub verification tables (section 5.5):** `github_accounts` (user\_id, github\_id unique, login, installation\_id, token\_ref in Vault), `github_repos` (github\_repo\_id, private, kind, parent, excluded), `github_commits` (sha, repo\_id, meaningful\_lines, pushed\_at, signed, status counted/held/excluded), `github_prs` (merged\_at, merged\_by\_id, approved\_by\_other), `skill_evidence` (user\_id, skill\_id, source commit/pr/venture/endorsement/check, ref, detector, lines, occurred\_at, status), `sync_jobs` (stage, cursor, attempts, error) and `review_flags` (kind, refs, status, reviewer\_id). Evidence rows are owner-only; others see skill name and level per profile visibility.

**Storage buckets:** `avatars` (avatar ≤ 5 MB, cover ≤ 8 MB; owner-write, public read) and `post-media` (post images and chat images, no video; authed write, scoped read).

**Trust tables:** `contributions` (user\_id, venture\_id, kind, description, evidence\_url, created\_at; insert-only), `credentials` (user\_id, issuer, verified\_at, expires\_at), and the CV set: `cv_records` (id, user\_id, code unique, version, template, snapshot jsonb, snapshot\_hash, pdf\_hash, signature, key\_id, issued\_at, expires\_at, revoked\_at, superseded\_by), `cv_settings` (user\_id, sections jsonb, visibility, show\_email, last\_refreshed\_at), `cv_share_links` (token, expires\_at, revoked\_at, view\_count), `cv_views` (cv\_record\_id or link\_id, viewer\_org\_id, source, viewed\_at) and `signing_keys` (key\_id, public\_key, active\_from, retired\_at; private key in Vault only).

Network, ecosphere and billing tables: `organizations` (companies; universities keep their own `universities` table), `org_members` (role admin/recruiter/billing), `recruiter_shortlists`, `recruiter_notes`, `contact_requests`, `job_posts` (sponsored\_until), `job_applications` (stage), `hires`, `hire_outcomes`, `api_tokens`, `teacher_profiles`, `teacher_settings`, `project_ideas`, `venture_supervisors`, `supervisor_comments`, `review_requests`, `venture_reviews`, `events`, `event_rsvps`, `competitions`, `competition_submissions`, `job_fairs`, `job_fair_booths`, `job_fair_queue`, `university_admins`, and the billing set in 4b.2 (`plans`, `subscriptions`, `entitlement_grants`, `usage_counters`, `payments`, `webhook_events`, `invoices`, `add_on_orders`, `hire_fees`, `trial_claims`, `tax_rates`). Contact credits and university sponsorship are entitlement grants, not separate tables. Plus `profiles.recruiter_visible`, `profiles.looking_for`, `profiles.status` and `posts.audience`.

#### Build: database workflow

- **Local:** Supabase CLI (`supabase start`) with Docker; `supabase/migrations/NNNN_name.sql` created by `supabase migration new`; `supabase db reset` rebuilds from zero and runs `supabase/seed.sql` (universities, domains, departments, survey questions, skills taxonomy, plans, tax rates). Seed data never includes users.
- **Order:** one migration per feature area, each containing its tables, indexes, RLS policies, SQL functions and triggers together, so a feature is reviewable as one file.
- **Conventions:** `uuid` primary keys (`gen_random_uuid()`), `created_at timestamptz default now()`, soft deletes via `removed_at` where moderation needs history, enums as Postgres enums, every foreign key indexed, `security definer` functions with `set search_path = public` and an explicit `auth.uid()` check.
- **Types:** `supabase gen types typescript` writes `types/database.ts` in CI; the build fails if it's stale.
- **Environments:** a Supabase branch per pull request (preview), `staging` and `production` projects; migrations applied by CI (`supabase db push`) on merge, never by hand.
- **Tests:** pgTAP tests in `supabase/tests/*.sql` for every RLS policy and SQL function; run in CI against a fresh `db reset`.
