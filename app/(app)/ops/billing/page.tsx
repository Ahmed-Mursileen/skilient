import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { Card, DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { opsCloseTask, opsIssueLicence, opsResolveHireFee, opsSetTaxRate } from "@/lib/actions/ops/billing";
import { money, PROVINCES } from "@/lib/billing/constants";
import { opsBillingSearch, opsBillingTasks, opsGatewayReadiness, opsRevenue } from "@/lib/data/billing";
import { staffRoles } from "@/lib/data/ops-trust";
import { cn } from "@/lib/cn";
import { dayLabel, eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Billing" };

const TABS = [
  { id: "accounts", label: "Accounts and tasks" },
  { id: "revenue", label: "Revenue" },
  { id: "gateways", label: "Gateways and tax" },
] as const;

const TASK_LABELS: Record<string, string> = {
  offer_follow_up: "Offer open 45 days (unreported hire?)",
  unreported_hire: "Unreported hire",
  amount_mismatch: "Payment amount didn't match",
  licence_request: "Licence request",
  hire_fee_dispute: "Hiring-fee dispute",
  event_failed: "Gateway event failed",
};

/** /ops/billing (PRD 4b.11): accounts staff on two-factor. Every write is audited with before and after. */
export default async function OpsBillingPage({ searchParams }: PageProps<"/ops/billing">) {
  const roles = await staffRoles();
  if (!roles.has("accounts")) notFound();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "accounts";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title="Billing" />
      <nav aria-label="Billing areas" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={(t.id === "accounts" ? "/ops/billing" : `/ops/billing?tab=${t.id}`) as Route}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn("inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap", tab === t.id ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "accounts" ? <Accounts q={q} /> : tab === "revenue" ? <Revenue /> : <Gateways />}
    </main>
  );
}

async function Accounts({ q }: { q: string }) {
  const [hits, tasks] = await Promise.all([q ? opsBillingSearch(q) : Promise.resolve([]), opsBillingTasks()]);
  return (
    <>
      <Section title="Find a student, organisation or university" id="find-h">
        <form method="get" action="/ops/billing" className="flex flex-wrap items-end gap-2" role="search">
          <label className="flex flex-col gap-1 text-body-sm font-semibold">
            Name, username, domain or id
            <input name="q" defaultValue={q} className="h-11 rounded-md border border-border-default bg-bg-surface px-3 text-body font-normal" data-testid="billing-search" />
          </label>
          <button type="submit" className="h-11 rounded-md bg-primary px-4 font-semibold text-text-on-primary">Search</button>
        </form>
        {q ? (
          <DataTable
            testId="billing-hits"
            head={["Account", "Kind", "Plan"]}
            empty="Nothing matches."
            rows={hits.map((h) => [
              <Link key={h.id} href={`/ops/billing/${h.type}/${h.id}` as Route} className="font-semibold underline underline-offset-4">{h.name}</Link>,
              `${h.type === "user" ? "Student" : h.type === "org" ? "Organisation" : "University"} · ${h.detail}`,
              h.plan ?? "",
            ])}
          />
        ) : null}
      </Section>
      <Section title="Tasks" id="tasks-h">
        <DataTable
          testId="billing-tasks"
          head={["Task", "Account", "Detail", "Since", ""]}
          empty="Nothing waiting."
          rows={tasks.map((t) => [
            TASK_LABELS[t.kind] ?? t.kind,
            t.subject_type && t.subject_id ? <Link key="a" href={`/ops/billing/${t.subject_type}/${t.subject_id}` as Route} className="underline underline-offset-4">{t.name}</Link> : (t.name ?? ""),
            <span key="d" className="text-caption">{Object.entries(t.detail ?? {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</span>,
            dayLabel(t.created_at),
            t.kind === "hire_fee_dispute" ? (
              <RpcForm key={t.id} action={opsResolveHireFee as FormAction} extra={{ id: t.id }} submitLabel="Resolve" fields={[
                { name: "outcome", label: "Outcome", type: "select", options: [{ value: "void", label: "Void (dispute upheld)" }, { value: "waived", label: "Waive" }, { value: "paid", label: "Fee stands" }] },
                { name: "reason", label: "Reason", type: "text", required: true },
              ]} />
            ) : t.kind === "event_failed" ? "" : (
              <RpcForm key={t.id} action={opsCloseTask as FormAction} extra={{ id: t.id }} submitLabel="Close" fields={[{ name: "note", label: "What was done", type: "text", required: true }]} />
            ),
          ])}
        />
      </Section>
    </>
  );
}

async function Revenue() {
  const r = await opsRevenue();
  const churn = r.churn_30_days.active_at_start ? Math.round((r.churn_30_days.ended / r.churn_30_days.active_at_start) * 1000) / 10 : 0;
  return (
    <>
      <p className="text-body-sm text-text-secondary">Live money only: test payments ({r.test_payments_30_days} in the last 30 days) and comp plans ({r.comp_count} running) are never counted.</p>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="revenue-cards">
        <Card><p className="text-caption text-text-secondary">MRR</p><p className="font-display text-h2">{Object.keys(r.mrr).length ? Object.entries(r.mrr).map(([c, v]) => money(v, c)).join(" + ") : "PKR 0"}</p></Card>
        <Card><p className="text-caption text-text-secondary">Churn, last 30 days</p><p className="font-display text-h2">{churn}%</p><p className="text-caption text-text-secondary">{r.churn_30_days.ended} of {r.churn_30_days.active_at_start}</p></Card>
        <Card><p className="text-caption text-text-secondary">Hiring fees open</p><p className="font-display text-h2">{money(r.hire_fees_open, "PKR")}</p></Card>
      </div>
      <Section title="Active subscriptions by plan" id="plans-h">
        <DataTable head={["Plan", "Audience", "Active"]} empty="No paid subscriptions yet." rows={r.active_by_plan.map((p) => [`${p.plan} (${p.interval}ly)`, p.audience, p.count])} />
      </Section>
      <Section title="Money in, last 30 days (net of refunds)" id="in-h">
        <DataTable head={["Kind", "Currency", "Amount"]} empty="Nothing yet." rows={Object.entries(r.last_30_days).map(([k, v]) => { const [kind, cur] = k.split(":"); return [kind.replace("_", " "), cur, money(v, cur)]; })} />
      </Section>
    </>
  );
}

async function Gateways() {
  const g = await opsGatewayReadiness();
  return (
    <>
      <Section title="Gateway readiness" id="gw-h">
        <p className="text-body-sm text-text-secondary">
          {g.production ? "Production." : "Not production (preview or local)."} The simulated gateway is {g.simulatedAllowed ? "allowed here" : "refused here"}.
          Billing live mode (invoices without a gateway payment) is {g.activity.live_mode ? "on" : "off: hiring-fee and licence invoices are TEST"}. Company details on invoices are {g.activity.company_complete ? "complete" : "missing (invoices say DRAFT)"}.
        </p>
        <DataTable
          testId="gateway-readiness"
          head={["Gateway", "Role", "Configured", "Mode", "In use", "Last webhook", "Missing"]}
          rows={g.adapters.map((a) => [
            a.id,
            a.role === "local" ? "PKR" : a.role === "mor" ? "USD (merchant of record)" : "Test",
            a.configured ? <Badge key="c" tone="success">Yes</Badge> : <Badge key="c" tone="warning">No</Badge>,
            a.mode,
            a.usable ? "Yes" : "No",
            a.last_received_at ? `${eventTime(a.last_received_at)} (${a.events_24h} in 24 h${a.failed ? `, ${a.failed} failed` : ""})` : "Never",
            a.missing.join(", "),
          ])}
        />
        <p className="text-caption text-text-secondary">Queued: {g.activity.queue.events} events, {g.activity.queue.jobs} worker jobs. Setup steps: docs/setup-checklist.md, &ldquo;Switching to a real gateway&rdquo;.</p>
      </Section>
      <Section title="Sales tax rates" id="tax-h">
        <DataTable head={["Province", "Label", "Rate", "From"]} empty="No rates yet: PKR invoices to organisations say the rate is missing." rows={g.activity.tax_rates.map((t) => [t.province, t.label, `${(Number(t.rate) * 100).toFixed(2)}%`, dayLabel(t.effective_from)])} />
        <RpcForm action={opsSetTaxRate as FormAction} after="reset" submitLabel="Add rate" testId="tax-form" fields={[
          { name: "province", label: "Province", type: "select", options: PROVINCES.map((p) => ({ value: p, label: p })) },
          { name: "label", label: "Label on invoices", type: "text", required: true, placeholder: "Punjab sales tax on services" },
          { name: "ratePercent", label: "Rate (%)", type: "number", required: true },
          { name: "from", label: "Applies from", type: "date", required: true },
          { name: "reason", label: "Source (e.g. accountant's advice)", type: "text", required: true },
        ]} />
      </Section>
      <Section title="Issue a university licence" id="lic-h">
        <p className="text-body-sm text-text-secondary">Active on issue; the invoice is due in 30 days with the PO number. Find the university&apos;s id under Accounts. Renewals can be issued in a licence&apos;s last 60 days.</p>
        <RpcForm action={opsIssueLicence as FormAction} after="reset" submitLabel="Issue licence and invoice" testId="licence-form" fields={[
          { name: "universityId", label: "University id", type: "text", required: true },
          { name: "level", label: "Licence", type: "select", options: [{ value: "basic", label: "Basic" }, { value: "growth", label: "Growth" }, { value: "campus", label: "Campus" }] },
          { name: "startsOn", label: "Starts on (empty: today)", type: "date" },
          { name: "po", label: "Purchase order number", type: "text", required: true },
          { name: "reason", label: "Reason", type: "text", required: true },
        ]} />
      </Section>
    </>
  );
}
