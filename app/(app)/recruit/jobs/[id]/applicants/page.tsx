import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicantBoard } from "@/components/recruit/applicant-board";
import { EmptyState } from "@/components/ui";
import { getApplicants, getMyOrg } from "@/lib/data/recruit";
import { isRefusal } from "@/lib/data/rpc-json";

export const metadata: Metadata = { title: "Applicants" };

export default async function ApplicantsPage({ params }: PageProps<"/recruit/jobs/[id]/applicants">) {
  const { id } = await params;
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const doc = await getApplicants(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!doc) notFound();
  return (
    <main className="flex flex-col gap-4">
      <p><Link href={`/recruit/jobs/${id}` as Route} className="text-body-sm font-semibold underline underline-offset-4">Back to the job</Link></p>
      <h1 className="font-display text-h1">{doc.job.title}: applicants</h1>
      {doc.applicants.length === 0 ? (
        <EmptyState title="No applicants yet" description="Students apply in one click with their live CV. Invite candidates from their page to get started." />
      ) : (
        <ApplicantBoard jobId={id} applicants={doc.applicants} />
      )}
    </main>
  );
}
