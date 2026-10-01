import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpamReviewForm } from "@/components/ops/org-forms";
import { EmptyState } from "@/components/ui";
import { getSpamReviews } from "@/lib/data/ops-orgs";
import { staffRoles } from "@/lib/data/ops-trust";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Spam reviews" };

/** Organisations above 80% declines over 30 days open a review here (PRD 5.20). */
export default async function SpamReviewsPage() {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const reviews = await getSpamReviews("open");
  return (
    <main className="flex max-w-3xl flex-col gap-4">
      <p><Link href={"/ops/orgs" as Route} className="text-body-sm font-semibold underline underline-offset-4">All organisations</Link></p>
      <h1 className="font-display text-h1">Spam reviews</h1>
      {reviews.length === 0 ? (
        <EmptyState title="Nothing to review" description="An organisation appears here when more than 80% of its answered contact requests over 30 days were declined." />
      ) : (
        <ul className="flex flex-col gap-4" data-testid="spam-reviews">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
              <p>
                <Link href={`/ops/orgs/${r.org_id}` as Route} className="text-h4 underline-offset-4 hover:underline">{r.org}</Link>{" "}
                <span className="text-body-sm text-text-secondary">{r.declined} of {r.requests} answered requests declined ({Math.round(r.rate * 100)}%), opened {ageLabel(r.opened_at)}</span>
              </p>
              <SpamReviewForm id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
