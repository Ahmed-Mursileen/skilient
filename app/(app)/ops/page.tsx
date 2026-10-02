import type { Metadata, Route } from "next";
import Link from "next/link";
import { InboxClaim } from "@/components/ops/inbox-claim";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getInbox } from "@/lib/data/ops-shell";
import { QUEUE_LABELS } from "@/lib/ops/nav";

export const metadata: Metadata = { title: "Inbox" };

/**
 * /ops (PRD 5.26 "Queues", screen spec 3.11): one inbox across every queue the staff member's
 * roles open, with counts, age timers and claims. Each item opens its area's existing page.
 */
export default async function OpsInboxPage({ searchParams }: PageProps<"/ops">) {
  const sp = await searchParams;
  const queue = typeof sp.queue === "string" && sp.queue in QUEUE_LABELS ? sp.queue : null;
  const { queues, items } = await getInbox(queue);
  const total = queues.reduce((n, q) => n + q.total, 0);
  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-h1">Inbox</h1>
        <p className="text-body-sm text-text-secondary" data-testid="inbox-total">
          {total === 1 ? "1 item waiting" : `${total} items waiting`}
        </p>
      </header>

      {queues.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Queues" data-testid="inbox-queues">
          {queues.map((q) => {
            const current = queue === q.queue;
            return (
              <li key={q.queue}>
                <Link
                  href={(current ? "/ops" : `/ops?queue=${q.queue}`) as Route}
                  aria-current={current ? "true" : undefined}
                  data-testid="inbox-queue"
                  data-queue={q.queue}
                  className={cn(
                    "flex h-full flex-col gap-1 rounded-lg border bg-bg-surface p-3 transition-colors duration-[120ms] hover:border-border-strong",
                    current ? "border-primary" : "border-border-default",
                  )}
                >
                  <span className="text-body-sm font-semibold">{QUEUE_LABELS[q.queue] ?? q.queue}</span>
                  <span className="font-display text-h2 tabular-nums" data-testid="inbox-queue-count">
                    {q.total}
                  </span>
                  <span className="text-caption text-text-secondary">
                    Oldest {q.oldestAge}
                    {q.claimable ? ` · ${q.unclaimed} unclaimed` : ""}
                    {q.mine ? ` · ${q.mine} yours` : ""}
                  </span>
                  {q.overdue ? (
                    <Badge tone="warning" className="self-start">
                      {q.overdue} past {q.slaHours} h
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {items.length ? (
        <section aria-labelledby="inbox-items-h" className="flex flex-col gap-2">
          <h2 id="inbox-items-h" className="text-h3">
            {queue ? QUEUE_LABELS[queue] : "Everything, oldest first"}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
            <table className="w-full min-w-[760px] text-left text-body-sm" data-testid="inbox-items">
              <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Queue</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Item</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Waiting</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Claimed by</th>
                  <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Claim</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {items.map((i) => {
                  const label = `${QUEUE_LABELS[i.queue] ?? i.queue}: ${i.title}`;
                  return (
                    <tr key={`${i.queue}:${i.id}`} data-testid="inbox-item" data-queue={i.queue}>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-text-secondary">{QUEUE_LABELS[i.queue] ?? i.queue}</td>
                      <td className="max-w-[420px] px-3 py-2 align-top">
                        <Link href={i.href as Route} className="font-semibold underline underline-offset-4">
                          {i.title.replaceAll("_", " ")}
                        </Link>
                        {i.detail ? <span className="block line-clamp-2 text-caption text-text-secondary">{i.detail}</span> : null}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap tabular-nums">
                        {i.age}
                        {i.overdue ? <Badge tone="warning" className="ml-2">Overdue</Badge> : null}
                      </td>
                      <td className="px-3 py-2 align-top">{!i.claimable ? "—" : i.claimedByMe ? "You" : (i.claimedBy ?? "Nobody yet")}</td>
                      <td className="px-3 py-2 text-right align-top">
                        {i.claimable && (i.claimedByMe || !i.claimedBy) ? <InboxClaim queue={i.queue} id={i.id} mine={i.claimedByMe} label={label} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState title={queue ? "Nothing waiting here" : "Inbox zero"} description="New items from every queue you work appear here, oldest first." />
      )}
    </main>
  );
}
