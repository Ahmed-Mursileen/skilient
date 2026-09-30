import { ClipboardText } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getReviewRequests } from "@/lib/data/teach";
import { REVIEW_STATUS_LABELS } from "@/lib/teach/constants";

export const metadata: Metadata = { title: "Reviews" };

/** /teach/reviews (PRD 5.21 "Reviews"): open requests oldest-due first, then the ones already answered. */
export default async function ReviewsPage({ searchParams }: PageProps<"/teach/reviews">) {
  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "open";
  const rows = await getReviewRequests(tab);
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Reviews</h1>
      <nav aria-label="Review status" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {(["open", "done"] as const).map((t) => (
            <li key={t}>
              <Link
                href={(t === "open" ? "/teach/reviews" : "/teach/reviews?tab=done") as Route}
                aria-current={tab === t ? "page" : undefined}
                className={cn("inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold", tab === t ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}
              >
                {t === "open" ? "Waiting" : "Answered"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardText aria-hidden className="size-8" />}
          title={tab === "open" ? "No review requests" : "Nothing answered yet"}
          description={tab === "open" ? "Venture owners at your university can ask you to review their work, and you can start a review on a venture you supervise. Unanswered requests expire after 14 days." : "Reviews you submit and requests that expired or were withdrawn appear here."}
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="review-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/teach/reviews/${r.id}` as Route} className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4 hover:bg-bg-subtle">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-h4">{r.ventureTitle}</span>
                  <Badge tone={r.status === "open" ? (r.daysLeft <= 2 ? "warning" : "info") : r.status === "submitted" ? "success" : "neutral"}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
                </span>
                <span className="text-body-sm text-text-secondary">
                  {r.startedByMe ? "Started by you" : `Asked by ${r.requestedBy}`}
                  {r.status === "open" ? ` · due ${r.dueLabel} (${Math.max(0, r.daysLeft)} day${r.daysLeft === 1 ? "" : "s"} left)` : r.closedLabel ? ` · ${r.closedLabel}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
