import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentTable, QuotaList } from "@/components/billing/parts";
import { Badge } from "@/components/ui";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { opsCompPlan, opsEndSubscription, opsGrant, opsMarkPaid, opsQuotaOverride, opsRefund, opsRevokeGrant, opsSimulate, opsVoidInvoice } from "@/lib/actions/ops/billing";
import { ENTITLEMENT_LABELS, grantValue, INVOICE_KIND_LABELS, money, PLAN_STATUS_LABELS } from "@/lib/billing/constants";
import { opsBillingSubject, type BillingOverview, type OpsSubject } from "@/lib/data/billing";
import { isRefusal } from "@/lib/data/rpc-json";
import { staffRoles } from "@/lib/data/ops-trust";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Billing account" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS: Record<string, { value: string; label: string }[]> = {
  user: [{ value: "student_pro_monthly", label: "Student Pro (monthly)" }, { value: "student_pro_yearly", label: "Student Pro (yearly)" }],
  org: [
    { value: "recruiter_starter_monthly", label: "Starter" },
    { value: "recruiter_growth_monthly", label: "Growth" },
    { value: "recruiter_enterprise_yearly", label: "Enterprise" },
  ],
  university: [{ value: "uni_basic_yearly", label: "Basic" }, { value: "uni_growth_yearly", label: "Growth" }, { value: "uni_campus_yearly", label: "Campus" }],
};

/** One account's billing for accounts staff (PRD 4b.11): grants, overrides, comp plans, invoices, refunds, test tools. */
export default async function OpsBillingSubjectPage({ params }: PageProps<"/ops/billing/[type]/[id]">) {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const { type, id } = await params;
  if (!["user", "org", "university"].includes(type) || !UUID.test(id)) notFound();
  let s: OpsSubject;
  try {
    s = await opsBillingSubject(type as OpsSubject["type"], id);
  } catch (e) {
    if (isRefusal(e, "P0002", "42501")) notFound();
    throw e;
  }
  const keys = Object.keys(s.entitlements.values).sort();
  const running = s.subscriptions.find((x) => ["trialing", "active", "past_due"].includes(x.status));
  const extra = { type, subjectId: id };
  return (
    <main className="flex flex-col gap-8">
      <p><Link href={"/ops/billing" as Route} className="text-body-sm underline underline-offset-4">Billing</Link></p>
      <PageTitle title={s.name}>{type === "user" ? "Student" : type === "org" ? "Organisation" : "University"} · {id}</PageTitle>

      <Section title="Entitlements now" id="ent-h">
        <QuotaList overview={{ entitlements: s.entitlements } as BillingOverview} keys={keys} />
      </Section>

      <Section title="Subscriptions" id="subs-h">
        <DataTable
          testId="ops-subscriptions"
          head={["Plan", "Status", "Gateway", "Period", "Ended", ""]}
          empty="No subscriptions."
          rows={s.subscriptions.map((x) => [
            `${x.plan}${x.interval === "year" ? " (yearly)" : ""}`,
            <span key="s" className="flex flex-wrap gap-1"><Badge tone={x.status === "past_due" ? "warning" : "neutral"}>{PLAN_STATUS_LABELS[x.status]}</Badge>{x.live ? null : <Badge tone="info">Test</Badge>}{x.simulate_fail_next ? <Badge tone="warning">Next charge fails</Badge> : null}</span>,
            `${x.gateway} · ${x.payment_method}`,
            `${dayLabel(x.current_period_start)} – ${dayLabel(x.current_period_end)}`,
            x.ended_at ? `${dayLabel(x.ended_at)} (${x.ended_reason ?? ""})` : "",
            x.id === running?.id ? (
              <div key="a" className="flex flex-col gap-2">
                {!x.live || ["comp", "none"].includes(x.gateway) ? (
                  <RpcForm action={opsSimulate as FormAction} extra={{ ...extra, id: x.id }} submitLabel="Run" testId="simulate-form" fields={[
                    { name: "action", label: "Test tool", type: "select", options: [
                      { value: "renew_now", label: "End the period now (renew)" },
                      { value: "fail_next", label: "Make the next charge fail" },
                      { value: "retry_now", label: "Retry a failed renewal now" },
                      { value: "end_grace", label: "End the grace period now" },
                    ] },
                    { name: "reason", label: "Reason", type: "text", required: true },
                  ]} />
                ) : null}
                <RpcForm action={opsEndSubscription as FormAction} extra={{ ...extra, id: x.id }} submitLabel="End now" fields={[{ name: "reason", label: "Reason", type: "text", required: true }]} />
              </div>
            ) : "",
          ])}
        />
        {!running || running.status === "trialing" ? (
          <RpcForm action={opsCompPlan as FormAction} extra={{ type, id }} after="refresh" submitLabel="Give a comp plan" testId="comp-form" fields={[
            { name: "planId", label: "Plan", type: "select", options: PLANS[type] ?? [] },
            { name: "months", label: "Months", type: "number", required: true, defaultValue: 6 },
            { name: "po", label: "PO or contract reference (optional)", type: "text" },
            { name: "reason", label: "Reason", type: "text", required: true },
          ]} />
        ) : null}
      </Section>

      <Section title="Grants" id="grants-h">
        <RpcForm action={opsGrant as FormAction} extra={{ type, id }} after="refresh" submitLabel="Add grant" testId="grant-form" fields={[
          { name: "key", label: "Entitlement", type: "select", options: keys.map((k) => ({ value: k, label: ENTITLEMENT_LABELS[k] ?? k })) },
          { name: "value", label: "Value (true, a number, or a level such as growth)", type: "text", required: true },
          { name: "endsAt", label: "Expires", type: "date", required: true },
          { name: "reason", label: "Reason", type: "text", required: true },
        ]} />
        <DataTable
          testId="ops-grants"
          head={["Key", "Value", "Source", "From – until", "Reason", ""]}
          empty="No grants."
          rows={s.grants.map((g) => [
            g.key,
            `${grantValue(g.value)}${g.consumed ? ` (${g.consumed} used)` : ""}`,
            g.source,
            `${dayLabel(g.starts_at)} – ${g.ends_at ? dayLabel(g.ends_at) : "open"}`,
            g.revoked_at ? `Revoked: ${g.revoked_reason}` : (g.reason ?? ""),
            g.active && g.source === "admin" ? <RpcForm key={g.id} action={opsRevokeGrant as FormAction} extra={{ ...extra, id: g.id }} submitLabel="Revoke" fields={[{ name: "reason", label: "Reason", type: "text", required: true }]} /> : g.active ? "Active" : "",
          ])}
        />
      </Section>

      <Section title="Usage counters" id="use-h">
        <DataTable head={["Key", "Period from", "Used"]} empty="Nothing metered yet." rows={s.counters.map((c) => [c.key, dayLabel(c.period_start), c.used])} />
        <RpcForm action={opsQuotaOverride as FormAction} extra={{ type, id }} after="refresh" submitLabel="Set this period's use" fields={[
          { name: "key", label: "Metered entitlement", type: "select", options: keys.filter((k) => s.entitlements.quotas[k]).map((k) => ({ value: k, label: ENTITLEMENT_LABELS[k] ?? k })) },
          { name: "used", label: "Used this period", type: "number", required: true, defaultValue: 0 },
          { name: "reason", label: "Reason", type: "text", required: true },
        ]} />
      </Section>

      <Section title="Invoices" id="inv-h">
        <DataTable
          testId="ops-invoices"
          head={["Document", "Total", "Status", ""]}
          empty="No invoices."
          rows={s.invoices.map((i) => [
            <a key="n" href={`/api/billing/invoice/${i.id}`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-4">{i.number} · {INVOICE_KIND_LABELS[i.kind]}</a>,
            money(i.total, i.currency),
            i.status === "issued" ? `Unpaid${i.due_at ? `, due ${dayLabel(i.due_at)}` : ""}` : i.status,
            i.status === "issued" && i.kind === "invoice" ? (
              <div key="a" className="flex flex-col gap-2">
                <RpcForm action={opsMarkPaid as FormAction} extra={{ id: i.id }} submitLabel="Mark paid" fields={[
                  { name: "reference", label: "Bank reference", type: "text", required: true },
                  { name: "reason", label: "Reason", type: "text", required: true },
                ]} />
                <RpcForm action={opsVoidInvoice as FormAction} extra={{ id: i.id }} submitLabel="Void" fields={[{ name: "reason", label: "Reason", type: "text", required: true }]} />
              </div>
            ) : "",
          ])}
        />
      </Section>

      <Section title="Payments" id="pay-h">
        <PaymentTable payments={s.payments} />
        <DataTable
          head={["Payment", "Refund"]}
          empty="Nothing to refund."
          rows={s.payments.filter((p) => p.status !== "refunded").map((p) => [
            `${dayLabel(p.created_at)} · ${money(p.amount, p.currency)} · ${p.gateway}`,
            <RpcForm key={p.id} action={opsRefund as FormAction} extra={{ id: p.id }} submitLabel="Refund" fields={[
              { name: "amount", label: `Amount (empty: all of ${money(p.amount - p.refunded_amount, p.currency)})`, type: "number" },
              { name: "reason", label: "Reason", type: "text", required: true },
            ]} />,
          ])}
        />
      </Section>

      {s.hire_fees.length ? (
        <Section title="Hiring fees" id="fees-h">
          <DataTable head={["Kind", "Amount", "Status", "Dispute"]} rows={s.hire_fees.map((f) => [f.kind, money(f.amount, "PKR"), f.status, f.dispute_reason ?? ""])} />
        </Section>
      ) : null}
    </main>
  );
}
