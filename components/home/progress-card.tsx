import { ArrowRight, CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { DismissCardButton, DismissChecklistButton } from "@/components/home/progress-card-controls";
import { Button, TierBadge } from "@/components/ui";
import type { ProgressCard as ProgressCardData } from "@/lib/data/portal";
import { points } from "@/lib/ranking/labels";

function todoLine(t: ProgressCardData["todo"]): string {
  const parts: string[] = [];
  if (t.applications) parts.push(`${t.applications} join ${t.applications === 1 ? "request" : "requests"}`);
  if (t.invites) parts.push(`${t.invites} ${t.invites === 1 ? "invite" : "invites"}`);
  if (t.requests) parts.push(`${t.requests} friend ${t.requests === 1 ? "request" : "requests"}`);
  if (t.confirm) parts.push(`${t.confirm} ${t.confirm === 1 ? "contribution" : "contributions"} to confirm`);
  if (t.endorse) parts.push(`${t.endorse} ${t.endorse === 1 ? "venture" : "ventures"} to endorse`);
  return parts.join(", ");
}

/**
 * The Home progress card (PRD 5.25): tier and points, the single most valuable next step,
 * what is waiting on you, and the getting-started checklist (PRD 5.27) until it is done or
 * dismissed. Dismissible for the day. Everything is computed by SQL from existing tables.
 */
export function ProgressCard({ card }: { card: ProgressCardData }) {
  if (card.dismissed) return null;
  const { todo, checklist } = card;
  const showChecklist = !checklist.dismissed && checklist.done < checklist.total;
  return (
    <section aria-labelledby="progress-h" className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-4 shadow-1" data-testid="progress-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="progress-h" className="text-label text-text-secondary uppercase">
            Your progress
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body">
            {card.tier ? <TierBadge tier={card.tier} /> : <span className="font-semibold">Not ranked yet</span>}
            {card.scored ? <span className="text-text-secondary tabular-nums">{points(card.points)} points, only you see this</span> : null}
          </p>
        </div>
        <DismissCardButton />
      </div>

      <div className="flex flex-col gap-2 rounded-md bg-bg-subtle p-3" data-testid="next-step">
        <p className="text-h4">{card.action.title}</p>
        <p className="text-body-sm text-text-secondary">{card.action.body}</p>
        <div>
          <Button asChild size="sm">
            <Link href={card.action.href as Route}>
              Take this step <ArrowRight aria-hidden weight="bold" className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {todo.total > 0 ? (
        <p className="text-body-sm" data-testid="todo-count">
          <Link href="/requests" className="font-semibold underline underline-offset-4">
            {todo.total} to do
          </Link>
          <span className="text-text-secondary">: {todoLine(todo)}</span>
        </p>
      ) : (
        <p className="text-body-sm text-text-secondary">You&apos;re all caught up: nothing is waiting on you.</p>
      )}

      {showChecklist ? (
        <details className="group rounded-md border border-border-muted" data-testid="checklist">
          <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-body-sm font-semibold">
            <span>
              Getting started: {checklist.done} of {checklist.total}
            </span>
            <span aria-hidden className="text-text-muted group-open:rotate-90">
              ›
            </span>
          </summary>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {checklist.items.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-body-sm">
                {item.done ? (
                  <CheckCircle aria-hidden weight="fill" className="size-5 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden weight="bold" className="size-5 shrink-0 text-text-muted" />
                )}
                <Link href={item.href as Route} className={item.done ? "text-text-secondary line-through" : "underline-offset-4 hover:underline"}>
                  {item.label}
                </Link>
                <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
                {item.points !== null && !item.done ? (
                  <span className="ml-auto text-caption text-text-secondary tabular-nums">
                    +{points(item.points)}
                    {item.note ? ` ${item.note}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="border-t border-border-muted px-3 py-2">
            <DismissChecklistButton />
          </div>
        </details>
      ) : null}
    </section>
  );
}
