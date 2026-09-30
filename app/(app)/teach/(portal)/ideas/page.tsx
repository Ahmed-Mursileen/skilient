import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState } from "@/components/ui";
import { getIdeas } from "@/lib/data/teach";
import { AUDIENCE_LABELS, DIFFICULTY_LABELS } from "@/lib/teach/constants";

export const metadata: Metadata = { title: "Ideas" };

/** /teach/ideas (PRD 5.21 "Project ideas"): the teacher's own ideas, open and closed. */
export default async function IdeasPage() {
  const ideas = await getIdeas({ mine: true });
  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1">Project ideas</h1>
        <Button asChild>
          <Link href="/teach/ideas/new">Post an idea</Link>
        </Button>
      </div>
      {ideas.length === 0 ? (
        <EmptyState
          icon={<Lightbulb aria-hidden className="size-8" />}
          title="No ideas yet"
          description="Post a project with its skills, size and deliverables. Students can start a venture from it, and you're invited to supervise."
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="my-ideas">
          {ideas.map((i) => (
            <li key={i.id}>
              <Link href={`/teach/ideas/${i.id}` as Route} className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 hover:bg-bg-subtle">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-h4">{i.title}</span>
                  <Badge tone={i.isOpen ? "success" : "neutral"}>{i.isOpen ? "Open" : i.status === "closed" ? "Closed" : "Full or past its deadline"}</Badge>
                </div>
                <p className="text-body-sm text-text-secondary">
                  {DIFFICULTY_LABELS[i.difficulty]} · teams of {i.teamSize} · {i.durationWeeks} weeks · {i.teams} of {i.maxTeams} teams started · {AUDIENCE_LABELS[i.audience]}
                  {i.deadlineLabel ? ` · until ${i.deadlineLabel}` : ""}
                  {i.courseLabel ? ` · ${i.courseLabel}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
