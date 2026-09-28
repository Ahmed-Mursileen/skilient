import { Plus, RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { VentureCard } from "@/components/ventures/venture-card";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { browseVentures, PAGE_SIZE, type VentureStatus, type VentureType } from "@/lib/data/ventures";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/ventures/labels";

export const metadata: Metadata = { title: "Ventures" };

const STATUSES: VentureStatus[] = ["recruiting", "in_progress", "completed"];

type Params = { type: VentureType; status: VentureStatus | null; open: boolean; mine: boolean; before: string | null };

function href(p: Params, change: Partial<Params>): Route {
  const next = { ...p, before: null, ...change };
  const q = new URLSearchParams();
  if (next.type !== "project") q.set("type", next.type);
  if (next.status) q.set("status", next.status);
  if (next.open) q.set("open", "1");
  if (next.mine) q.set("mine", "1");
  if (next.before) q.set("before", next.before);
  const s = q.toString();
  return (s ? `/ventures?${s}` : "/ventures") as Route;
}

function Chip({ to, active, children }: { to: Route; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-body-sm font-semibold transition-colors duration-[120ms]",
        active ? "border-text-primary bg-text-primary text-bg-page" : "border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </Link>
  );
}

/** /ventures (PRD 5.7, 5.28 "Browse"): Projects and Startups tabs, filters, newest first. */
export default async function VenturesPage({ searchParams }: PageProps<"/ventures">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const p: Params = {
    type: one("type") === "startup" ? "startup" : "project",
    status: STATUSES.includes(one("status") as VentureStatus) ? (one("status") as VentureStatus) : null,
    open: one("open") === "1",
    mine: one("mine") === "1",
    before: one("before") && !Number.isNaN(Date.parse(one("before")!)) ? one("before") : null,
  };
  const ventures = await browseVentures({ type: p.type, status: p.status, openRoles: p.open, myUniversity: p.mine, before: p.before });
  const filtered = p.status || p.open || p.mine;

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-h1">Ventures</h1>
          <p className="mt-1 text-body text-text-secondary">Projects and startups students are building. Join one, or start your own.</p>
        </div>
        <Button asChild>
          <Link href={(p.type === "startup" ? "/ventures/new?type=startup" : "/ventures/new") as Route}>
            <Plus aria-hidden weight="bold" className="size-4" />
            Start a venture
          </Link>
        </Button>
      </div>

      <nav aria-label="Venture type" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {(["project", "startup"] as const).map((t) => (
            <li key={t}>
              <Link
                href={href(p, { type: t })}
                aria-current={p.type === t ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  p.type === t ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {TYPE_LABELS[t].many}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div role="group" aria-label="Filters" className="flex flex-wrap gap-2">
        <Chip to={href(p, { status: null })} active={!p.status}>
          Any status
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} to={href(p, { status: s })} active={p.status === s}>
            {STATUS_LABELS[s]}
          </Chip>
        ))}
        <Chip to={href(p, { open: !p.open })} active={p.open}>
          Open roles
        </Chip>
        <Chip to={href(p, { mine: !p.mine })} active={p.mine}>
          My university
        </Chip>
      </div>

      {ventures.length ? (
        <>
          <ul className="flex flex-col gap-3">
            {ventures.map((v) => (
              <li key={v.id}>
                <VentureCard venture={v} />
              </li>
            ))}
          </ul>
          {ventures.length === PAGE_SIZE ? (
            <Button asChild variant="secondary" className="self-center">
              <Link href={href(p, { before: ventures.at(-1)!.createdAt })}>Show older ventures</Link>
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<RocketLaunch aria-hidden className="size-8" />}
          title={filtered ? "No ventures match these filters" : `No ${TYPE_LABELS[p.type].many.toLowerCase()} yet`}
          description={
            filtered
              ? "Try clearing a filter, or start the venture you were looking for."
              : "Be the first: start one and invite classmates to build it with you."
          }
          action={
            filtered ? (
              <Button asChild variant="secondary">
                <Link href={href(p, { status: null, open: false, mine: false })}>Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </main>
  );
}
