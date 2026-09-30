import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BatchForm } from "@/components/ops/feedback-forms";
import { getBatches } from "@/lib/data/feedback";
import { staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Final-year batches" };

/**
 * /ops/batches (PRD 5.25; accounts staff until university admins arrive in phase 9): each
 * university's final-year batch. At the nightly rollover, students of that year or earlier
 * become graduates. Every change is audited with its reason.
 */
export default async function OpsBatchesPage() {
  if (!(await staffRoles()).has("accounts")) notFound();
  const rows = await getBatches();
  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-h1">Final-year batches</h1>
        <p className="mt-1 text-body text-text-secondary">
          Students whose graduation year is at or before a university&apos;s final-year batch become graduates that night. Clear the
          year to stop it.
        </p>
      </div>
      <ul className="divide-y divide-border-muted rounded-lg border border-border-default bg-bg-surface" data-testid="batches">
        {rows.map((r) => (
          <li key={r.universityId} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-body font-semibold">{r.name}</p>
              <p className="text-caption text-text-secondary">
                {r.students} students, {r.graduates} graduates{r.finalYearBatch ? `, batch of ${r.finalYearBatch}` : ", no batch set"}
              </p>
            </div>
            <BatchForm universityId={r.universityId} batch={r.finalYearBatch} name={r.name} />
          </li>
        ))}
      </ul>
    </main>
  );
}
