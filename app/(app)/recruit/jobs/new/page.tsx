import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/recruit/job-forms";
import { getMyOrg, getTalentFacets } from "@/lib/data/recruit";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage() {
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const facets = await getTalentFacets();
  return (
    <main className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-h1">Post a job</h1>
      <JobForm job={null} skills={facets.skills} />
    </main>
  );
}
