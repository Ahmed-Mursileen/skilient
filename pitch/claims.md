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
| Recruiter, teacher, university portals | NOT built; say "launching" | `docs/build-plan.md` phases 6–9 | verified (unbuilt) |
| 90-day hire outcome check | designed, not built | `docs/prd/05-20` | verified (designed) |

## Waitlist (source: uploaded CSV `waitlist_emails_rows.csv`)

| Claim | Value | Status |
| --- | --- | --- |
| Signups | 182 unique (Ahmed said 179) | needs-confirm: which number to say |
| Source | all `landing_page` | verified |
| Dates | 25 Jun – 17 Aug 2026; 158 on 27 Jun | verified |
| University-style email | 63 of 182 (35%), 58 at one university (nutech.edu.pk) | verified |
| Paid vs organic | unknown | needs-confirm |
| Multi-university reach, growth trend | not supported | dropped |

## Discovery

| Claim | Status |
| --- | --- |
| Took the platform through ILO's SIYB programme and changed it from what we learned | needs-confirm: Ahmed to list 2–3 concrete changes and OK naming ILO |

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
