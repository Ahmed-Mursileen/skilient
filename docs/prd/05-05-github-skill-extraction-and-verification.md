### 5.5 GitHub skill extraction and verification

Skills come from verified evidence of the student's own work, never from repo tags or self-claims. Every skill carries an evidence level (L1–L4) that links to the commits, PRs or endorsements behind it. The feature verifies ownership and understanding. It does not try to detect AI-written code: AI-assisted work is legitimate, and stylometry and AI detectors fail against a motivated adversary and cause harmful false positives.

> **AI-assisted commits (decisions 2026-10-03).** Commits a known AI coding agent wrote count as the student's work when they reach the default branch through a merged pull request the student opened, in a repository they shared. They count toward L1/L2. A skill mostly written that way is labelled "AI-assisted" on profiles, evidence lists, recruiter views and the verified CV until a passed code check removes the label. Ranking treats it like any L2.

**Flow:** connect via GitHub App → bind identity → import repos and commits in the background → extract evidence → compute levels → show on profile → stay current via webhooks.

#### Connect and identity binding (P0, must ship before any skill is shown)

- Use a **GitHub App** (not an OAuth App). The student installs it and chooses repos, **private repos included**. The App also covers per-installation rate limits (5,000 requests/hour) and webhooks. It replaces the NextAuth GitHub provider.
- `/api/github/callback` verifies `state` against the signed-in Supabase user, exchanges the code, calls `GET /user`, and stores the numeric **GitHub id** and login. The browser never supplies a GitHub username.
- One GitHub account per Skilient user (unique `github_id`). A clash shows "already linked to another account" and goes to admin.
- Tokens are encrypted at rest (Supabase Vault), used only by workers, and never sent to the client.
- Disconnect revokes the token and deletes repo and commit data; L3 and L4 evidence survives.
- Sync jobs derive `user_id` from the server context; no endpoint accepts a `user_id` or username from the client.

#### Import pipeline

Supabase Queues (`pgmq`) with Edge Function workers woken each minute by pg\_cron, each processing a small batch within the time limit.

| Stage | Work | API cost |
| --- | --- | --- |
| discover | List shared repos: fork flag, parent, template source, languages, default branch | 1–2 requests |
| classify | owned / collaborator / fork / template; forks with no own commits skipped | 0–1 |
| harvest | Commits filtered by author, kept only where `author.id` = the student's GitHub id; latest 500 per repo | \~1 per 100 commits |
| extract | Files and patches per commit → evidence rows | 1 per commit |
| prs | The student's merged PRs and their reviews (for L3) | a few per repo |
| level | Recompute the student's skill levels | database only |

- First sync of \~30 repos × 500 commits is under 2,000 requests: L1 skills appear within a minute, L2 fills in as commits process.
- Webhooks (`push`, `pull_request`, `pull_request_review`, `installation_repositories`) queue incremental work; a nightly job reconciles. Everything is idempotent by commit SHA.
- Private-repo source code is never stored: only SHAs, paths and line counts. Private repo names show as "Private repository" to everyone but the owner.

#### What counts as the student's work

- Attribution by `author.id` only (GitHub sets it only for the account's verified emails), which defeats `git config user.email` spoofing. Signed ("Verified") commits are shown as an attribution-confidence marker.
- Excluded: merge commits, bot authors, commits touching more than 100 files, pure formatting or rename commits, and unverifiable `Co-authored-by` credit. A squash-merged PR counts as one unit for its author.
- Excluded paths: `node_modules/`, `vendor/`, `dist/`, `build/`, `*.min.*`, lockfiles, and anything marked `linguist-generated` or `linguist-vendored`.
- **Meaningful lines** = added or changed non-blank lines in code files, capped at 400 per commit.
- Recency uses push or merge time, never the author date (which can be backdated).

#### Skill taxonomy and detectors

A curated, versioned taxonomy (YAML in the repo, seeded into `skills`), starting at \~150 skills relevant to Pakistani students, owned by Skilient Trust staff (edited in /ops; faculty and students suggest additions through the feedback centre; reviewed quarterly). Each skill has a category (language, framework, library, tool, platform, practice), an optional parent (React → JavaScript/TypeScript) and detectors:

| Detector | Example | Evidence for |
| --- | --- | --- |
| File type | `.ts`/`.tsx` → TypeScript; `Dockerfile` → Docker | Languages |
| Manifest diff | `react` added to `package.json`; `django` in `requirements.txt`; `pubspec.yaml` → Flutter | Frameworks, libraries |
| Import in added lines | `from fastapi import`, `import torch`, `using Microsoft.EntityFrameworkCore` | Frameworks (strongest) |
| Config path | `.github/workflows/*.yml` → GitHub Actions; `*.tf` → Terraform; `supabase/migrations` → Postgres | Tools, platforms |

A framework counts only when the student's own commits import it or add it to a manifest, not because it exists in the repo.

#### Evidence levels

| Level | Rule | Shown as | Ranking points |
| --- | --- | --- | --- |
| L0 Claimed | Manual tag | **Hidden** from everyone except the student (private "skills I'm building") | 0 |
| L1 Present | Detected in a shared repo the student owns or has ≥ 1 authored commit in | "Found in your repos" | 0 |
| L2 Authored | Authored evidence on **≥ 3 distinct days** and **≥ 150 meaningful lines** (languages) or **≥ 3 import/manifest hits** (frameworks, tools); held commits excluded | "You've written this" + last used | 15 |
| L3 Corroborated | ≥ 1 merged PR by the student touching the skill, in a repo they don't own, merged or approved by another human; or a teammate-confirmed Skilient contribution | "Accepted by others" | 20 |
| L4 Demonstrated | Teammate or teacher endorsement tied to a specific evidence item, or a passed code check | "Vouched for" | 25 |

A skill shows its highest level and never downgrades; freshness appears as "last used". Spanning 3+ categories adds the +10% diversity bonus. Distinct-day counting and the per-commit line cap neutralise commit splitting and giant dumps.

#### Code check (path to L4)

The student requests a check for one skill. The system picks a random ≥ 20-line snippet of their own L2 code and shows three fixed question templates about it: what it does, why it is written this way, and how they would change it for a requirement drawn from a curated bank for that skill (maintained by teachers and admins). 10 minutes, code visible. A teacher from the student's university, or a Skilient reviewer if none is available, grades the answers against a rubric within 72 hours. No AI generates questions or grades answers. One attempt per skill per 30 days. It tests understanding, so AI-assisted authorship is irrelevant.

#### Anti-gaming: flags hold evidence for review, never penalise

| Flag | Trigger | Effect |
| --- | --- | --- |
| Bulk import | A repo's first commit adds > 2,000 lines or > 50 files with no prior history | Counts toward L1 only |
| Copied fork/template | Blob hashes match the fork parent or template | Matching files excluded |
| Burst | > 50 commits or > 5,000 lines in one day | Held for review |
| Backdating | Newly pushed commits authored > 30 days before push | Held; recency uses push time |
| History rewrite | Force-push removes counted commits | Their evidence dropped |
| Cross-account duplicate | Same blob hashes credited to two Skilient users | Both held for review |

The student sees "some activity is being reviewed", never an accusation. Trust reviewers resolve flags in `/ops` within 72 hours (5.26); every skill has an appeal path.

#### Screens

- Connect GitHub (onboarding and settings): App install, repo picker, live progress ("14 repos · 212 commits analysed · 9 skills").
- Skill chip with level icon; skill drawer with level, evidence (active days, lines, repos, PR links, last used) and "how to reach the next level".
- Settings → GitHub: exclude a repo, resync, disconnect, see held items.

#### Success measures

| Measure | Target |
| --- | --- |
| L2 precision (admin audit, 50 random skills per month) | ≥ 90% |
| Time to first skills after connect (90% of students) | ≤ 5 min |
| Sync success rate | ≥ 98% |
| Flags cleared as false positives | Watch; loosen the rule if > 50% |

#### Rollout

| Phase | Scope |
| --- | --- |
| P0 | Server-side identity binding, server-only `github-sync`, GitHub token removed from the client; existing GitHub skills re-verified or cleared |
| P1 | GitHub App, pipeline, taxonomy v1, L0–L2, skill drawer, private repos |
| P2 | Webhooks, anti-gaming flags, admin review queue, appeals |
| P3 | L3 from PRs and venture confirmations; L4 from endorsements |
| P4 | Code checks; recruiter "level ≥ L2" filter |

These phases are the internal build order only; every phase ships at the single launch.

Deliberately excluded, with sources in the research blueprint: stylometric authorship models, AI-generated-code detection, MOSS/JPlag thresholds, keystroke telemetry, LLM-as-judge as an automatic gate, and commit-timing signals.

#### Build: GitHub verification

- **Files:** `lib/github/app.ts` (App JWT from `GITHUB_APP_PRIVATE_KEY`, installation tokens via Octokit `@octokit/app`), `app/api/github/callback/route.ts`, `app/api/github/webhook/route.ts` (verify `X-Hub-Signature-256`, store in `github_webhook_events`, enqueue), `lib/github/taxonomy/skills.yaml` + `scripts/seed-skills.ts`, `supabase/functions/github-worker` (stages), `lib/github/detectors/*.ts` (file-type, manifest, import, config detectors as pure functions with unit tests).
- **Queue:** `pgmq` queue `github_jobs`; messages `{stage, user_id, repo_id?, cursor?}`; pg\_cron every minute invokes the worker, which reads up to 20 messages with a 120 s visibility timeout, processes each within 30 s, archives on success, and dead-letters after 5 attempts (`sync_jobs.error` shown to admins).
- **Rate limits:** each job checks `x-ratelimit-remaining`; below 200 it re-enqueues with a delay until `x-ratelimit-reset`.
- **Level computation:** SQL function `recompute_user_skills(user_id)` aggregates `skill_evidence` (status counted) into `user_skills` using the section's thresholds; called at the end of each extract batch and after admin flag resolution.
- **Flags:** detector results write `review_flags`; commits in a flagged set get `status = held` until a trust reviewer resolves them in `/ops`.
- **Code check:** `lib/github/code-check.ts` picks a snippet from an L2 commit (via the contents API at that SHA, never stored), attaches the three question templates plus one change request from `code_check_prompts(skill_id, prompt, author_id)`, and routes answers to a grading queue (`/teach/code-checks` for the student's university teachers; unclaimed after 48 h it moves to Skilient trust reviewers in `/ops`). Results stored in `code_checks` (user\_id, skill\_id, snippet\_ref, prompt\_id, answers, rubric\_scores, grade, grader\_id, graded\_at). No AI API is used.
- **Done when:** detector unit tests (≥ 95% of the taxonomy covered by fixtures), a fixture repo end-to-end run produces the expected levels, spoofed `user.email` commits never count, webhook replay is idempotent.
