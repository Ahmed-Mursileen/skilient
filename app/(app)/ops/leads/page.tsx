import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { Badge } from "@/components/ui";
import { RpcForm } from "@/components/uni/rpc-form";
import { updateSalesLead } from "@/lib/actions/ops/leads";
import { getSalesLeads, getUniversityRequests } from "@/lib/data/ops-leads";
import { staffRoles } from "@/lib/data/ops-trust";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Leads" };

const STATUS_LABEL = { new: "New", contacted: "Contacted", won: "Won", lost: "Lost" } as const;
const STATUS_TONE = { new: "warning", contacted: "info", won: "success", lost: "neutral" } as const;
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((value) => ({ value, label: STATUS_LABEL[value] }));

/**
 * /ops/leads (PRD 5.1): "Request it" from the landing page, counted per email domain, as sales
 * leads for university onboarding. Accounts staff. Requesters' addresses never leave the database;
 * confirmed ones get the launch email once when the university opens.
 */
export default async function OpsLeadsPage() {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const [requests, leads] = await Promise.all([getUniversityRequests(), getSalesLeads()]);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Leads">
        University officials who asked to talk, and universities students have asked for. Acting on a lead claims it; everyone who confirmed a request is emailed once when their university opens.
      </PageTitle>
      <Section title="Talk to us" id="sales-h">
        {leads.length ? (
          <ul className="flex flex-col gap-4" data-testid="ops-sales-leads">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="sales-lead">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-h4">{l.name}</span>
                  <span className="text-body-sm text-text-secondary">
                    {l.role}, {l.university ?? l.organisation}
                  </span>
                  <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                  <span className="text-body-sm text-text-muted">{ageLabel(l.created_at)}</span>
                </div>
                <p className="font-mono text-code-sm">{l.email}</p>
                <p className="max-w-[72ch] whitespace-pre-line text-body">{l.message}</p>
                {l.claimed_by ? <p className="text-body-sm text-text-secondary">{l.mine ? "You are working on this lead." : `${l.claimed_by} is working on this lead.`}</p> : null}
                {l.staff_note ? <p className="text-body-sm text-text-secondary">Note: {l.staff_note}</p> : null}
                {!l.claimed_by || l.mine ? (
                  <RpcForm
                    testId="lead-update"
                    action={updateSalesLead}
                    extra={{ lead: l.id }}
                    submitLabel={l.claimed_by ? "Update" : "Claim and update"}
                    fields={[
                      { name: "status", label: "Status", type: "select", required: true, defaultValue: l.status === "new" ? "contacted" : l.status, options: STATUS_OPTIONS },
                      { name: "note", label: "Note (optional)", type: "textarea", rows: 2 },
                    ]}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-text-secondary">No messages yet.</p>
        )}
      </Section>
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
