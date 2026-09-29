import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamPeriodForm, RemoveExamPeriod } from "@/components/ops/ranking-forms";
import { EmptyState } from "@/components/ui";
import { getExamPeriods, getUniversityOptions } from "@/lib/data/ops-ranking";
import { staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Exam periods" };

/**
 * /ops/exam-periods (PRD 5.13 decay, 5.26 "Organisations"): accounts staff enter each
 * university's exam periods until university admins can (phase 9). Momentum doesn't decay on
 * these days for that university's students. None are seeded; every change is audited.
 */
export default async function OpsExamPeriodsPage() {
  if (!(await staffRoles()).has("accounts")) notFound();
  const [periods, universities] = await Promise.all([getExamPeriods(), getUniversityOptions()]);
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="font-display text-h1">Exam periods</h1>
          <p className="mt-1 text-body text-text-secondary">
            Momentum doesn&rsquo;t decay on these days for that university&rsquo;s students. Up to 45 days each; one university&rsquo;s
            periods never overlap.
          </p>
        </div>
        {periods.length ? (
          <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
            <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="exam-periods">
              <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">University</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Days</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Reason</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Added</th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {periods.map((p) => (
                  <tr key={p.id} data-testid="exam-period-row">
                    <td className="px-3 py-2 align-top font-semibold">{p.university}</td>
                    <td className="px-3 py-2 align-top">
                      {p.startsLabel} to {p.endsLabel}
                      <span className="block text-caption text-text-secondary">
                        {p.days} {p.days === 1 ? "day" : "days"}
                        {p.current ? " · on now" : p.past ? " · past" : " · upcoming"}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-3 py-2 align-top">{p.reason}</td>
                    <td className="px-3 py-2 align-top">
                      {p.addedLabel}
                      {p.addedBy ? <span className="block text-caption text-text-secondary">by {p.addedBy}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <RemoveExamPeriod id={p.id} label={`${p.university}, ${p.startsLabel} to ${p.endsLabel}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No exam periods yet" description="Add a university's exam dates when its registrar publishes them." />
        )}
      </div>
      <aside>
        <section aria-labelledby="add-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="add-h" className="text-h4">
            Add an exam period
          </h2>
          <ExamPeriodForm universities={universities} />
        </section>
      </aside>
    </main>
  );
}
