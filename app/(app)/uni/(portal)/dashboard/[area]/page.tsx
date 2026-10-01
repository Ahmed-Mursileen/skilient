import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList } from "@/components/uni/bar-list";
import { Card, DataTable, Locked, PageTitle, Section } from "@/components/uni/page-parts";
import { isRefusal } from "@/lib/data/rpc-json";
import { getDashboard, type Dashboard } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";
import { cn } from "@/lib/cn";
import { DASHBOARD_AREAS, countLabel, type DashboardArea } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Dashboard" };

const NUMBER_LABELS: Record<string, string> = {
  students: "Students", active_30d: "Active in 30 days", active_share: "Active share (%)", ventures: "Ventures with your students",
  contributions_30d: "Contributions in 30 days", cross_university: "Cross-university ventures", growth_30d: "New L2+ skills in 30 days",
  contacts: "Recruiter contact requests", contacts_accepted: "Contacts accepted", applications: "Applications", hires: "Hires", hires_90d: "Hires in 90 days",
  universities: "Universities in the average", l2_share: "Students with an L2+ skill (%)",
};
const LIST_LABELS: Record<string, string> = {
  by_department: "By department", by_batch: "By batch", weekly: "Contributions per week", by_level: "Students by highest level",
  top: "Top skills (students at L2+)", by_tier: "Students by tier",
};
const PLAN_FOR: Record<string, string> = { skills_gap: "Growth or Campus", outcomes: "Growth or Campus", faculty: "Growth or Campus", benchmark: "Campus" };

/** /uni/dashboard/[area] (PRD 5.23): nightly aggregates; every group under 5 is hidden in SQL. */
export default async function DashboardPage({ params }: PageProps<"/uni/dashboard/[area]">) {
  const { area } = await params;
  if (!DASHBOARD_AREAS.some((a) => a.key === area)) notFound();
  let d: Dashboard;
  try {
    d = await getDashboard(area);
  } catch (err) {
    if (isRefusal(err, "42501")) return <Locked what="This dashboard" plans="role's" />;
    throw err;
  }
  const numbers = Object.entries(d).filter(([k, v]) => k in NUMBER_LABELS && (typeof v === "number" || v === null));
  const lists = Object.entries(d).filter(([k, v]) => k in LIST_LABELS && Array.isArray(v)) as [string, { label: string; count: number | null }[]][];
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title="Dashboard">Groups smaller than 5 show as &quot;fewer than 5&quot;, and a second group is hidden when a total would give one away.</PageTitle>
      <nav aria-label="Dashboard areas" className="flex flex-wrap gap-2">
        {DASHBOARD_AREAS.map((a) => (
          <Link key={a.key} href={`/uni/dashboard/${a.key}` as Route} aria-current={a.key === area ? "page" : undefined}
            className={cn("rounded-md border px-3 py-1.5 text-body-sm font-semibold", a.key === area ? "border-primary bg-primary-subtle" : "border-border-default")}>
            {a.label}
          </Link>
        ))}
      </nav>
      {d.locked ? (
        <Locked what="This area" plans={PLAN_FOR[area as DashboardArea] ?? "Basic, Growth or Campus"} />
      ) : (
        <>
          {numbers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3" data-testid="dash-numbers">
              {numbers.map(([k, v]) => (
                <Card key={k}><p className="text-caption text-text-secondary">{NUMBER_LABELS[k]}</p><p className="font-display text-h2">{countLabel(v as number | null)}</p></Card>
              ))}
            </div>
          ) : null}
          {lists.map(([k, items]) => (
            <Section key={k} title={LIST_LABELS[k]} id={`l-${k}`}>
              <BarList label={LIST_LABELS[k]} items={items} />
            </Section>
          ))}
          {Array.isArray(d.items) ? (
            <Section title="Recruiter demand and your L2+ supply" id="gap-h">
              <DataTable head={["Skill", "Searches (90 days, all recruiters)", "Your students at L2+"]}
                rows={(d.items as { label: string; demand: number; supply: number | null }[]).map((i) => [i.label, i.demand, countLabel(i.supply)])} />
            </Section>
          ) : null}
          {Array.isArray(d.teachers) ? (
            <Section title="Faculty engagement" id="fac-h">
              <DataTable head={["Teacher", "Department", "Reviews", "Supervisions", "Code checks", "Endorsements", "Ideas"]}
                rows={(d.teachers as Record<string, string | number>[]).map((t) => [t.name, t.department, t.reviews, t.supervisions, t.code_checks, t.endorsements, t.ideas])} />
            </Section>
          ) : null}
          {numbers.length === 0 && lists.length === 0 && !d.items && !d.teachers ? <p className="text-body text-text-secondary">No numbers yet; they appear after the next nightly run.</p> : null}
          <p className="flex flex-wrap gap-4 text-body-sm text-text-secondary">
            {d.computed_at ? <span>Updated {dayLabel(d.computed_at)}.</span> : null}
            {!d.full ? <span>Basic shows totals; Growth and Campus add trends and breakdowns.</span> : null}
            {d.exports ? (
              <>
                <a className="font-semibold underline underline-offset-4" href={`/api/uni/export?area=${area}`}>Download CSV</a>
                <a className="font-semibold underline underline-offset-4" href={`/api/uni/export?area=${area}&format=pdf`}>Download PDF</a>
              </>
            ) : null}
          </p>
        </>
      )}
    </main>
  );
}
