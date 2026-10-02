import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { Badge } from "@/components/ui";
import { getUniversityRequests } from "@/lib/data/ops-leads";
import { staffRoles } from "@/lib/data/ops-trust";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Leads" };

/**
 * /ops/leads (PRD 5.1): "Request it" from the landing page, counted per email domain, as sales
 * leads for university onboarding. Accounts staff. Requesters' addresses never leave the database;
 * confirmed ones get the launch email once when the university opens.
 */
export default async function OpsLeadsPage() {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const requests = await getUniversityRequests();
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Leads">Universities students have asked for. Open one from its page; everyone who confirmed is emailed once.</PageTitle>
      <Section title="University requests" id="requests-h">
        <DataTable
          testId="ops-uni-requests"
          head={["University", "Domain", "Requests", "Confirmed", "Emailed", "Latest"]}
          empty="No requests yet."
          rows={requests.map((r) => [
            r.university_id ? (
              <span key="u" className="inline-flex flex-wrap items-center gap-2">
                <Link className="font-semibold underline" href={`/ops/universities/${r.university_id}` as Route}>
                  {r.university}
                </Link>
                {r.live ? <Badge tone="success">Open</Badge> : null}
              </span>
            ) : (
              <span key="u">{r.university ?? "Unknown"} (not in the HEC list)</span>
            ),
            <span key="d" className="font-mono text-code-sm">
              {r.domain}
            </span>,
            String(r.requests),
            String(r.confirmed),
            String(r.notified),
            ageLabel(r.latest),
          ])}
        />
      </Section>
    </main>
  );
}
