## 8. Security, privacy and RLS

RLS is the enforcement layer; server actions add explicit checks on top, never instead. Every table needs SELECT, INSERT, UPDATE and DELETE policies reviewed and tested under a real authenticated session, because a missing write policy fails silently.

**RLS policy matrix (social core)**

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | Owner; friends if `friends`; same university if `university`; everyone signed in if `global` | Owner only |
| `profiles_public_card` | All signed-in users | — |
| `skills` | Same rule as the owning profile | Owner (`manual`); service role (`github_verified`) |
| `posts`, `post_media` | University posts: same university; Global posts: all signed-in users; held posts: author and staff only | Author insert/edit (15 min)/delete; staff remove |
| `ventures` | Public: all signed in; University-only: same university; Unlisted: members and invitees. Deliverables and group chat: members only | Owner insert/update/delete |
| `venture_members` | Same rule as the venture | Owner (accept) and creator self-row |
| `application_threads`, `application_messages` | Candidate and owner only | Candidate creates; owner updates status |
| `friend_requests` | Sender or receiver | Sender insert/delete; receiver update |
| `friendships` | Either member | Receiver on accept; either member deletes |
| `blocks` | Blocker | Blocker |
| `chat_threads`, `chat_thread_members`, `chat_messages` | Thread members only | Via security-definer RPCs (below); sender edits/soft-deletes own messages |
| `notifications` | Owner | Triggers only; owner marks read/deletes |
| `announcements` | All signed in | University admins and approved faculty (own university); staff |
| `reports` | Staff; university admins for their own ecosphere content | Reporter insert; staff update |
| Ranking tables | Owner reads full row; others see tier and rank only | Service role |

**Must fix vs. the reference build**

1. **Chat authorisation hole.** `chat_threads` uses `USING (true)` and `chat_thread_members` insert uses `WITH CHECK (true)`, so any user can read any thread and add themselves. Replace with security-definer Postgres functions (`create_direct_thread(other_user)`, `accept_application(thread_id)`) that validate friendship or ownership and insert both member rows atomically.
2. **GitHub identity spoofing.** Onboarding sends a GitHub username from the browser and `github-sync` accepts any `user_id` and username, so anyone can claim anyone's GitHub. Bind identity server-side from the GitHub App callback and never accept a user id or username from the client (section 5.5, P0).
3. **Service-role key in the cron migration.** Store it in Supabase Vault and read it inside the scheduled SQL.
4. **Over-broad deletes.** Unfriend deletes every request involving the other user, and the block check matches any block either user has made. Scope both to the pair.
5. **Explicit ownership checks** in `acceptApplication`, `declineApplication` and `deleteAnnouncement`, not RLS alone.

**Baseline**

- service\_role only in Edge Functions, jobs and the billing worker; never in pages, server actions that act for a user, or the ops UI. Never importable by client code.
- Server-only secrets: service-role key, GitHub App private key and webhook secret, Resend key. GitHub user tokens live encrypted in Supabase Vault.
- Rate limits: Supabase auth limits for signup/sign-in; app cooldowns of 30 s (post), 5 s (friend request), 60 s (report) stored in `rate_limit_events`.
- Render all user text through React escaping; no `dangerouslySetInnerHTML` on user content.
- Validate media type and size server-side (storage bucket policies plus action checks), not just in the browser.
- Privacy: students control profile visibility now and recruiter visibility; reporters never see outcomes; suspended users are banned at the auth layer, not by an app flag.

#### Build: security implementation

- **RLS tests:** each table has pgTAP tests that `set local role authenticated` and `set local request.jwt.claims` for student A, student B, a teacher, a recruiter (with and without entitlements), a university admin and each staff role, then assert select, insert, update and delete results.
- **Security-definer helpers:** `are_friends`, `is_blocked`, `is_thread_member`, `is_staff(role)`, `is_org_member(org, role)`, `is_university_admin(university, role)`, `has_entitlement(subject, key)`; all stable, all check inputs, none take a user id from the client when `auth.uid()` suffices.
- **Secrets:** Vercel env vars (server-only) for gateway, GitHub App and Resend keys; Supabase Vault for the CV signing key and GitHub user tokens; `.env.example` lists names only.
- **Headers:** as specified in the Security section (nonce-based CSP allowing self, Supabase, PostHog, Sentry, Turnstile and the gateways; HSTS preload; `frame-ancestors 'none'`). Fonts are self-hosted through `next/font`, so no font CDN is allowed.
- **Rate limits:** `rate_limit(key, limit, window)` SQL function over `rate_limit_events` used by posts, requests, reports, verify lookups and API tokens.
- **Audit:** `ops_audit_log` (5.26) for every staff, billing and moderation action; `security_events` for sign-in and account events.
- **Pre-launch:** the free testing route in the Security section (ASVS L1 checklist, ZAP scan, per-PR security review, RLS suite); no paid penetration test at launch.
