import type { Metadata } from "next";
import { ChartCard, RankedBars, Sparkline, StackedBars, TrendChart } from "@/components/ops/metrics-charts";
import { getMetrics } from "@/lib/data/ops-config";

export const metadata: Metadata = { title: "Metrics" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const STREAMS: Record<string, string> = { user: "Students", org: "Organisations", university: "Universities" };
const QUEUES = ["reports", "evidence", "organisations", "appeals", "feedback"] as const;
const QUEUE_LABELS: Record<(typeof QUEUES)[number], string> = {
  reports: "Reports",
  evidence: "Evidence",
  organisations: "Orgs, claims, teachers",
  appeals: "Appeals",
  feedback: "Feedback",
};

/**
 * /ops/metrics (PRD 5.26, screen spec 3.11): growth, evidence, hiring, revenue and backlogs from
 * the hourly materialised view; product funnels, retention and replays live in PostHog.
 */
export default async function OpsMetricsPage() {
  const m = await getMetrics();
  const signups = m.signups.map((d) => ({ ...d, label: day.format(new Date(d.day)) }));
  const contacts = m.contacts.map((w) => ({ ...w, label: day.format(new Date(w.week)) }));
  const hires = m.hires.map((h) => ({ ...h, label: month.format(new Date(h.month)) }));
  const evidence = m.evidence.map((e) => ({ university: e.university, rate: e.students ? Math.round((e.l2 / e.students) * 100) : 0, students: e.students, l2: e.l2 }));
  const lastDay = m.weeklyActives.at(-1)?.day;
  const actives = m.weeklyActives.filter((a) => a.day === lastDay).sort((a, b) => b.value - a.value).slice(0, 10);
  const sent = m.contacts.reduce((n, w) => n + w.sent, 0);
  const accepted = m.contacts.reduce((n, w) => n + w.accepted, 0);
  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-h1">Metrics</h1>
        <p className="text-caption text-text-secondary" data-testid="metrics-refreshed">
          Updated hourly · last {m.refreshed} ·{" "}
          <a href="https://eu.posthog.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            Funnels and retention in PostHog
          </a>
        </p>
      </header>

      <section aria-labelledby="mrr-h" className="flex flex-col gap-2">
        <h2 id="mrr-h" className="text-h3">
          Monthly recurring revenue (live payments)
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3" data-testid="mrr-tiles">
          {(["user", "org", "university"] as const).map((s) => {
            const rows = m.mrr.filter((r) => r.stream === s);
            return (
              <li key={s} className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4">
                <span className="text-body-sm text-text-secondary">{STREAMS[s]}</span>
                {rows.length ? (
                  rows.map((r) => (
                    <span key={r.currency} className="font-display text-h2 tabular-nums">
                      {r.currency} {r.mrr.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                      <span className="ml-2 font-sans text-caption text-text-secondary">{r.subscriptions} subscriptions</span>
                    </span>
                  ))
                ) : (
                  <span className="font-display text-h2 tabular-nums">0</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Signups"
          subtitle="Last 90 days, by account type"
          table={{ head: ["Day", "Students", "Faculty", "Recruiters", "Officials"], rows: m.signups.map((d) => [d.day, d.student, d.faculty, d.recruiter, d.official]) }}
        >
          <TrendChart
            data={signups}
            x="label"
            series={[
              { key: "student", label: "Students" },
              { key: "faculty", label: "Faculty" },
              { key: "recruiter", label: "Recruiters" },
              { key: "official", label: "Officials" },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Contact requests"
          subtitle={`Last 12 weeks · ${sent ? Math.round((accepted / sent) * 100) : 0}% accepted`}
          table={{ head: ["Week", "Sent", "Accepted", "Declined"], rows: m.contacts.map((w) => [w.week, w.sent, w.accepted, w.declined]) }}
        >
          <TrendChart
            data={contacts}
            x="label"
            series={[
              { key: "sent", label: "Sent" },
              { key: "accepted", label: "Accepted" },
              { key: "declined", label: "Declined" },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Weekly active students"
          subtitle="Active in the last 7 days, by university (top 10)"
          table={{ head: ["University", "Active"], rows: actives.map((a) => [a.label, a.value]) }}
        >
          {actives.length ? <RankedBars data={actives} label="label" value="value" name="Active this week" /> : <p className="text-body-sm text-text-secondary">No activity yet.</p>}
        </ChartCard>
        <ChartCard
          title="L2+ evidence rate"
          subtitle="Students with at least one skill at level 2 or higher"
          table={{ head: ["University", "Students", "L2+", "Rate"], rows: evidence.map((e) => [e.university, e.students, e.l2, `${e.rate}%`]) }}
        >
          {evidence.length ? <RankedBars data={evidence} label="university" value="rate" name="L2+ rate" unit="percent" /> : <p className="text-body-sm text-text-secondary">No students yet.</p>}
        </ChartCard>
        <ChartCard
          title="Hires"
          subtitle="Last 12 months, reported by organisations"
          table={{ head: ["Month", "Internships", "Full-time"], rows: m.hires.map((h) => [h.month, h.intern, h.full_time]) }}
        >
          <StackedBars
            data={hires}
            x="label"
            series={[
              { key: "intern", label: "Internships" },
              { key: "full_time", label: "Full-time" },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Queue backlogs"
          subtitle="Waiting items, hourly, last 14 days"
          table={{ head: ["Time", "Queue", "Waiting"], rows: m.backlog.map((b) => [b.at, b.label, b.value]) }}
        >
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="backlog-multiples">
            {QUEUES.map((q) => {
              const rows = m.backlog.filter((b) => b.label === q).map((b) => ({ at: day.format(new Date(b.at)), value: b.value }));
              return (
                <li key={q} className="flex flex-col">
                  <span className="flex items-baseline justify-between text-caption text-text-secondary">
                    {QUEUE_LABELS[q]} <span className="font-display text-h4 text-text-primary tabular-nums">{rows.at(-1)?.value ?? 0}</span>
                  </span>
                  {rows.length > 1 ? (
                    <Sparkline data={rows} x="at" y="value" name={QUEUE_LABELS[q]} />
                  ) : (
                    <span className="flex h-14 items-center text-caption text-text-secondary">Trend appears after two hourly snapshots.</span>
                  )}
                </li>
              );
            })}
          </ul>
        </ChartCard>
      </div>
    </main>
  );
}
