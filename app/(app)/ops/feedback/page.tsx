import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getFeedbackQueue } from "@/lib/data/feedback";
import { staffRoles } from "@/lib/data/ops-trust";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/feedback/constants";

export const metadata: Metadata = { title: "Feedback" };

/** /ops/feedback (PRD 5.27, 5.26): the feedback inbox for any staff role, oldest first, claim before answering. */
export default async function OpsFeedbackPage({ searchParams }: PageProps<"/ops/feedback">) {
  if ((await staffRoles()).size === 0) notFound();
  const sp = await searchParams;
  const open = sp.tab !== "closed";
  const rows = await getFeedbackQueue(open);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-h1">Feedback</h1>
      <nav aria-label="Feedback lists" className="flex gap-2">
        {[
          { key: "open", label: "Open" },
          { key: "closed", label: "Shipped and closed" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/ops/feedback?tab=${t.key}` as Route}
            aria-current={(open ? "open" : "closed") === t.key ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-body-sm font-semibold",
              (open ? "open" : "closed") === t.key ? "border-primary bg-primary-subtle" : "border-border-default text-text-secondary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title={open ? "Nothing waiting" : "Nothing closed yet"} description="Feedback from students lands here." />
      ) : (
        <table className="w-full text-left text-body-sm" data-testid="feedback-queue">
          <thead className="text-label text-text-secondary uppercase">
            <tr>
              <th className="py-2 pr-3">Waiting</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Feedback</th>
              <th className="py-2 pr-3">Student</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Claimed by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{r.age}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{TYPE_LABELS[r.type]}</td>
                <td className="max-w-md py-2 pr-3">
                  <Link href={`/ops/feedback/${r.id}` as Route} className="line-clamp-2 underline-offset-4 hover:underline">
                    {r.body}
                  </Link>
                </td>
                <td className="py-2 pr-3">{r.student ?? "Deleted account"}</td>
                <td className="py-2 pr-3">
                  <Badge tone="neutral">{STATUS_LABELS[r.status]}</Badge>
                </td>
                <td className="py-2">{r.claimedBy ? (r.claimedByMe ? "You" : r.claimedBy) : "Nobody"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
