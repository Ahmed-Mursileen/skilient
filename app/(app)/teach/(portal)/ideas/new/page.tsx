import type { Metadata } from "next";
import { IdeaForm } from "@/components/teach/idea-form";
import { listTaxonomy } from "@/lib/data/skills";

export const metadata: Metadata = { title: "Post an idea" };

export default async function NewIdeaPage() {
  const skills = await listTaxonomy();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <h1 className="font-display text-h1">Post a project idea</h1>
      <IdeaForm skills={skills.map((s) => ({ id: s.id, name: s.name }))} />
    </main>
  );
}
