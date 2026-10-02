import type { Metadata } from "next";
import { getOrgPlan } from "@/lib/data/recruit";

export const metadata: Metadata = { title: "Plan and credits" };

const FEATURES: { key: string; label: string }[] = [
  { key: "talent.full_profile", label: "Full talent search (names and profiles)" },
  { key: "saved_searches", label: "Saved searches with email alerts" },
  { key: "analytics", label: "Recruiter analytics" },
  { key: "competitions.create", label: "Skill competitions" },
  { key: "api.access", label: "API, webhooks and ATS export" },
];

/** /org/plan (PRD 5.20, 5.24): what this organisation may use. Plans, add-ons and invoices are at /org/billing. */
export default async function PlanPage() {
  const plan = await getOrgPlan();
  const left = plan.contact_credits_limit === null ? null : Math.max(plan.contact_credits_limit - plan.contact_credits_used, 0);
  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-h1">Plan and credits</h1>
      <section aria-labelledby="use-h" className="grid gap-3 sm:grid-cols-3">
        <h2 id="use-h" className="sr-only">Usage this month</h2>
        <Stat label="Contact credits left this month" value={left === null ? "Not included" : `${left} of ${plan.contact_credits_limit}`} testId="credits-left" />
        <Stat label="Seats used" value={plan.seats_limit === null ? String(plan.seats_used) : `${plan.seats_used} of ${plan.seats_limit}`} />
        <Stat label="Live job slots" value={plan.active_posts_limit === null ? "Not included" : String(plan.active_posts_limit)} />
      </section>
      <section aria-labelledby="feat-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5">
        <h2 id="feat-h" className="text-h3">What your plan includes</h2>
        <ul className="flex flex-col gap-2">
          {FEATURES.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-3 border-b border-border-muted pb-2 last:border-0">
              <span>{f.label}</span>
              <span className="text-body-sm font-semibold" data-testid={`feature-${f.key}`}>{plan.entitlements[f.key] ? "Included" : "Not included"}</span>
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-text-secondary">
          A contact credit is spent when you send a request and is not refunded if the student declines. Credits never reveal anonymised candidates: a student reveals themselves by accepting. Plans, extra credits, invoices and hiring fees are under Billing; for Enterprise (single sign-on, annual invoicing), write to the Skilient team.
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface p-4">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-1 font-display text-h2" data-testid={testId}>{value}</p>
    </div>
  );
}
