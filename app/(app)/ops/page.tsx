import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getQueue } from "@/lib/data/ops";
import { staffRoles } from "@/lib/data/ops-trust";
import { REASON_LABELS, STATUS_LABELS, TARGET_LABELS } from "@/lib/ops/labels";

export const metadata: Metadata = { title: "Reports" };

/** /ops (screen spec 3.11 "Queues"): reports grouped by target, oldest first, with claims. */
export default async function OpsQueuePage({ searchParams }: PageProps<"/ops">) {
  // Reports are for moderators; other staff start at their own area.
  const roles = await staffRoles();
  if (!roles.has("moderator")) {
    if (roles.has("trust_reviewer")) redirect("/ops/evidence");
    notFound();
  }
  const sp = await searchParams;
  const status = sp.status === "resolved" ? "resolved" : "open";
  const rows = await getQueue(status);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-h1">Reports</h1>
      <nav aria-label="Report status" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {(["open", "resolved"] as const).map((s) => (
            <li key={s}>
              <Link
                href={(s === "open" ? "/ops" : "/ops?status=resolved") as Route}
                aria-current={status === s ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  status === s ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {s === "open" ? "Open" : "Resolved"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[880px] text-left text-body-sm" data-testid="ops-queue">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">What</th>
                <th scope="col" className="px-3 py-2 font-semibold">Content</th>
                <th scope="col" className="px-3 py-2 font-semibold">Reasons</th>
                <th scope="col" className="px-3 py-2 font-semibold">Reports</th>
                <th scope="col" className="px-3 py-2 font-semibold">Waiting</th>
                <th scope="col" className="px-3 py-2 font-semibold">{status === "open" ? "Claimed by" : "Outcome"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {rows.map((r) => (
                <tr key={r.id} data-testid="ops-case">
                  <td className="px-3 py-2 align-top">
                    <Link href={`/ops/reports/${r.id}` as Route} className="font-semibold underline underline-offset-4">
                      {TARGET_LABELS[r.targetType]}
                    </Link>
                    {r.ownerName ? <span className="block text-caption text-text-secondary">by {r.ownerName}</span> : null}
                  </td>
                  <td className="max-w-[320px] px-3 py-2 align-top">
                    <span className="line-clamp-2">{r.excerpt || "No text"}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.softSignal ? <span className="block text-caption font-semibold">Survey: Appropriate crosses</span> : null}
                    {r.reasons.map((x) => REASON_LABELS[x] ?? x).join(", ")}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums">{r.reports}</td>
                  <td className="px-3 py-2 align-top tabular-nums">{r.age}</td>
                  <td className="px-3 py-2 align-top">
                    {status === "open" ? (r.claimedByMe ? "You" : (r.claimedBy ?? "Nobody yet")) : STATUS_LABELS[r.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={status === "open" ? "No open reports" : "Nothing resolved yet"} description="New reports appear here, oldest first." />
      )}
    </main>
  );
}
