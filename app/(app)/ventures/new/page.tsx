import type { Metadata } from "next";
import Link from "next/link";
import { VentureForm } from "@/components/ventures/venture-form";
import { listTaxonomy } from "@/lib/data/skills";
import { getIdea } from "@/lib/data/teach";

export const metadata: Metadata = { title: "Start a venture" };

/** /ventures/new (PRD 5.7 "Create"): the creator becomes the first member and owner. */
export default async function NewVenturePage({ searchParams }: PageProps<"/ventures/new">) {
  const sp = await searchParams;
  const ideaId = typeof sp.idea === "string" ? sp.idea : null;
  const [skills, idea] = await Promise.all([listTaxonomy(), ideaId ? getIdea(ideaId) : Promise.resolve(null)]);
  // A closed or unknown idea falls back to the plain form.
  const from = idea?.isOpen ? idea : null;
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <Link href="/ventures" className="text-body-sm text-text-secondary underline underline-offset-4">
          Ventures
        </Link>
        <h1 className="mt-1 font-display text-h1">Start a venture</h1>
        <p className="mt-1 text-body text-text-secondary">You can change everything except the type later, until the venture is completed.</p>
      </div>
      <VentureForm
        skills={skills.map((s) => ({ id: s.id, name: s.name }))}
        defaultType={sp.type === "startup" ? "startup" : "project"}
        idea={from ? { id: from.id, title: from.title, brief: from.brief, skillIds: from.skills.map((s) => s.id), teamSize: from.teamSize, teacher: from.teacherName } : undefined}
      />
    </main>
  );
}
