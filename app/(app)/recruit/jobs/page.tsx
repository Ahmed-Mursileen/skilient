import { Briefcase } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState } from "@/components/ui";
import { getMyOrg, getOrgJobs } from "@/lib/data/recruit";
import { dayLabel } from "@/lib/format/time";
import { JOB_TYPE_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Jobs" };

/** /recruit/jobs (PRD 5.20): drafts, live and closed posts. A live post needs a free job slot. */
export default async function JobsPage() {
  const org = await getMyOrg();
  if (org?.status !== "verified") {
    return <EmptyState title="Jobs open when you're verified" description="Once a Skilient reviewer verifies your organisation you can post jobs and internships." />;
  }
  const { jobs, slots_limit: slots } = await getOrgJobs();
  const live = jobs.filter((j) => j.status === "live").length;
  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1">Jobs</h1>
          <p className="text-body-sm text-text-secondary" data-testid="slots">{live} of {slots ?? 0} live job slots in use</p>
        </div>
        <Button asChild><Link href={"/recruit/jobs/new" as Route}>Post a job</Link></Button>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={<Briefcase aria-hidden className="size-8" />} title="No jobs yet" description="Every post needs a stipend or salary range. Students apply in one click with their live CV." />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="jobs">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
              <div>
                <Link href={`/recruit/jobs/${j.id}` as Route} className="text-h4 underline-offset-4 hover:underline">{j.title}</Link>
                <p className="text-body-sm text-text-secondary">
                  {JOB_TYPE_LABELS[j.type]} · {j.remote ? "Remote" : j.location} · apply by {dayLabel(j.deadline)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={j.status === "live" ? "success" : "neutral"}>{j.status === "live" ? "Live" : j.status === "draft" ? "Draft" : "Closed"}</Badge>
                {j.status !== "draft" ? (
                  <Link href={`/recruit/jobs/${j.id}/applicants` as Route} className="text-body-sm font-semibold underline underline-offset-4">{j.applicants} applicants · {j.hired}/{j.openings} hired</Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
