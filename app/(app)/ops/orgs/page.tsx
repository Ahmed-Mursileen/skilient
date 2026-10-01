import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getOpsOrgs } from "@/lib/data/ops-orgs";
import { staffRoles } from "@/lib/data/ops-trust";
import { ageLabel } from "@/lib/format/time";
import type { OrgStatus } from "@/lib/recruit/constants";
import { ORG_STATUS_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Organisations" };

const TABS: OrgStatus[] = ["pending", "verified", "suspended", "rejected"];

/** /ops/orgs (PRD 5.20, 5.26): accounts staff verify recruiter organisations, within 2 working days. */
export default async function OpsOrgsPage({ searchParams }: PageProps<"/ops/orgs">) {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.status) ?? "pending";
  const orgs = await getOpsOrgs(tab);
  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1">Organisations</h1>
        <nav aria-label="Other recruiter queues" className="flex gap-3 text-body-sm font-semibold">
          <Link href={"/ops/orgs/competitions" as Route} className="underline underline-offset-4">Competition briefs</Link>
          <Link href={"/ops/orgs/spam" as Route} className="underline underline-offset-4">Spam reviews</Link>
        </nav>
      </div>
      <nav aria-label="Organisation status" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {TABS.map((t) => (
            <li key={t}>
              <Link href={(t === "pending" ? "/ops/orgs" : `/ops/orgs?status=${t}`) as Route} aria-current={tab === t ? "page" : undefined} className={cn("inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold", tab === t ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>
                {t === "pending" ? "Waiting" : ORG_STATUS_LABELS[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {orgs.length === 0 ? (
        <EmptyState title="Nothing here" description="New organisations wait here for verification. Check the website, the work-email domain and, if given, the LinkedIn page and registration number." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[720px] text-left text-body-sm" data-testid="ops-orgs">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Company</th>
                <th scope="col" className="px-3 py-2 font-semibold">Domain</th>
                <th scope="col" className="px-3 py-2 font-semibold">Admin</th>
                <th scope="col" className="px-3 py-2 font-semibold">Asked</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {orgs.map((o) => (
                <tr key={o.id} data-testid="ops-org">
                  <td className="px-3 py-2 font-semibold"><Link href={`/ops/orgs/${o.id}` as Route} className="underline underline-offset-4">{o.name}</Link></td>
                  <td className="px-3 py-2 font-mono text-code-sm">{o.domain}</td>
                  <td className="px-3 py-2">{o.admin_name}</td>
                  <td className="px-3 py-2">{ageLabel(o.created_at)}</td>
                  <td className="px-3 py-2"><Badge>{ORG_STATUS_LABELS[o.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
