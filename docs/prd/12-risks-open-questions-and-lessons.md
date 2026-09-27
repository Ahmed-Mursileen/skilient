## 12. Risks, open questions and lessons

The biggest product risk is overclaiming: the landing page sells verified CVs and recruiter search unless the whole trust pipeline is complete at launch. The biggest technical risk is the chat authorisation hole.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Chat RLS allows any user into any thread | Private messages exposed | Security-definer RPCs before any public launch (section 8) |
| GitHub identity can be spoofed and `github-sync` calls GitHub unauthenticated | Syncs fail once more than a handful of students connect | GitHub App with server-side identity binding (section 5.5, P0) |
| Ranking inputs (contributions, endorsements, credentials) don't exist yet | Scores are meaningless if shown | Launch only when contributions and endorsements are live and the beta has produced evidence; show "not ranked yet" otherwise |
| Skill levels over-claim what the evidence shows | Weaker than the trust claim | Every level links to its evidence; monthly L2 precision audit ≥ 90%; appeals |
| Micro-survey answers are sparse or gamed | Feed ranking and Content quality become noisy | Permanent strip on every surveyable post, one assigned question per reader, target shares per dimension, latency and friend weighting (5.28) |
| Invite-post joins keyed to owner, not post | A second invite from the same owner shows the wrong state | Store `post_id` on `application_threads` |
| Solo developer | Bus factor of one | Keep migrations, docs and the `.claude/wiki/` log in the repo |

**Former open questions (all decided 2026-09-25)**

- [ ] Ranking formula: **decided 2026-09-25**. Formula v1 in section 5.13 (Work 45, Skills 20, Endorsements 15, Credentials 5, Momentum 15; creator 1.3×; decay after 14 days with exam pauses).
- [ ] Ecosphere: **decided 2026-09-25**, customised per university within global invariants (section 5.23).
- [ ] Recruiter verification: decided 2026-09-25, manual review before contact requests or job posts (5.26).
- [ ] Teacher accounts: decided 2026-09-25, faculty request the role and a university admin (or Skilient) approves (5.21).
- [ ] Chat moderation: decided 2026-09-25, staff see only the messages a reporter attaches (up to 10 before the reported one), never whole threads (5.26).
- [ ] Skill taxonomy: decided 2026-09-25, owned by Trust staff in /ops, with faculty and student suggestions via the feedback centre and a quarterly review.
- [ ] Urdu support: decided 2026-09-25, English only at launch; Urdu is post-launch.

**Lessons carried over from the reference build**

1. Never commit seed data as a migration or mix fake UUIDs with real signups.
2. No hardcoded user identity anywhere; `useCurrentUser()` exists before any page needs it.
3. service\_role only in Edge Functions, jobs and the billing worker.
4. Use `@supabase/ssr` everywhere; `getUser()` for anything security-relevant.
5. Configure Resend SMTP before the first real signup test.
6. Check every write with `{ count: "exact" }`; an RLS-blocked write returns no error.
7. Test RLS under a real authenticated role, including write policies and recursion.
8. Create users through the GoTrue admin API, never raw SQL into `auth.users`.
9. One canonical module per concern.
10. Test failure modes, especially sign-out then sign-in as another account.

Sources: `social-layer` branch at `fa7d78d` (code is ground truth), `docs/techshiner-prd.md` v3.0, `docs/techshiner-*.md`, `.claude/company-context.md`, `.claude/wiki/`.
