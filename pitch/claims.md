# Pitch claims ledger

Rule: nothing is rendered unless its status is `verified`. Re-derive counts with `node pitch/scripts/facts.mjs` before the final render.

Status: `verified` (source checked) · `needs-confirm` (Ahmed must confirm) · `unverified` (source not opened) · `dropped`.

## Product (source: this repo, 2026-09-30)

| Claim | Value | Source | Status |
| --- | --- | --- | --- |
| Build phases complete | 6 of 14 (phases 0–5) | `docs/build-plan.md` status notes | verified |
| Database migrations | 32 | `supabase/migrations/` | verified (file count) |
| pgTAP test files | 39 | `supabase/tests/` | verified (file count) |
| Every public table has row-level security | enforced by a test that fails otherwise | `supabase/tests/00_rls_everywhere` | verified |
| No AI/LLM in the product | rule | `CLAUDE.md` "Never" | verified |
| Money never buys rank or visibility | rule | `docs/prd/04a` hard rules | verified |
| Signed CV shows "Altered" if one byte changes; "Revoked" if revoked | tested | `docs/build-plan.md` phase 5 done-when, E2E `cv.spec.ts` | verified |
| Universities preloaded from the HEC list | 283 (Punjab 104, Sindh 83, KP 47, ICT 27, Balochistan 12, AJK 8; 2 other). Email domain on file for 278, but 273 of those are marked unconfirmed, so never claim "all domains verified" | `supabase/seed/hec_universities.csv` (row count), decisions 2026-09-27 | verified (count) |
| Closed beta planned at NUTECH; public launch opens every HEC university at once | plan, not done | `docs/decisions.md` 2026-09-25 | verified (planned) |
| Recruiter, teacher, university portals | NOT built; say "launching" | `docs/build-plan.md` phases 6–9 | verified (unbuilt) |
| 90-day hire outcome check | designed, not built | `docs/prd/05-20` | verified (designed) |

## Waitlist (source: uploaded CSV `waitlist_emails_rows.csv`)

| Claim | Value | Status |
| --- | --- | --- |
| Signups | 182 unique | verified (Ahmed confirmed 182) |
| Source | all `landing_page` | verified |
| Dates | 25 Jun – 17 Aug 2026; 158 on 27 Jun | verified |
| University-style email | 63 of 182 (35%), 58 at one university (nutech.edu.pk) | verified |
| Organic, no paid acquisition | founder-stated (Ahmed, 2026-09-30) | verified by founder |
| Multi-university reach, growth trend | not supported | dropped |

## Discovery (ILO SIYB) and what changed

| Claim | Evidence | Status |
| --- | --- | --- |
| We took the platform through ILO's SIYB programme and changed it from what we learned | founder-stated (Ahmed, 2026-09-30) | founder-stated and ILO named by Ahmed himself |
| Skills are proven by understanding, not by detecting AI: a teacher grades the student on their own code, no AI generates questions or grades, "AI-assisted authorship is irrelevant" | PRD 5.5 "Code check"; decisions; `supabase/functions/code-check` | verified |
| "We remove and punish AI usage in projects" | CONTRADICTS the spec: PRD 5.5 lists "AI-generated-code detection" under *Deliberately excluded*, and anti-gaming flags "hold evidence for review, never penalise". Only upheld reports carry penalties (PRD 5.13). | dropped; say the verified line above instead |
| Skill confidence is balanced by evidence levels L1–L4 | PRD 5.5, migrations `*_skill_levels.sql` | verified |
| Skill verification design drew on 30+ research papers | founder-stated; PRD cites a "research blueprint" not in the repo | needs-confirm: Ahmed to supply the list for the Q&A sheet |
| No likes; the micro-survey replaces them | PRD 5.28, `CLAUDE.md` Never list | verified |
| Feed ranking uses survey answers (informative, interesting, credible), not likes | `supabase/migrations/20260929040000_feed_ranking.sql` (`feed_score` reads `post_survey_counts`) | verified |
| Universities will get a dashboard of recruiters' opinions of their students | PRD 5.20 (90-day hire outcome, aggregate only into placement stats) and 5.23 (outcomes for paid licences); NOT built | verified as planned; label "launching" |

## Market (web search only; primary sources blocked by the network policy, so NOT verified)

Search summaries conflict, so none of these may appear on screen yet.

| Claim | Candidate value | Candidate source | Status |
| --- | --- | --- | --- |
| Universities in Pakistan | 262–263 | HEC / Pakistan Economic Survey (search summary) | unverified |
| Graduates per year | about 445,000 | search summary, source unclear | unverified |
| Graduate unemployment | 18.3% (LFS 2024–25) vs 31.2% (early 2026) vs 32.8% ages 20–24: sources disagree | PIDE, Dawn, PBS | unverified, conflicting |
| Employers dissatisfied with graduate skills | 78% (2019 survey), 72% (2025 study) | academic/press, unnamed | unverified |
| Employers unable to find technical skills | 65% | World Bank (via search summary) | unverified |

Blocked hosts: pide.org.pk, dawn.com, finance.gov.pk. Until these (or the PBS/HEC publications) can be read, the market beat uses only what Ahmed supplies or drops the numbers.
