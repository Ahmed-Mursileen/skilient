import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyForm } from "@/components/recruit/student-controls";
import { Badge } from "@/components/ui";
import { getPublicJob } from "@/lib/data/opportunities";
import { isRefusal } from "@/lib/data/rpc-json";
import { dayLabel } from "@/lib/format/time";
import { JOB_TYPE_LABELS, STAGE_LABELS, TIER_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Job" };

/** /opportunities/jobs/[id] (PRD 5.20): the role, its pay range and requirements, and one-click apply. */
export default async function JobPage({ params }: PageProps<"/opportunities/jobs/[id]">) {
  const { id } = await params;
  const job = await getPublicJob(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!job) notFound();
  const open = job.status === "live" && new Date(job.deadline) >= new Date(new Date().toDateString());
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1" data-testid="job-title">{job.title}</h1>
        <p className="text-body">
          <Link href={`/companies/${job.org.slug}` as Route} className="font-semibold underline underline-offset-4">{job.org.name}</Link> · {job.remote ? "Remote" : job.location} · {JOB_TYPE_LABELS[job.type]}
        </p>
        <p className="text-body-lg font-semibold" data-testid="job-pay">
          {job.currency} {job.salary_min.toLocaleString("en-GB")} to {job.salary_max.toLocaleString("en-GB")} per {job.pay_period}
        </p>
        <p className="text-body-sm text-text-secondary">{job.openings} {job.openings === 1 ? "opening" : "openings"} · apply by {dayLabel(job.deadline)}</p>
      </header>
      {job.min_tier || job.requirements.length > 0 ? (
        <section aria-labelledby="req-h" className="flex flex-col gap-2">
          <h2 id="req-h" className="text-h3">What they ask for</h2>
          <ul className="flex flex-wrap gap-2">
            {job.min_tier ? <li><Badge>{TIER_LABELS[job.min_tier]} tier or above</Badge></li> : null}
            {job.requirements.map((r) => (
              <li key={r.name}><Badge>{r.name} L{r.min_level}+</Badge></li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="desc-h" className="flex flex-col gap-2">
        <h2 id="desc-h" className="text-h3">About the role</h2>
        <p className="text-body whitespace-pre-line">{job.description}</p>
      </section>
      {job.application ? (
        <p className="rounded-md border border-border-default bg-bg-subtle px-3 py-2 text-body" data-testid="already-applied">
          You applied: <strong className="font-semibold">{STAGE_LABELS[job.application.stage]}</strong>.{" "}
          <Link href={`/opportunities/applications/${job.application.id}` as Route} className="font-semibold underline underline-offset-4">Track your application</Link>
        </p>
      ) : open ? (
        <ApplyForm jobId={job.id} unmet={job.unmet} />
      ) : (
        <p className="text-body-sm text-text-secondary">This job is closed to new applications.</p>
      )}
    </main>
  );
}
