import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitionReviewForm } from "@/components/ops/org-forms";
import { EmptyState } from "@/components/ui";
import { getOpsCompetitions } from "@/lib/data/ops-orgs";
import { staffRoles } from "@/lib/data/ops-trust";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Competition briefs" };

/** Every competition brief is reviewed before it opens; briefs that ask for free product work are rejected (PRD 5.20). */
export default async function CompetitionBriefsPage() {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const briefs = await getOpsCompetitions("in_review");
  return (
    <main className="flex max-w-3xl flex-col gap-4">
      <p><Link href={"/ops/orgs" as Route} className="text-body-sm font-semibold underline underline-offset-4">All organisations</Link></p>
      <h1 className="font-display text-h1">Competition briefs</h1>
      {briefs.length === 0 ? (
        <EmptyState title="No briefs waiting" description="Briefs appear here when an organisation sends one for review." />
      ) : (
        <ul className="flex flex-col gap-4" data-testid="briefs">
          {briefs.map((b) => (
            <li key={b.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
              <div>
                <h2 className="text-h4">{b.title} <span className="text-body-sm font-normal text-text-secondary">by {b.org}, for a {b.role}</span></h2>
                <p className="text-body-sm text-text-secondary">{dayLabel(b.starts_at)} to {dayLabel(b.ends_at)} · prize: {b.prize}</p>
              </div>
              <p className="text-body whitespace-pre-line">{b.brief}</p>
              <p className="text-body-sm">Rubric: {b.rubric.map((r) => `${r.criterion} ${r.weight}%`).join(", ")}</p>
              <CompetitionReviewForm id={b.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
