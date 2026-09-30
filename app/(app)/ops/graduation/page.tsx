import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BatchAdd, BatchForm } from "@/components/ops/feedback-forms";
import { getBatches } from "@/lib/data/feedback";
import { staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Final-year batches" };

/**
 * /ops/graduation (PRD 5.25; accounts staff until university admins arrive in phase 9).
 * Nobody has to set anything here: the platform rule graduates students on 1 September of
 * their graduation year at every university. This page is only for the rare university whose
 * calendar differs: its own final-year batch replaces the rule for it. Every change is
 * audited with its reason.
 */
export default async function OpsBatchesPage() {
  if (!(await staffRoles()).has("accounts")) notFound();
  const rows = await getBatches();
  const exceptions = rows.filter((r) => r.finalYearBatch !== null);
  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-h1">Graduation</h1>
        <p className="mt-1 text-body text-text-secondary" data-testid="graduation-rule">
          On 1 September every student whose graduation year is that year or earlier becomes a graduate, at every university,
          automatically. Only add an exception for a university whose calendar differs: its own year replaces the rule for it.
        </p>
      </div>
      <BatchAdd options={rows.filter((r) => r.finalYearBatch === null).map((r) => ({ id: r.universityId, name: r.name }))} />
      <h2 className="text-h3">Exceptions</h2>
      {exceptions.length === 0 ? (
        <p className="text-body-sm text-text-secondary">None. Every university follows the rule.</p>
      ) : (
        <ul className="divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface" data-testid="batches">
          {exceptions.map((r) => (
            <li key={r.universityId} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="text-body font-semibold">{r.name}</p>
                <p className="text-caption text-text-secondary">
                  {r.students} students, {r.graduates} graduates, batch of {r.finalYearBatch}. Clear the year to follow the rule again.
                </p>
              </div>
              <BatchForm universityId={r.universityId} batch={r.finalYearBatch} name={r.name} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
