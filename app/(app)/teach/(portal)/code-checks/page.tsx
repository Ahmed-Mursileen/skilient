import { Code } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getTeacherCodeChecks, getTeacherHome } from "@/lib/data/teach";
import { STATUS_LABELS, type CodeCheckStatus } from "@/lib/code-checks/constants";

export const metadata: Metadata = { title: "Code checks" };

/**
 * /teach/code-checks (PRD 5.21 "Code-check grading"): checks from the teacher's university for the
 * skills they chose, oldest first, due in 72 hours. Unclaimed after 48 hours they move to Skilient.
 */
export default async function TeacherChecksPage({ searchParams }: PageProps<"/teach/code-checks">) {
  const sp = await searchParams;
  const tab = sp.tab === "graded" ? "graded" : "open";
  const [home, rows] = await Promise.all([getTeacherHome(), getTeacherCodeChecks(tab)]);
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Code checks</h1>
      {!home.gradingOptIn ? (
        <EmptyState
          icon={<Code aria-hidden className="size-8" />}
          title="Grading is off"
          description="Turn it on in settings, choose the skills you'll grade and a weekly limit. Checks wait for the university's teachers for 48 hours before they go to Skilient reviewers."
          action={<Link href="/teach/settings" className="font-semibold underline underline-offset-4">Open settings</Link>}
        />
      ) : (
        <>
          <p className="text-body-sm text-text-secondary">{home.gradingUsed} of {home.gradingCap} graded or held this week.</p>
          <nav aria-label="Code check status" className="border-b border-border-default">
            <ul className="-mb-px flex gap-1">
              {(["open", "graded"] as const).map((t) => (
                <li key={t}>
                  <Link
                    href={(t === "open" ? "/teach/code-checks" : "/teach/code-checks?tab=graded") as Route}
                    aria-current={tab === t ? "page" : undefined}
                    className={cn("inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold", tab === t ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}
                  >
                    {t === "open" ? "To grade" : "Graded by me"}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {rows.length === 0 ? (
            <EmptyState icon={<Code aria-hidden className="size-8" />} title={tab === "open" ? "Nothing to grade" : "Nothing graded yet"} description={tab === "open" ? "When a student at your university submits a check for one of your skills, it appears here." : "Checks you grade appear here for 60 days."} />
          ) : (
            <ul className="flex flex-col gap-3" data-testid="teacher-checks">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/teach/code-checks/${c.id}` as Route} className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4 hover:bg-bg-subtle">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-h4">{c.skill}</span>
                      {c.claimedByMe ? <Badge tone="info">Yours</Badge> : null}
                      {c.conflict ? <Badge tone="warning">You know this student</Badge> : null}
                      {c.status ? <Badge tone={c.status === "passed" ? "success" : "neutral"}>{STATUS_LABELS[c.status as CodeCheckStatus] ?? c.status}</Badge> : null}
                    </span>
                    <span className="text-body-sm text-text-secondary">
                      {c.student}
                      {tab === "open" ? ` · waiting ${c.waiting} · due ${c.dueLabel} · with teachers until ${c.handOverLabel}` : c.gradedLabel ? ` · graded ${c.gradedLabel}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
