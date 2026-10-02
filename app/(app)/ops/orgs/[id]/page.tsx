import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrgDecisionForm } from "@/components/ops/org-forms";
import { OrgSanctionForm } from "@/components/ops/sanction-forms";
import { Badge } from "@/components/ui";
import { getOpsOrgCase, getOpsReputation } from "@/lib/data/ops-orgs";
import { staffRoles } from "@/lib/data/ops-trust";
import { isRefusal } from "@/lib/data/rpc-json";
import { ageLabel } from "@/lib/format/time";
import { ORG_ROLE_LABELS, ORG_STATUS_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Organisation" };

/** One organisation for review: the evidence, the team, the audit trail and (staff only) how its requests fare. */
export default async function OpsOrgPage({ params }: PageProps<"/ops/orgs/[id]">) {
  const { id } = await params;
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const org = await getOpsOrgCase(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!org) notFound();
  const rep = await getOpsReputation(id);
  const host = (() => {
    try {
      return new URL(org.website).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <p><Link href={"/ops/orgs" as Route} className="text-body-sm font-semibold underline underline-offset-4">All organisations</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1">{org.name}</h1>
        <Badge data-testid="org-case-status">{ORG_STATUS_LABELS[org.status]}</Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-body-sm">
        <Row k="Website"><a href={org.website} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{org.website}</a></Row>
        <Row k="Email domain"><span className="font-mono text-code-sm">{org.domain}</span> {host === org.domain || host.endsWith(`.${org.domain}`) ? "matches the website" : "does not obviously match the website"}</Row>
        <Row k="LinkedIn">{org.linkedin_url ? <a href={org.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{org.linkedin_url}</a> : "Not given"}</Row>
        <Row k="Registration number">{org.registration_number ?? "Not given"}</Row>
        <Row k="Industry and size">{org.industry}, {org.size} people</Row>
        <Row k="City">{org.city}</Row>
        <Row k="Signer's role">{org.signer_role}</Row>
        <Row k="Asked">{ageLabel(org.created_at)}</Row>
      </dl>
      <section aria-labelledby="team-h" className="flex flex-col gap-2">
        <h2 id="team-h" className="text-h3">Team</h2>
        <ul className="flex flex-col gap-1 text-body-sm">
          {org.members.map((m) => (
            <li key={m.email}>{m.name}, <span className="font-mono text-code-sm">{m.email}</span> · {ORG_ROLE_LABELS[m.role]}{m.status === "inactive" ? " (removed)" : ""}</li>
          ))}
        </ul>
      </section>
      <OrgDecisionForm orgId={org.id} status={org.status} />
      {org.status_reason ? <p className="text-body-sm text-text-secondary">Current reason shown to the organisation: {org.status_reason}</p> : null}
      <section aria-labelledby="rep-h" className="flex flex-col gap-2">
        <h2 id="rep-h" className="text-h3">Contact requests, last 30 days (staff only)</h2>
        <p className="text-body-sm" data-testid="org-stats">
          {rep.stats.requests_30d} sent · response rate {pct(rep.stats.response_rate)} · decline rate {pct(rep.stats.decline_rate)} · median response {rep.stats.median_response_hours ?? "n/a"} hours
        </p>
        {rep.reviews.length > 0 ? <p className="text-body-sm">Spam reviews: {rep.reviews.map((r) => `${r.status} (${pct(r.rate)} of ${r.requests})`).join(", ")}</p> : null}
        <details>
          <summary className="cursor-pointer text-body-sm font-semibold">Recent searches ({rep.searches.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {rep.searches.map((s, i) => (
              <li key={i}><span className="font-mono text-code-sm">{JSON.stringify(s.filters)}</span> · {s.mode} · {s.results} results · {s.by ?? "?"} · {ageLabel(s.at)}</li>
            ))}
          </ul>
        </details>
      </section>
      <section aria-labelledby="hist-h" className="flex flex-col gap-2">
        <h2 id="hist-h" className="text-h3">History</h2>
        {org.history.length === 0 ? <p className="text-body-sm text-text-secondary">No decisions yet.</p> : (
          <ul className="flex flex-col gap-1 text-body-sm">
            {org.history.map((h, i) => (
              <li key={i}>{h.action}: {h.reason} · {ageLabel(h.at)}</li>
            ))}
          </ul>
        )}
      </section>
      {org.status === "verified" ? <OrgSanctionForm orgId={id} name={org.name} /> : null}
      <p className="text-body-sm">
        <Link href={"/ops/sanctions" as Route} className="underline underline-offset-4">Active sanctions</Link> (lift a throttle or suspension there)
      </p>
    </main>
  );
}

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-text-secondary">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
