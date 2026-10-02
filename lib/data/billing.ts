import "server-only";

import { rpcJson } from "@/lib/data/rpc-json";
import { gateways } from "@/lib/billing/gateways";
import type { SubjectKind } from "@/lib/billing/constants";
import { readiness, simulatedAllowed, gatewayFor, type GatewayReadiness } from "@/supabase/functions/_shared/billing/config.ts";

/**
 * Billing reads (PRD 5.24): one SQL function per page, which checks who is asking
 * (supabase/migrations/20261024_billing_lifecycle.sql, 20261025_billing_ops.sql).
 */

export interface Plan {
  id: string;
  tier: string;
  label: string;
  interval: "month" | "year";
  price_pkr: number | null;
  price_usd: number | null;
  grants: Record<string, unknown>;
  self_serve: boolean;
  rank: number;
}

export interface Subscription {
  id: string;
  plan_id: string;
  plan: string;
  tier: string;
  interval: "month" | "year";
  status: "trialing" | "active" | "past_due" | "expired" | "cancelled";
  gateway: string;
  live: boolean;
  payment_method: "card" | "wallet" | "bank_transfer" | "none";
  currency: "PKR" | "USD";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  next_period_paid: boolean;
  next_plan_id: string | null;
  next_plan: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  po_number: string | null;
  saved_card: boolean;
  ended_at?: string | null;
  ended_reason?: string | null;
  created_at?: string;
  simulate_fail_next?: boolean;
}

export interface Quota {
  key: string;
  limit: number;
  used: number;
  extras: number;
  remaining: number;
  period_start: string;
}

export interface PaymentRow {
  id: string;
  kind: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  refunded_amount: number;
  live: boolean;
  gateway: string;
  invoice_id: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  number: string;
  kind: "invoice" | "receipt" | "credit_note";
  purpose: string;
  total: number;
  currency: string;
  status: "issued" | "paid" | "void";
  issued_at: string;
  due_at: string | null;
  live: boolean;
  draft: boolean;
}

export interface HireFeeRow {
  id: string;
  kind: "intern" | "full_time";
  amount: number;
  status: string;
  invoice_id: string | null;
  due_at: string | null;
  created_at: string;
  dispute_kind: string | null;
  resolution_reason: string | null;
  can_dispute: boolean;
}

export interface BillingOverview {
  subject_type: SubjectKind;
  subject_id: string;
  name: string;
  subscription: Subscription | null;
  entitlements: { values: Record<string, unknown>; quotas: Record<string, Quota | null> };
  plans: Plan[];
  trial_available: boolean;
  sponsored: { university: string; ends_at: string | null } | null;
  details: { province: string | null; ntn: string | null; address: string | null } | null;
  hire_fees: HireFeeRow[] | null;
  paused_posts: { id: string; title: string; paused_at: string }[] | null;
  members: { user_id: string; name: string | null; role: string; status: string; seat_keep: boolean }[] | null;
  live_posts: number | null;
  live_jobs: { id: string; title: string; sponsored_until: string | null }[] | null;
  company_complete: boolean;
  live_mode: boolean;
  payments: PaymentRow[];
  invoices: InvoiceRow[];
}

export function getBillingOverview(subject: SubjectKind): Promise<BillingOverview> {
  return rpcJson<BillingOverview>("billing_overview", { p_subject: subject });
}

export interface CheckoutSession {
  id: string;
  subject_type: SubjectKind;
  purpose: "subscription" | "add_on" | "invoice";
  change: "new" | "upgrade" | "renew_prepaid" | null;
  status: "open" | "paid" | "failed" | "cancelled" | "expired";
  amount: number;
  currency: "PKR" | "USD";
  gateway: string;
  live: boolean;
  quote: {
    lines: { description: string; quantity: number; unit_amount: number; amount: number }[];
    subtotal: number;
    tax_lines: { label: string; province: string; rate: number; amount: number }[];
    tax_total: number;
    total: number;
    document: string;
  };
  failure_reason: string | null;
  expires_at: string;
  title: string;
  recurring_allowed: boolean;
  return_to: string;
}

export function getCheckoutSession(id: string): Promise<CheckoutSession> {
  return rpcJson<CheckoutSession>("checkout_session", { p_id: id });
}

/** Which payment options a checkout form may offer (env-driven; amounts still come from SQL). */
export function paymentOptions(): { pkr: boolean; usd: boolean; testMode: boolean } {
  const g = gateways();
  const pkr = gatewayFor(g, "PKR");
  const usd = gatewayFor(g, "USD");
  return {
    pkr: pkr.ok,
    usd: usd.ok,
    testMode: (pkr.ok && pkr.gateway === "simulated") || (usd.ok && usd.gateway === "simulated"),
  };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
export interface OpsSubjectHit {
  type: SubjectKind;
  id: string;
  name: string;
  detail: string;
  plan: string | null;
}

export function opsBillingSearch(q: string): Promise<OpsSubjectHit[]> {
  return rpcJson<OpsSubjectHit[]>("ops_billing_search", { p_q: q });
}

export interface OpsGrant {
  id: string;
  key: string;
  value: unknown;
  source: string;
  source_id: string | null;
  starts_at: string;
  ends_at: string | null;
  reason: string | null;
  consumed: number;
  revoked_at: string | null;
  revoked_reason: string | null;
  active: boolean;
}

export interface OpsSubject {
  type: SubjectKind;
  id: string;
  name: string;
  entitlements: { values: Record<string, unknown>; quotas: Record<string, Quota | null> };
  subscriptions: Subscription[];
  grants: OpsGrant[];
  counters: { key: string; period_start: string; used: number }[];
  hire_fees: (HireFeeRow & { dispute_reason: string | null })[];
  add_ons: { id: string; kind: string; quantity: number; amount: number; currency: string; status: string; live: boolean; created_at: string }[];
  payments: PaymentRow[];
  invoices: InvoiceRow[];
}

export function opsBillingSubject(type: SubjectKind, id: string): Promise<OpsSubject> {
  return rpcJson<OpsSubject>("ops_billing_subject", { p_type: type, p_id: id });
}

export interface OpsTask {
  id: string;
  kind: string;
  subject_type: SubjectKind | null;
  subject_id: string | null;
  name: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export function opsBillingTasks(): Promise<OpsTask[]> {
  return rpcJson<OpsTask[]>("ops_billing_tasks");
}

export interface OpsRevenue {
  mrr: Record<string, number>;
  active_by_plan: { plan: string; interval: string; audience: string; count: number }[];
  comp_count: number;
  last_30_days: Record<string, number>;
  churn_30_days: { ended: number; active_at_start: number };
  hire_fees_open: number;
  test_payments_30_days: number;
}

export function opsRevenue(): Promise<OpsRevenue> {
  return rpcJson<OpsRevenue>("ops_revenue");
}

export interface GatewayActivity {
  queue: { events: number; jobs: number };
  tax_rates: { province: string; label: string; rate: number; effective_from: string }[];
  company_complete: boolean;
  live_mode: boolean;
  [gateway: string]: unknown;
}

export async function opsGatewayReadiness(): Promise<{ adapters: (GatewayReadiness & { last_received_at: string | null; events_24h: number; failed: number })[]; activity: GatewayActivity; simulatedAllowed: boolean; production: boolean }> {
  const activity = await rpcJson<GatewayActivity>("ops_gateway_activity");
  const g = gateways();
  const adapters = readiness(g, (name) => process.env[name]).map((a) => {
    const act = (activity[a.id] ?? {}) as { last_received_at?: string; events_24h?: number; failed?: number };
    return { ...a, last_received_at: act.last_received_at ?? null, events_24h: act.events_24h ?? 0, failed: act.failed ?? 0 };
  });
  return { adapters, activity, simulatedAllowed: simulatedAllowed(g), production: g.production };
}
