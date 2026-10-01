import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WithdrawButton } from "@/components/recruit/student-controls";
import { Badge } from "@/components/ui";
import { getApplication } from "@/lib/data/opportunities";
import { isRefusal } from "@/lib/data/rpc-json";
import { dayLabel } from "@/lib/format/time";
import { STAGE_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Application" };

/**
 * /opportunities/applications/[id] (PRD 5.20): the tracker. You see the stage and its date, and, if you
 * were not taken forward, a generic reason. The recruiter's private notes are never shown.
 */
export default async function ApplicationPage({ params }: PageProps<"/opportunities/applications/[id]">) {
  const { id } = await params;
  const a = await getApplication(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!a) notFound();
  const active = !["hired", "rejected", "withdrawn"].includes(a.stage);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <header className="flex flex-col gap-1">
        <p><Link href={"/opportunities/applications" as Route} className="text-body-sm font-semibold underline underline-offset-4">All applications</Link></p>
        <h1 className="font-display text-h1">{a.job.title}</h1>
        <p className="text-body text-text-secondary">
          <Link href={`/companies/${a.org.slug}` as Route} className="font-semibold underline underline-offset-4">{a.org.name}</Link> · applied {dayLabel(a.applied_at)}
        </p>
        <p><Badge tone={a.stage === "hired" ? "success" : a.stage === "rejected" ? "warning" : "info"} data-testid="stage">{STAGE_LABELS[a.stage]}</Badge></p>
      </header>
      {a.reason ? <p className="rounded-md border border-border-default bg-bg-subtle px-3 py-2 text-body" data-testid="reject-reason">{a.reason}</p> : null}
      <ol className="flex flex-col gap-3 border-l border-border-default pl-4" data-testid="history">
        {a.history.map((h, i) => (
          <li key={i}>
            <p className="font-semibold">{STAGE_LABELS[h.stage]}</p>
            <p className="text-body-sm text-text-secondary">{dayLabel(h.at)}</p>
          </li>
        ))}
      </ol>
      {a.note ? <p className="text-body-sm text-text-secondary">Your note: “{a.note}”</p> : null}
      {active ? <WithdrawButton id={a.id} /> : null}
    </main>
  );
}
