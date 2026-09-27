## 4a. Business model and monetisation

Organisations pay for access and tools; students pay only for convenience and polish. Every plan below is live at launch. Other streams (pay-per-competition, ambassador assessments, mentorship, advertising) are deliberately post-launch and kept in a separate document. **All prices are placeholders to validate** through 10–15 recruiter and student interviews before launch.

**Hard rules (decided 2026-09-25)**

1. Money never buys rank or visibility: no paid boosts in search, leaderboards or recruiter results.
2. Proof stays free forever: verification, levels, ranking, tiers and discoverability.
3. Every paid student feature can be sponsored by a university licence, so ability to pay never decides who has a CV.
4. No ads at launch; no student data sold, ever.

#### Student plans

| Feature | Free | Student Pro |
| --- | --- | --- |
| Verified skills, ranking, tiers, leaderboards, recruiter discoverability | Yes | Yes (never boosted) |
| Live web CV | Refreshes on the 1st of each month | Refresh anytime |
| Share CV link | From Spark tier | From Spark tier |
| ATS-format PDF export | No | Unlimited |
| CV layouts | 1 standard | 4–5, all ATS-safe |
| CV insights (what would strengthen it) | No | Yes |
| Who viewed my CV | Counts only | Company names and dates |
| **Price (placeholder)** | Free | PKR 399/month or PKR 3,499/year; 7-day free trial; free via a Growth or Campus university licence |

Student Pro also shows **who at the student's university viewed their record** and when (for students at Growth or Campus universities).

#### Recruiter plans

| Feature | Explore (free) | Starter | Growth | Enterprise |
| --- | --- | --- | --- | --- |
| Browse talent by tier, skill, university | Yes, names hidden | Yes | Yes | Yes |
| Full profile, CV and evidence | No | Yes | Yes | Yes |
| Contact requests per month | 0 | 25 | 100 | Custom |
| Seats | 1 | 1 | 5 | Custom |
| Shortlists and private notes | No | Yes | Yes | Yes |
| Job and internship posts | 1 unsponsored | 3 | 10 | Unlimited |
| Skill competitions | No | No | 1 per quarter | Custom |
| API and ATS export (JSON) | No | No | Yes | Yes |
| Hiring fee | Applies | Applies | Waived | Waived |
| SSO, annual invoicing, dedicated account manager, 99.9% uptime SLA | No | No | No | Yes |
| **Price (placeholder)** | Free | PKR 15,000/month | PKR 45,000/month | Custom contract |

- **Add-ons (all plans):** sponsored job post PKR 5,000 for 14 days, labelled "Sponsored" and never ranked above organic results in talent search; extra contact credits PKR 300 each.
- **Hiring fee:** flat per recorded hire, PKR 10,000 intern / PKR 30,000 full-time, invoiced when the recruiter marks a candidate hired; waived on Growth and Enterprise. Recorded hires also feed Luminary's recruiter-hire signal.

#### University licence

| Feature | Every university (free) | Basic | Growth | Campus |
| --- | --- | --- | --- | --- |
| Ecosphere: university feed, announcements, rankings, teachers, exam periods | Yes | Yes | Yes | Yes |
| Analytics dashboard (groups of 5+ only) | No | Summary | Full + CSV/PDF exports | Full + accreditation reports |
| Student Pro sponsored | No | No | Final-year students | All students |
| Digital job fairs | No | No | 1 per year | 2 per year |
| University admin seats | 1 | 2 | 5 | 10 |
| **Price (placeholder)** | Free | PKR 300,000/year | PKR 900,000/year | PKR 2,000,000/year |

Growth and Campus also include **individual student records** for the university's own students (no opt-out, covered by the signup user agreement; access logged, and visible to the student on Student Pro) and **university hackathons** on the competition engine (Growth 2/year, Campus 4/year). Every university, licensed or not, gets a fully customisable ecosphere (section 5.23). Licences are invoiced annually and paid by bank transfer or pay link.

#### Billing requirements

- `plans`, `subscriptions`, `entitlements`, `invoices`, `add_on_orders`, `hire_fees`; every paid feature checks entitlements server-side, never on the client.
- **Gateways:** a local PKR gateway (Safepay or PayFast: cards, JazzCash, Easypaisa) and a merchant-of-record for USD (Paddle or similar, if it accepts a Pakistani seller: confirm before build). Stripe does not serve Pakistan-registered businesses.
- Webhook-driven subscription state; annual plans billed upfront; downgrades apply at renewal; organisation invoices with provincial sales tax on services (rates confirmed with an accountant).
- Organisation accounts for companies and universities with admin, member and billing roles.
- Student consent: recruiter visibility is opt-in per student and revocable.
- Admin revenue view: MRR, active subscriptions by plan, add-on revenue, hire fees, churn.
