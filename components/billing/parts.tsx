import { Flask, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { DataTable } from "@/components/uni/page-parts";
import { ENTITLEMENT_LABELS, grantValue, INVOICE_KIND_LABELS, METHOD_LABELS, money, PLAN_STATUS_LABELS } from "@/lib/billing/constants";
import type { BillingOverview, InvoiceRow, PaymentRow, Quota, Subscription } from "@/lib/data/billing";
import { dayLabel } from "@/lib/format/time";

/** Shared pieces of the three billing pages (students, organisations, universities). */

export function TestModeBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-border-default bg-bg-subtle px-3 py-2 text-body-sm" data-testid="test-mode-banner">
      <Flask aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>Test mode: payments go through Skilient&apos;s simulated gateway and no real money is charged.</span>
    </p>
  );
}

export function PlanSummary({ sub, freeLabel, children }: { sub: Subscription | null; freeLabel: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-5" data-testid="plan-summary">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-h3" data-testid="plan-name">{sub ? `${sub.plan}${sub.interval === "year" ? " (yearly)" : sub.status === "trialing" ? "" : " (monthly)"}` : freeLabel}</p>
        {sub ? (
          <Badge tone={sub.status === "past_due" ? "warning" : sub.status === "trialing" ? "info" : "verified"} data-testid="plan-status">
            {PLAN_STATUS_LABELS[sub.status] ?? sub.status}
          </Badge>
        ) : null}
        {sub && !sub.live && sub.status !== "trialing" && sub.gateway !== "comp" ? <Badge tone="neutral">Test</Badge> : null}
      </div>
      {sub ? (
        <ul className="flex flex-col gap-1 text-body-sm text-text-secondary">
          {sub.status === "trialing" && sub.trial_ends_at ? <li>Free trial until {dayLabel(sub.trial_ends_at)}. It ends as Free unless you choose a plan.</li> : null}
          {sub.status === "active" ? (
            <li>
              {sub.cancel_at_period_end
                ? `Ends on ${dayLabel(sub.current_period_end)}; you keep everything until then.`
                : sub.gateway === "comp"
                  ? `Provided by Skilient until ${dayLabel(sub.current_period_end)}.`
                  : sub.payment_method === "card"
                    ? `Renews on ${dayLabel(sub.current_period_end)} on your saved card.`
                    : sub.next_period_paid
                      ? `Paid through the next period, which starts ${dayLabel(sub.current_period_end)}.`
                      : `Paid until ${dayLabel(sub.current_period_end)}. ${METHOD_LABELS[sub.payment_method] ?? ""}`}
            </li>
          ) : null}
          {sub.status === "past_due" && sub.grace_ends_at ? (
            <li className="text-text-error">The renewal payment failed. We retry automatically; everything keeps working until {dayLabel(sub.grace_ends_at)}.</li>
          ) : null}
          {sub.next_plan ? <li>Changes to {sub.next_plan} at renewal.</li> : null}
          {sub.po_number ? <li>Purchase order {sub.po_number}</li> : null}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

export function QuotaList({ overview, keys }: { overview: BillingOverview; keys: string[] }) {
  const values = overview.entitlements.values;
  const quotas = overview.entitlements.quotas;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="entitlement-list">
      {keys.map((k) => {
        const q = quotas[k] as Quota | null | undefined;
        return (
          <li key={k} className="flex items-center justify-between gap-3 rounded-md border border-border-muted px-3 py-2 text-body-sm">
            <span>{ENTITLEMENT_LABELS[k] ?? k}</span>
            <span className="font-semibold" data-testid={`ent-${k}`}>
              {q ? `${q.remaining} left of ${q.limit + q.extras}` : grantValue(values[k])}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function InvoiceTable({ invoices, pay }: { invoices: InvoiceRow[]; pay?: (i: InvoiceRow) => ReactNode }) {
  return (
    <DataTable
      testId="invoice-table"
      head={["Document", "Date", "Total", "Status", ""]}
      empty="No invoices or receipts yet."
      rows={invoices.map((i) => [
        <span key="n" className="flex flex-col">
          <a href={`/api/billing/invoice/${i.id}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-4" target="_blank" rel="noopener">
            <Receipt aria-hidden className="size-4" />
            {i.number}
          </a>
          <span className="text-caption text-text-secondary">{INVOICE_KIND_LABELS[i.kind]}{i.draft ? (i.live ? " · draft" : " · test") : ""}</span>
        </span>,
        dayLabel(i.issued_at),
        money(i.total, i.currency),
        i.status === "issued" ? (i.due_at ? `Due ${dayLabel(i.due_at)}` : "Issued") : i.status === "paid" ? "Paid" : "Void",
        i.status === "issued" && i.kind === "invoice" && pay ? pay(i) : "",
      ])}
    />
  );
}

export function PaymentTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <DataTable
      testId="payment-table"
      head={["Date", "For", "Amount", "Method", "Status"]}
      empty="No payments yet."
      rows={payments.map((p) => [
        dayLabel(p.created_at),
        p.kind.replace("_", " "),
        `${money(p.amount, p.currency)}${p.live ? "" : " (test)"}`,
        p.method.replace("_", " "),
        p.status === "succeeded" ? "Paid" : p.status === "refunded" ? "Refunded" : `Partly refunded (${money(p.refunded_amount, p.currency)})`,
      ])}
    />
  );
}
