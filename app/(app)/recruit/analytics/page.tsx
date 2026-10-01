import { ChartBar } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { getAnalytics, getMyOrg } from "@/lib/data/recruit";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Analytics" };

const DAYS = [30, 90, 180] as const;

/** /recruit/analytics (PRD 5.20, Starter and above): your own funnel, your own times, what you search for. */
export default async function AnalyticsPage({ searchParams }: PageProps<"/recruit/analytics">) {
  const org = await getMyOrg();
  if (org?.status !== "verified") {
    return <EmptyState title="Analytics open when you're verified" description="Once a Skilient reviewer verifies your organisation you can see your funnel here on a plan with analytics." />;
  }
  const sp = await searchParams;
  const days = DAYS.find((d) => String(d) === sp.days) ?? 90;
  const a = await getAnalytics(days);
  if (a.locked || !a.funnel) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="font-display text-h1">Analytics</h1>
        <EmptyState icon={<ChartBar aria-hidden className="size-8" />} title="Analytics aren't part of your plan yet" description="Starter plans and above show your funnel from views to hires, your own response and hiring times, and the skills you search for most." />
      </main>
    );
  }
  const f = a.funnel;
  const steps = [
    { label: "Profile views", value: f.views },
    { label: "Contact requests", value: f.contacts },
    { label: "Accepted", value: f.accepted },
    { label: "Applied", value: f.applied },
    { label: "Hired", value: f.hired },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-h1">Analytics</h1>
        <nav aria-label="Period" className="flex gap-1">
          {DAYS.map((d) => (
            <Link key={d} href={`/recruit/analytics?days=${d}` as Route} aria-current={d === days ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3 text-body-sm font-semibold", d === days ? "border-primary bg-primary-subtle" : "border-border-default text-text-secondary")}>
              {d} days
            </Link>
          ))}
        </nav>
      </div>
      <section aria-labelledby="funnel-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5">
        <h2 id="funnel-h" className="text-h3">Funnel</h2>
        <ol className="flex flex-col gap-2" data-testid="funnel">
          {steps.map((s) => (
            <li key={s.label} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3">
              <span className="text-body-sm">{s.label}</span>
              <span className="h-3 rounded-full bg-bg-muted" role="img" aria-label={`${s.value} of ${max}`}>
                <span className="block h-3 rounded-full bg-primary" style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 3 : 0)}%` }} />
              </span>
              <span className="text-right font-mono text-code-sm">{s.value}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="times-h" className="grid gap-3 sm:grid-cols-2">
        <h2 id="times-h" className="sr-only">Your response and hiring times</h2>
        <div className="rounded-lg border border-border-default bg-bg-surface p-4">
          <p className="text-caption text-text-secondary">Median time to first response on an application</p>
          <p className="mt-1 font-display text-h2">{a.median_first_response_hours === null || a.median_first_response_hours === undefined ? "No data yet" : `${a.median_first_response_hours} hours`}</p>
        </div>
        <div className="rounded-lg border border-border-default bg-bg-surface p-4">
          <p className="text-caption text-text-secondary">Median days from application to hire</p>
          <p className="mt-1 font-display text-h2">{a.median_days_to_hire === null || a.median_days_to_hire === undefined ? "No data yet" : `${a.median_days_to_hire} days`}</p>
        </div>
      </section>
      <section aria-labelledby="demand-h" className="flex flex-col gap-2">
        <h2 id="demand-h" className="text-h3">Skills you search for</h2>
        {a.skills_demand && a.skills_demand.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {a.skills_demand.map((s) => (
              <li key={s.skill} className="rounded-sm border border-border-default bg-bg-surface px-2 py-1 text-body-sm">{s.skill} <span className="font-mono text-code-sm text-text-secondary">{s.searches}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-text-secondary">Search by skill in Talent and your most-searched skills appear here.</p>
        )}
      </section>
    </main>
  );
}
