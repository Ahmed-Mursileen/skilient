import type { Metadata, Route } from "next";
import Link from "next/link";
import { OutcomeButtons } from "@/components/recruit/job-forms";
import { Badge } from "@/components/ui";
import { getHires, getMyOrg, getOrgContacts, getOrgJobs } from "@/lib/data/recruit";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Home" };

/** /recruit (PRD 5.20): where your organisation stands today and what is waiting for an answer. */
export default async function RecruitHomePage() {
  const org = await getMyOrg();
  if (!org) return null;
  if (org.status !== "verified") {
    return (
      <main className="flex max-w-2xl flex-col gap-4" data-testid="recruit-pending">
        <h1 className="font-display text-h1">Welcome, {org.name}</h1>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-body">
          <li>Two-factor sign-in is on.</li>
          <li>
            Build your <Link href={"/org/settings" as Route} className="font-semibold underline underline-offset-4">company page</Link>: students read it before they answer you.
          </li>
          <li>{org.status === "pending" ? "A Skilient reviewer verifies your company within 2 working days." : "Contact the Skilient team if you think this was a mistake."}</li>
          {org.role === "admin" ? <li>Invite teammates from <Link href={"/org/members" as Route} className="font-semibold underline underline-offset-4">Team</Link> once you&apos;re verified.</li> : null}
        </ol>
      </main>
    );
  }
  const [jobs, contacts, hires] = await Promise.all([getOrgJobs(), getOrgContacts(), getHires()]);
  const pendingContacts = contacts.filter((c) => c.status === "pending");
  const live = jobs.jobs.filter((j) => j.status === "live");
  const due = hires.filter((h) => h.due);
  return (
    <main className="flex flex-col gap-6">
      <section aria-labelledby="today-h" className="grid gap-3 sm:grid-cols-3">
        <h1 id="today-h" className="sr-only">Home</h1>
        <Tile label="Requests waiting for an answer" value={pendingContacts.length} href="/recruit/contacts" />
        <Tile label="Live jobs" value={live.length} href="/recruit/jobs" />
        <Tile label="Applicants to review" value={live.reduce((n, j) => n + j.applicants - j.hired, 0)} href="/recruit/jobs" />
      </section>
      {due.length > 0 ? (
        <section aria-labelledby="due-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5" data-testid="outcome-due">
          <h2 id="due-h" className="text-h3">Is this hire meeting expectations?</h2>
          <p className="text-body-sm text-text-secondary">Ninety days on, one question per hire. Answers feed Skilient&apos;s outcome signals and, in aggregate only, university placement statistics.</p>
          <ul className="flex flex-col gap-4">
            {due.map((h) => (
              <li key={h.id} className="flex flex-col gap-2">
                <p className="font-semibold">{h.student_name ?? "A former student"}, {h.job_title ?? "a role"}, hired {ageLabel(h.hired_at)}</p>
                <OutcomeButtons hireId={h.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="quick-h" className="flex flex-col gap-2">
        <h2 id="quick-h" className="text-h3">Start here</h2>
        <ul className="flex flex-wrap gap-2">
          <li><Link href={"/recruit/search" as Route} className="inline-flex h-10 items-center rounded-md border border-border-default bg-bg-surface px-4 font-semibold hover:bg-bg-subtle">Find talent</Link></li>
          <li><Link href={"/recruit/jobs/new" as Route} className="inline-flex h-10 items-center rounded-md border border-border-default bg-bg-surface px-4 font-semibold hover:bg-bg-subtle">Post a job</Link></li>
          <li><Link href={"/recruit/shortlists" as Route} className="inline-flex h-10 items-center rounded-md border border-border-default bg-bg-surface px-4 font-semibold hover:bg-bg-subtle">Your shortlists</Link></li>
        </ul>
        {hires.length > 0 ? <p className="mt-2 text-body-sm text-text-secondary"><Badge>{hires.length} hires</Badge> recorded so far.</p> : null}
      </section>
    </main>
  );
}

function Tile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href as Route} className="rounded-lg border border-border-default bg-bg-surface p-4 hover:border-border-strong">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-1 font-display text-h1">{value}</p>
    </Link>
  );
}
