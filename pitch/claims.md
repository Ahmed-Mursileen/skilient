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

## On-screen demo data (beat 4b)

| Item | Fact | Source | Status |
| --- | --- | --- | --- |
| CV document | The product's own renderer (`cvDocumentHtml`, template "standard") with the made-up sample student "Ayesha Khan" (`lib/cv/sample.ts`). Label "sample" whenever shown | `pitch/scripts/cv-html.gen.ts`, `capture-cv.mjs` | verified, sample data |
| File size, byte values, both SHA-256 values | computed from a real PDF of that sample CV; flipping byte 7 (0x34 to 0x35) gives a different hash | `pitch/assets/cv-facts.js` (generated) | verified (computed) |
| Verify wording for Altered / Valid / Revoked | copied from `lib/cv/status.ts` | repo | verified |
| Altered when a file does not match an issued export; Revoked when the student revokes | tested | PRD 5.18, pgTAP 38, E2E `cv.spec.ts` | verified |
| The sample PDF itself was not issued through the product, so the film says "Sample file" | illustration | n/a | by design |

## Why it holds (beat 5), all built

| On-screen statement | Source | Status |
| --- | --- | --- |
| Code check asks three fixed questions (what it does, why written this way, how you would change it); graded by a person against a rubric; no AI generates questions or grades; one attempt per skill per 30 days. Do not say "teacher" until the teacher portal ships: today a Skilient reviewer grades | PRD 5.5 "Code check"; `supabase/functions/code-check` | verified |
| No likes; micro-survey ("Did you learn something from this?" tick/cross) replaces them | PRD 5.28; `CLAUDE.md` Never list | verified |
| Posts ranked by survey answers, not likes | `20260929040000_feed_ranking.sql` | verified |
| "12 / 13 people find this informative" | PRD 5.28's own example line; shown as "Sample post" | illustration, labelled |
| Boards show rank and tier (never points); tiers Raw, Spark, Flare, Shine, Radiant, Luminary | PRD 5.17; `20261005000000_ranking.sql` enum `ranking_tier` | verified |
| Money never buys rank or visibility | PRD 4a hard rules; `CLAUDE.md` | verified |
| Row-level security on every table; a test fails if one is missing | pgTAP `00_rls_everywhere` | verified |
| 24 lock tiles | illustrative grid, not a table count | illustration |

## Traction and progress (beat 7)

| On-screen statement | Source | Status |
| --- | --- | --- |
| 182 joined our waitlist, from our landing page, no paid ads | CSV (182 unique, source `landing_page`); "no paid ads" founder-stated | verified / founder-stated |
| 1 in 3 used a university email | 63 of 182 = 34.6% | verified (computed) |
| We took it through ILO's SIYB programme | founder-stated | founder-stated |
| Change: skills proven by understanding, not claims | PRD 5.5 code check; evidence levels | verified in product |
| Change: verification designed from 30+ research papers | founder-stated; list not in repo | founder-stated, needs list for Q&A |
| Change: no likes, one-tap survey ranks posts on quality | PRD 5.28; feed_score | verified in product |
| Change: recruiter feedback dashboard for universities | PRD 5.20, 5.23; not built | planned, labelled LAUNCHING |
| 6 of 14 build phases complete (0-5); identity, projects, social, ranking, signed CV | `docs/build-plan.md` status notes | verified |
| Next: student, teacher, recruiter and university portals | phases 6-9 | verified (roadmap) |

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
| Skill verification design drew on 30+ research papers | Ahmed supplied the list (`pitch/research-papers.md`): 43 entries in 8 groups, of which 40 have direct paper links (1 is a Wikipedia page, 2 are tools cited through another paper). Supports "30+". Sources not opened here (network block) | founder-supplied list, count verified |
| No likes; the micro-survey replaces them | PRD 5.28, `CLAUDE.md` Never list | verified |
| Feed ranking uses survey answers (informative, interesting, credible), not likes | `supabase/migrations/20260929040000_feed_ranking.sql` (`feed_score` reads `post_survey_counts`) | verified |
| Universities will get a dashboard of recruiters' opinions of their students | PRD 5.20 (90-day hire outcome, aggregate only into placement stats) and 5.23 (outcomes for paid licences); NOT built | verified as planned; label "launching" |

## Market (Ahmed's research, primary PDFs read in a separate session; not re-opened here because pbs.gov.pk and finance.gov.pk are behind this environment's network block)

Status `founder-verified` = figure and table reference supplied by Ahmed from the primary document; still cite publisher, table and year on screen.

| Claim (as it may appear) | Value | Source, table, period | Status |
| --- | --- | --- | --- |
| Unemployment rate, people whose highest level is a degree | 10.9% (male 7.0%, female 24.1%) | PBS, Labour Force Survey 2024-25 Annual Report, Table 9.7, p.110 (19th ICLS) | founder-verified |
| Unemployment rate, no education | 4.7% (same table). Derived on screen: "2.3×" = 10.9 / 4.7 = 2.32, computed from the two published rates | same | founder-verified (2.3× is derived, say so if asked) |
| Unemployment rate, master's and above | 11.7% | same | founder-verified |
| University students | 1.96 million, 2023-24 (table shows 1,964.2 thousand, 2024-25 marked estimated) | Pakistan Economic Survey 2025-26, Ch. 10, Table 10.2 p.172, text p.171 | founder-verified |
| Universities | 278 (163 public, 115 private) | same Survey §10.5 p.182. Table 10.2 of the same Survey says 239, unreconciled, so show 278 with source or drop it | founder-verified, conflict noted |
| Graduates in one year | 472,824 (2020-21) | HEC HEDR Annual Report 2022-23, p.19 | Q&A only: pre-2022, never on screen without the year |

Rules for the film:
- Never say "graduate unemployment is rising": PBS shows the degree-holder rate fell from 16.3% (2020-21) to 10.8% (2024-25) on the 13th ICLS.
- A rate is the unemployed share of the labour force. Do not confuse it with 14.8%, the share of all unemployed people who hold a degree.
- No primary source shows Pakistani employers screen by CGPA or university name. The film frames this as what a CGPA cannot show or verify, not as a statistic. Beat 2 is an illustration.

Dropped (do not use):

| Figure | Why |
| --- | --- |
| 18.3%, 31.2%, 32.8% graduate unemployment | not in any primary source; 18.3 and 31.2 appear in LFS only as unrelated cells |
| 20-24 graduate unemployment | PBS publishes no 20-24 band (only 15-24: 12.8%) |
| Naqeebz 78% employers dissatisfied | 2019, login-gated report, secondary source only |
| World Bank 1.6% "inadequately educated workforce" | single-biggest-obstacle question, not a skills-gap rate |
| 72% (2025 study), 65% (World Bank via search) | unsourced search summaries |
| Universities 262-263, graduates about 445,000 | search summaries, superseded |


## CGPA screening: what a published-source search found (2026-09-30)

Network policy blocked every primary page, so these come from search snippets only and none is verified by opening the page.

| Finding | Source | Status |
| --- | --- | --- |
| MCB Bank Pakistan publishes a minimum CGPA of 3.00 (or equivalent) and 16 years of education from an HEC-recognised university for its Trainee Business Officer programme | MCB Bank careers page, https://www.mcb.com.pk/careers/entry-level-programs (company's own page) | candidate primary source; Ahmed to open and confirm before use |
| Naqeebz 2019 employer survey: 82% say they do not hire fresh graduates merely on high grades; 60% say new recruits' knowledge and skills do not reflect the grades they obtained; high grades and volunteer work cited as valued by only 18% | Naqeebz Consulting, reported by Daily Parliament Times (2019-05-06) and Consultancy.asia; original report login-gated | secondary, 2019 (pre-2022). Cuts against "employers screen on CGPA alone" and supports "grades do not reflect capability" |
| Nestlé Pakistan management trainee eligibility "CGPA 2.5 and above" | a 2021 notice hosted by Karakoram International University | secondary, 2021; not opened |
| Unilever Pakistan "3.0 CGPA silent cutoff"; Engro "CGPA 2.5" | job-board blogs | weak, do not use |
| Employers screening by university name | blogs (Medium, LinkedIn, Quora) and a newspaper opinion piece | not research; do not use |

Conclusion: no study shows Pakistani employers shortlist by CGPA. The defensible wording is narrower: some employers publish CGPA minimums (MCB Bank, once confirmed) and employers themselves say grades do not reflect capability (Naqeebz 2019, secondary). The film makes neither claim; beat 2 is labelled as an illustration.
