import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompetitionForm } from "@/components/recruit/competition-forms";
import { getMyOrg, getOrgCompetitions, getTalentFacets } from "@/lib/data/recruit";

export const metadata: Metadata = { title: "New competition" };

export default async function NewCompetitionPage() {
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const [{ entitled }, facets] = await Promise.all([getOrgCompetitions(), getTalentFacets()]);
  if (!entitled) notFound();
  return (
    <main className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-h1">New competition</h1>
      <CompetitionForm existing={null} skills={facets.skills} universities={facets.universities} />
    </main>
  );
}
