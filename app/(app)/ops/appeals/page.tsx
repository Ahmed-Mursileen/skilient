import type { Metadata, Route } from "next";
import Link from "next/link";
import { FileAppealForm } from "@/components/ops/appeal-forms";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getOpsAppeals } from "@/lib/data/sanctions";
import { APPEAL_STATUS_LABELS, decisionTitle } from "@/lib/ops/appeals";
import { ROLE_LABELS } from "@/lib/ops/nav";

export const metadata: Metadata = { title: "Appeals" };

/**
 * /ops/appeals (PRD 5.26): appeals the caller's roles can decide, oldest first. The staff member who
 * made a decision sees its appeal marked and can't take it.
 */
export default async function OpsAppealsPage({ searchParams }: PageProps<"/ops/appeals">) {
  const sp = await searchParams;
  const open = sp.status !== "decided";
  const rows = await getOpsAppeals(open);
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Appeals</h1>
      <nav aria-label="Appeal status" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {([true, false] as const).map((o) => (
            <li key={String(o)}>
              <Link
                href={(o ? "/ops/appeals" : "/ops/appeals?status=decided") as Route}
                aria-current={open === o ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  open === o ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {o ? "Waiting" : "Decided"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[820px] text-left text-body-sm" data-testid="appeals-table">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Decision</th>
                <th scope="col" className="px-3 py-2 font-semibold">Appellant</th>
                <th scope="col" className="px-3 py-2 font-semibold">Decided by role</th>
                <th scope="col" className="px-3 py-2 font-semibold">Filed</th>
                <th scope="col" className="px-3 py-2 font-semibold">{open ? "Claimed by" : "Outcome"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {rows.map((a) => (
                <tr key={a.id} data-testid="appeal-row">
                  <td className="px-3 py-2 align-top">
                    <Link href={`/ops/appeals/${a.id}` as Route} className="font-semibold underline underline-offset-4">
                      {decisionTitle(a.type, a.summary).replace("your ", "their ")}
                    </Link>
                    {a.mineOriginally ? <Badge className="ml-2">Your decision</Badge> : null}
                    {a.stuck ? <Badge tone="warning" className="ml-2">Needs another {ROLE_LABELS[a.deciderRole].toLowerCase()}</Badge> : null}
                  </td>
                  <td className="px-3 py-2 align-top">{a.appellantName ?? "Deleted account"}</td>
                  <td className="px-3 py-2 align-top">{ROLE_LABELS[a.deciderRole]}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{a.filedLabel}</td>
                  <td className="px-3 py-2 align-top">{open ? (a.claimedByMe ? "You" : (a.claimedBy ?? "Nobody yet")) : APPEAL_STATUS_LABELS[a.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={open ? "No appeals waiting" : "No appeals decided in the last 90 days"} description="Appeals you can decide appear here, oldest first." />
      )}
      <FileAppealForm />
    </main>
  );
}
