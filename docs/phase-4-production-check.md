# Phase 4: production end-to-end check

One pass on production (skilient's live Supabase project and Vercel), with real accounts, to
confirm trust and ranking work end to end: endorsements → L3/L4 → the nightly score → tier →
leaderboard → /me/score, plus credential upload and staff review. About 45 minutes.

## Before you start

- **Your staff roles**: two-factor on, then the `trust_reviewer` and `accounts` grant from
  `docs/setup-checklist.md` (Phase 4). Sign out and back in with your code; `/ops` should show
  **Evidence** and **Exam periods**.
- **Three student accounts** at the same university: **A** and **B** (teammates), **C** (a
  teammate of A on a second venture). Each has finished onboarding. A has GitHub connected with
  some commits (for the L2 code check, optional).
- **The nightly jobs exist**: in the SQL editor,
  `select jobname, schedule from cron.job where jobname like 'ranking%';` shows
  `ranking-nightly | 7 22 * * *` (03:07 PKT) and `ranking-step | * * * * *`.

## 1. Endorsements, L3 and L4

1. A creates venture **V1** with skills including React; B joins (apply → accept). A moves it to
   In progress.
2. A logs a contribution in V1 tagged **React**; B confirms it. On A's profile, React's drawer
   lists the confirmed entry as an **L3** proof.
3. B logs an entry; A confirms it (so V1 has 2 verified members).
4. B opens V1 → Team → **Endorse**, picks A, React, ties it to A's React entry, adds a note.
   A gets a "Trust and ranking" notification; A's profile Overview shows the endorsement.
5. A creates venture **V2**, C joins, V2 in progress; A logs a React entry in V2, C confirms it,
   and C endorses A for React tied to that entry.
6. Expected: React shows the **peer-verified** check and **L4** (two evidence-tied endorsements
   from different teammates across ventures). A can hide an endorsement and show it again.
7. Refusals worth one try: B endorsing A for a 6th skill on V1, or endorsing someone outside the
   venture, is refused.

## 2. Credentials and staff review

1. A goes to Settings → **Credentials**, adds a certificate PDF (≤ 5 MB) and a phone photo of
   another. Both show "Waiting for review".
2. You (two-factor) open `/ops` → **Evidence**: the storage line shows use against 1 GB. Claim
   the PDF, approve it with a recognised issuer (e.g. AWS) and a reason; claim the photo and
   reject it with a reason.
3. A sees Approved (with "counts 1.5×") and the rejection reason; B sees only the approved one on
   A's profile. B can't open A's files.
4. Optional, code check: from A's skill drawer on a skill at L2 from A's own commits, **Request a
   code check**, start it, answer within 10 minutes; you grade it in Evidence → Code checks
   (3 of 4 parts met passes) and the skill becomes L4.

## 3. Complete a venture

1. A adds a deliverable link to V1 and marks it **Completed**. A Shipped post appears; A and B
   get "Endorse your teammates".

## 4. The nightly score

Wait for the 03:07 PKT run, or run one now in the SQL editor (it covers today's date; the next
night's run still happens):

```sql
select private.ranking_run_all();
select run_on, stage, students, held, error from public.ranking_runs order by id desc limit 1;
select status, rows, error from public.job_runs where job = 'ranking-nightly' order by started_at desc limit 1;
```

Expected: stage `done`, `students` = everyone onboarded, no error, job run `succeeded`.

- A student's **first** score is never held. If A's score jumps by more than 150 on a later run
  (for example, completing two more ventures), it's held: `/ops` → Evidence → **Ranking flags**
  shows a Fast gain; clear it and the gain counts from the next run.
- Teammates who only endorsed each other on ventures with no deliverable and no GitHub work
  appear as an **Endorsement ring**; clearing it restores their weight on the next run.

## 5. Tier, leaderboard and score

1. **Tier**: A's profile header, A's posts and A's row in Explore → People show A's tier badge
   (Raw at least, once A has a confirmed contribution).
2. **Leaderboard** (header → Leaderboard): A and B appear on the university board with rank,
   tier and weekly change, never points; A's own place is pinned with A's points. Try the
   department and batch filters and the Global tab.
3. **/me/score** (from the pinned place): every component with its evidence (V1 with role,
   complexity and share; React L4; B and C's endorsements; the AWS credential; active weeks),
   and "What <next tier> needs".
4. **Opt-out**: A goes to Settings → **Privacy** and turns off "Show me on leaderboards". A
   disappears from every board (B checks); A's tier still shows on A's profile. Turn it back on.

## 6. Exam periods and penalties

1. `/ops` → **Exam periods**: add NUTECH's real exam dates with the source as the reason (at most
   45 days each; overlaps are refused). Students' Momentum doesn't decay on those days, and
   `/me/score` shows the pause while one is on.
2. Optional: resolve a test report as Remove or Warn: a severity is required, and the owner's
   score shows the penalty after the next run.

## Done

Tick Phase 4 in `docs/build-plan.md` ("production end-to-end check done") and tell Claude of
anything that didn't match; it goes in `docs/decisions.md`.
