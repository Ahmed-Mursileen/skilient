import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { IdeaForm } from "@/components/teach/idea-form";
import { Badge } from "@/components/ui";
import { setIdeaOpen } from "@/lib/actions/teach";
import { getIdea } from "@/lib/data/teach";
import { listTaxonomy } from "@/lib/data/skills";

export const metadata: Metadata = { title: "Idea" };

/** /teach/ideas/[id]: edit an idea, close or reopen it, and see the teams that started from it. */
export default async function IdeaPage({ params }: PageProps<"/teach/ideas/[id]">) {
  const { id } = await params;
  const [idea, skills] = await Promise.all([getIdea(id), listTaxonomy()]);
  if (!idea || idea.ventures === null) notFound();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/teach/ideas" className="text-body-sm text-text-secondary underline underline-offset-4">Ideas</Link>
          <h1 className="mt-1 font-display text-h1">{idea.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
            <Badge tone={idea.isOpen ? "success" : "neutral"}>{idea.isOpen ? "Open" : idea.status === "closed" ? "Closed" : "Full or past its deadline"}</Badge>
            {idea.teams} of {idea.maxTeams} teams started
          </p>
        </div>
        <ActionButton action={setIdeaOpen.bind(null, idea.id, idea.status !== "open")}>{idea.status === "open" ? "Close the idea" : "Reopen"}</ActionButton>
      </div>
      <section aria-labelledby="teams-h" className="flex flex-col gap-2">
        <h2 id="teams-h" className="text-h3">Teams</h2>
        {idea.ventures.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No team has started from this idea yet. Students see it under Explore → Project ideas.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="idea-teams">
            {idea.ventures.map((v) => (
              <li key={v.id}>
                <Link href={`/teach/ventures/${v.id}` as Route} className="underline underline-offset-4">{v.title}</Link>
                <span className="text-body-sm text-text-secondary"> · {v.members} members · {v.status.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="edit-h" className="flex flex-col gap-3">
        <h2 id="edit-h" className="text-h3">Details</h2>
        <IdeaForm
          skills={skills.map((s) => ({ id: s.id, name: s.name }))}
          draft={{
            id: idea.id,
            title: idea.title,
            brief: idea.brief,
            skills: idea.skills.map((s) => s.id),
            difficulty: idea.difficulty,
            teamSize: idea.teamSize,
            durationWeeks: idea.durationWeeks,
            deliverables: idea.deliverables,
            maxTeams: idea.maxTeams,
            deadline: idea.deadline ?? "",
            courseLabel: idea.courseLabel ?? "",
            audience: idea.audience,
            locked: idea.teams > 0,
          }}
        />
      </section>
    </main>
  );
}
