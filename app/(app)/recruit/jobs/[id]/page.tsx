import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/recruit/job-forms";
import { Badge } from "@/components/ui";
import { getMyOrg, getOrgJob, getTalentFacets } from "@/lib/data/recruit";
import { isRefusal } from "@/lib/data/rpc-json";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({ params }: PageProps<"/recruit/jobs/[id]">) {
  const { id } = await params;
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const job = await getOrgJob(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!job) notFound();
  const facets = await getTalentFacets();
  return (
    <main className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1">{job.title}</h1>
        <Badge tone={job.status === "live" ? "success" : "neutral"} data-testid="job-status">{job.status === "live" ? "Live" : job.status === "draft" ? "Draft" : "Closed"}</Badge>
      </div>
      {job.status !== "draft" ? (
        <p><Link href={`/recruit/jobs/${id}/applicants` as Route} className="font-semibold underline underline-offset-4">Open the applicant pipeline</Link></p>
      ) : null}
      <JobForm job={job} skills={facets.skills} />
    </main>
  );
}
