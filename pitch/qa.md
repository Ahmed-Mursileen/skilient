# Judge Q&A (evidence for every answer; see claims.md)

**Is graduate unemployment rising?** No, and we do not claim it. PBS shows the degree-holder unemployment rate fell from 16.3% (2020-21) to 10.8% (2024-25) on the older 13th ICLS definition. Our point: degree holders are unemployed at more than twice the rate of people with no education (10.9% vs 4.7%, LFS 2024-25, Table 9.7), and a CGPA shows none of the work behind a degree.

**Where do the market numbers come from?** PBS Labour Force Survey 2024-25 Annual Report (Table 9.7, p.110); Pakistan Economic Survey 2025-26, Ch. 10 (Table 10.2, p.172: 1.96 million university students, 2023-24). "2.3×" is our own division of two published rates (10.9 / 4.7). Dropped as unsourced: 18.3%, 31.2%, 32.8% graduate unemployment, the 2019 "78% of employers dissatisfied" survey (secondary, login-gated).

**Do employers really screen by CGPA?** No study shows it, and the film does not claim it. What we can point to: some employers publish a CGPA minimum (MCB Bank Pakistan's trainee programme lists 3.00; Ahmed to open https://www.mcb.com.pk/careers/entry-level-programs and confirm before saying it), and in a 2019 employer survey (Naqeebz, secondary source) 60% said new recruits' skills do not reflect their grades and 82% said they do not hire on high grades alone. Both support the same point: a CGPA is a weak signal of capability. Beat 2 is an illustration, not a statistic.

**How do you stop students using AI?** We don't try to detect it. A code check asks three fixed questions about the student's own code (what it does, why it is written that way, how they would change it); a person grades against a rubric; no AI generates questions or grades. AI-assisted authorship is irrelevant because understanding is what is tested. One attempt per skill every 30 days.

**How do you verify skills?** Evidence levels L1 to L4 from verified project work, teammate-confirmed contributions, endorsements and code checks. Upheld reports, not flags, carry penalties.

**Why would universities care?** They cannot see capability beyond CGPA. Analytics by department (groups of 5 or more only), recruiter feedback on outcomes (aggregate only) and accreditation evidence are designed but not built: say "launching".

**What is live and what is not?** Built and tested: phases 0 to 5 of 14 (identity, projects, social, ranking and leaderboard, signed CV). Not built: student, teacher, recruiter and university portals, billing, ops, marketing site.

**How do you make money?** Organisations pay for access and tools; student proof is free; no ads; no student data sold; money never buys rank or visibility. We do not quote prices (they are placeholders until validated).

**Security and privacy?** Every table is locked by default and a test fails if one is not; recruiter visibility is opt-in and revocable; no service-role key in client code.

**Traction?** 182 people joined the waitlist from our landing page with no paid ads; 1 in 3 used a university email. We took the platform through ILO's SIYB programme and changed it from what we learned.

**Research basis?** 30+ papers: Ahmed's list has 43 entries across commit and collaboration behaviour, GitHub in education, contribution scoring, skill extraction, authorship attribution and AI-code detection (`research-papers.md`). Note the detection papers are why we do not rely on detection: they report detectors failing (arXiv 2505.20158, 2505.08244) and stylometry being spoofable (arXiv 1905.12386), so the product tests understanding instead.

**What is the sample CV?** The product's own CV document with a made-up student (Ayesha Khan). The fingerprints on screen are the real SHA-256 of a real PDF of it and of the same file with one byte flipped.
