import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { ReviewForm } from "@/components/teach/review-form";
import { Badge } from "@/components/ui";
import { closeReviewRequest } from "@/lib/actions/teach";
import { getReviewRequest } from "@/lib/data/teach";
import { REVIEW_RUBRIC, REVIEW_STATUS_LABELS } from "@/lib/teach/constants";

export const metadata: Metadata = { title: "Review" };

/** /teach/reviews/[requestId]: read the venture, then score the five parts of the rubric. */
export default async function ReviewPage({ params }: PageProps<"/teach/reviews/[requestId]">) {
  const { requestId } = await params;
  const r = await getReviewRequest(requestId);
  if (!r) notFound();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/teach/reviews" className="text-body-sm text-text-secondary underline underline-offset-4">Reviews</Link>
        <h1 className="mt-1 font-display text-h1">{r.ventureTitle}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <Badge tone={r.status === "open" ? "info" : r.status === "submitted" ? "success" : "neutral"}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
          Asked by {r.requestedBy}{r.status === "open" ? ` · due ${r.dueLabel}` : ""}
        </p>
      </div>
      <p className="text-body">
        <Link href={`/teach/ventures/${r.ventureId}` as Route} className="font-semibold underline underline-offset-4">Read the venture&apos;s work</Link>{" "}
        (contributions and deliverables) before you score it.
      </p>
      {r.status === "open" ? (
        <>
          <ReviewForm requestId={r.id} />
          <ActionButton action={closeReviewRequest.bind(null, r.id, r.ventureId)} variant="ghost">Decline this request</ActionButton>
        </>
      ) : r.review ? (
        <section aria-labelledby="done-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5" data-testid="review-done">
          <h2 id="done-h" className="text-h3">Your review · {r.review.dateLabel}</h2>
          <p className="text-body-sm text-text-secondary">Average {r.review.average.toFixed(1)} of 5</p>
          <dl className="flex flex-col gap-3">
            {REVIEW_RUBRIC.map((p) => (
              <div key={p.key}>
                <dt className="text-body-sm font-semibold">{p.label}: {r.review?.rubric[p.key]?.score} of 5</dt>
                <dd className="text-body-sm">{r.review?.rubric[p.key]?.comment}</dd>
              </div>
            ))}
          </dl>
          {r.review.comments ? <p className="text-body whitespace-pre-line">{r.review.comments}</p> : null}
        </section>
      ) : (
        <p className="text-body-sm text-text-secondary">This request is closed.</p>
      )}
    </main>
  );
}
