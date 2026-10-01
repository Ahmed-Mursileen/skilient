import { Trophy } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState } from "@/components/ui";
import { getMyOrg, getOrgCompetitions } from "@/lib/data/recruit";
import { dayLabel } from "@/lib/format/time";
import { COMPETITION_STATUS_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Competitions" };

/** /recruit/competitions (PRD 5.20): one skill competition a quarter on the Growth plan; every brief is reviewed. */
export default async function CompetitionsPage() {
  const org = await getMyOrg();
  if (org?.status !== "verified") {
    return <EmptyState title="Competitions open when you're verified" description="Once a Skilient reviewer verifies your organisation, a plan with competitions lets you run one skill competition a quarter." />;
  }
  const { entitled, items } = await getOrgCompetitions();
  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-h1">Competitions</h1>
        {entitled ? <Button asChild><Link href={"/recruit/competitions/new" as Route}>New competition</Link></Button> : null}
      </div>
      {!entitled ? (
        <EmptyState icon={<Trophy aria-hidden className="size-8" />} title="Competitions aren't part of your plan yet" description="Growth plans can run one competition a quarter: a brief, a deadline, teams of up to three, a prize and a rubric. Participants earn L3 evidence and the winner a badge that counts toward L4." />
      ) : items.length === 0 ? (
        <EmptyState icon={<Trophy aria-hidden className="size-8" />} title="No competitions yet" description="Write a brief, set the dates and the prize, and a Skilient reviewer checks it before it opens to students." />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="competitions">
          {items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
              <div>
                <Link href={`/recruit/competitions/${c.id}` as Route} className="text-h4 underline-offset-4 hover:underline">{c.title}</Link>
                <p className="text-body-sm text-text-secondary">{dayLabel(c.starts_at)} to {dayLabel(c.ends_at)} · {c.teams} {c.teams === 1 ? "team" : "teams"}</p>
              </div>
              <Badge tone={c.status === "live" ? "success" : c.status === "rejected" ? "warning" : "neutral"}>{COMPETITION_STATUS_LABELS[c.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
