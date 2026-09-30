import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, SkillChip } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getIdea } from "@/lib/data/teach";
import { AUDIENCE_LABELS, DIFFICULTY_LABELS } from "@/lib/teach/constants";

export const metadata: Metadata = { title: "Project idea", robots: { index: false, follow: false } };

/** /ideas/[id] (PRD 5.21): a teacher's project idea, with "Start a venture from this idea" for students. */
export default async function IdeaPage({ params }: PageProps<"/ideas/[id]">) {
  const { id } = await params;
  const [idea, user] = await Promise.all([getIdea(id), getCurrentUser()]);
  if (!idea) notFound();
  const student = user?.role === "student";
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <Link href="/explore?tab=ideas" className="text-body-sm text-text-secondary underline underline-offset-4">Project ideas</Link>
        <h1 className="mt-1 font-display text-h1">{idea.title}</h1>
        <p className="mt-1 text-body-sm text-text-secondary">
          By {idea.teacherName}, {idea.teacherLine}
          {idea.formerFaculty ? " (former faculty)" : ""} · {idea.university}
          {idea.courseLabel ? ` · ${idea.courseLabel}` : ""}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={idea.isOpen ? "success" : "neutral"}>{idea.isOpen ? "Open" : "Closed"}</Badge>
          <Badge>{DIFFICULTY_LABELS[idea.difficulty]}</Badge>
          <Badge>{AUDIENCE_LABELS[idea.audience]}</Badge>
        </p>
      </div>
      <p className="text-body whitespace-pre-line">{idea.brief}</p>
      <dl className="grid gap-3 rounded-lg border border-border-default bg-bg-surface p-4 sm:grid-cols-2">
        <div><dt className="text-caption font-semibold text-text-secondary uppercase">Team</dt><dd>{idea.teamSize} people</dd></div>
        <div><dt className="text-caption font-semibold text-text-secondary uppercase">Duration</dt><dd>{idea.durationWeeks} weeks</dd></div>
        <div><dt className="text-caption font-semibold text-text-secondary uppercase">Teams started</dt><dd>{idea.teams} of {idea.maxTeams}</dd></div>
        <div><dt className="text-caption font-semibold text-text-secondary uppercase">Deadline</dt><dd>{idea.deadlineLabel ?? "None"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-caption font-semibold text-text-secondary uppercase">Deliverables</dt><dd className="whitespace-pre-line">{idea.deliverables}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-1">{idea.skills.map((s) => <SkillChip key={s.id} name={s.name} />)}</div>
      {student && idea.isOpen ? (
        <Button asChild className="self-start">
          <Link href={`/ventures/new?idea=${idea.id}`}>Start a venture from this idea</Link>
        </Button>
      ) : student ? (
        <p className="text-body-sm text-text-secondary">This idea is closed: it reached its team limit or its deadline.</p>
      ) : null}
    </main>
  );
}
