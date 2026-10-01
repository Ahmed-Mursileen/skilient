import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { BlockCompanyButton } from "@/components/recruit/student-controls";
import { Badge, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCompanyPage } from "@/lib/data/opportunities";
import { isRefusal } from "@/lib/data/rpc-json";
import { dayLabel } from "@/lib/format/time";
import { JOB_TYPE_LABELS } from "@/lib/recruit/constants";

export async function generateMetadata({ params }: PageProps<"/companies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " "), robots: { index: false, follow: false } };
}

/**
 * /companies/[slug] (PRD 5.20): signed-in people only (there are no public pages). Students read this
 * before answering a contact request. It never shows hiring or response statistics.
 */
export default async function CompanyPage({ params }: PageProps<"/companies/[slug]">) {
  const { slug } = await params;
  const [company, user] = await Promise.all([
    getCompanyPage(slug).catch((err: unknown) => {
      if (isRefusal(err, "P0002")) return null;
      throw err;
    }),
    getCurrentUser(),
  ]);
  if (!company) notFound();
  const student = user?.role === "student";
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-lg border border-border-default bg-bg-subtle font-display text-h2">{company.name.slice(0, 1).toUpperCase()}</span>
          <h1 className="font-display text-h1">{company.name}</h1>
          {company.status === "verified" ? <Badge tone="verified">Verified company</Badge> : <Badge tone="info" data-testid="company-preview">Preview: not verified yet</Badge>}
        </div>
        <p className="text-body text-text-secondary">
          {company.industry} · {company.size} people · {company.city}
        </p>
        <p className="text-body-sm">
          <a href={company.website} rel="noopener noreferrer nofollow" target="_blank" className="font-semibold underline underline-offset-4">{company.website.replace(/^https:\/\//, "")}</a>
        </p>
      </header>
      {company.about ? (
        <section aria-labelledby="about-h" className="flex flex-col gap-2">
          <h2 id="about-h" className="text-h3">About</h2>
          <p className="text-body whitespace-pre-line">{company.about}</p>
        </section>
      ) : null}
      {company.locations.length > 0 ? (
        <section aria-labelledby="loc-h" className="flex flex-col gap-2">
          <h2 id="loc-h" className="text-h3">Locations</h2>
          <p className="text-body">{company.locations.join(" · ")}</p>
        </section>
      ) : null}
      <section aria-labelledby="roles-h" className="flex flex-col gap-3">
        <h2 id="roles-h" className="text-h3">Open roles</h2>
        {company.roles.length === 0 ? (
          <EmptyState title="No open roles right now" description="Open roles appear here with their pay range." />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="company-roles">
            {company.roles.map((r) => (
              <li key={r.id} className="rounded-lg border border-border-default bg-bg-surface p-3">
                <Link href={`/opportunities/jobs/${r.id}` as Route} className="text-h4 underline-offset-4 hover:underline">{r.title}</Link>
                <p className="text-body-sm text-text-secondary">{JOB_TYPE_LABELS[r.type]} · {r.remote ? "Remote" : r.location} · apply by {dayLabel(r.deadline)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {student ? <BlockCompanyButton orgId={company.id} name={company.name} blocked={company.blocked} /> : null}
    </main>
  );
}
