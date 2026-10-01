"use server";

import { z } from "zod";
import { rpcAction } from "@/lib/actions/recruit-run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * /ops/billing (PRD 4b.11): accounts staff on a two-factor session only. Every SQL function re-checks that,
 * requires a reason and writes ops_audit_log with the before and after values (20261025_billing_ops.sql).
 */

const uuid = z.uuid();
const reason = z.string().trim().min(3, "Give a reason (it goes in the audit log).").max(2000);
const subject = z.enum(["user", "org", "university"]);
const PAGES = ["/ops/billing"];
const subjectPage = (type: string, id: string) => [...PAGES, `/ops/billing/${type}/${id}`];

const grantSchema = z.object({
  type: subject,
  id: uuid,
  key: z.string().regex(/^[a-z][a-z_]*(\.[a-z_]+)+$/, "Choose an entitlement."),
  value: z.string().trim().min(1, "Enter a value.").max(40),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the expiry date."),
  reason,
});
/** The value is typed as text: true/false, a whole number, or an enum level; SQL checks it against the key. */
function parseValue(v: string): unknown {
  if (v === "true" || v === "false") return v === "true";
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
export async function opsGrant(input: z.input<typeof grantSchema>): Promise<ActionResult<string>> {
  return rpcAction<typeof grantSchema, string>({
    name: "ops.billing_grant",
    schema: grantSchema,
    input,
    fn: "ops_grant",
    args: (v) => ({ p_type: v.type, p_id: v.id, p_key: v.key, p_value: parseValue(v.value), p_ends_at: `${v.endsAt}T23:59:59+05:00`, p_reason: v.reason }),
    revalidate: subjectPage(input.type ?? "", input.id ?? ""),
  });
}

export async function opsRevokeGrant(input: { id: string; reason: string; type: string; subjectId: string }): Promise<ActionResult> {
  return rpcAction({
    name: "ops.billing_revoke_grant",
    schema: z.object({ id: uuid, reason, type: subject, subjectId: uuid }),
    input,
    fn: "ops_revoke_grant",
    args: (v) => ({ p_grant: v.id, p_reason: v.reason }),
    revalidate: subjectPage(input.type, input.subjectId),
  });
}

const quotaSchema = z.object({ type: subject, id: uuid, key: z.string().min(3).max(60), used: z.coerce.number().int().min(0).max(100000), reason });
export async function opsQuotaOverride(input: z.input<typeof quotaSchema>): Promise<ActionResult> {
  return rpcAction({
    name: "ops.billing_quota",
    schema: quotaSchema,
    input,
    fn: "ops_quota_override",
    args: (v) => ({ p_type: v.type, p_id: v.id, p_key: v.key, p_used: v.used, p_reason: v.reason }),
    revalidate: subjectPage(input.type ?? "", input.id ?? ""),
  });
}

const compSchema = z.object({ type: subject, id: uuid, planId: z.string().regex(/^[a-z0-9_]{3,60}$/), months: z.coerce.number().int().min(1).max(36), po: z.string().trim().max(60).optional(), reason });
export async function opsCompPlan(input: z.input<typeof compSchema>): Promise<ActionResult<string>> {
  return rpcAction<typeof compSchema, string>({
    name: "ops.billing_comp",
    schema: compSchema,
    input,
    fn: "ops_comp_plan",
    args: (v) => ({ p_type: v.type, p_id: v.id, p_plan: v.planId, p_months: v.months, p_reason: v.reason, p_po: v.po ?? "" }),
    revalidate: subjectPage(input.type ?? "", input.id ?? ""),
  });
}

export async function opsEndSubscription(input: { id: string; reason: string; type: string; subjectId: string }): Promise<ActionResult> {
  return rpcAction({
    name: "ops.billing_end_subscription",
    schema: z.object({ id: uuid, reason, type: subject, subjectId: uuid }),
    input,
    fn: "ops_end_subscription",
    args: (v) => ({ p_sub: v.id, p_reason: v.reason }),
    revalidate: subjectPage(input.type, input.subjectId),
  });
}

const licenceSchema = z.object({
  universityId: uuid,
  level: z.enum(["basic", "growth", "campus"]),
  startsOn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  po: z.string().trim().min(1, "Enter the PO number.").max(60),
  reason,
});
export async function opsIssueLicence(input: z.input<typeof licenceSchema>): Promise<ActionResult<string>> {
  return rpcAction<typeof licenceSchema, string>({
    name: "ops.billing_licence",
    schema: licenceSchema,
    input,
    fn: "ops_issue_licence",
    args: (v) => ({ p_university: v.universityId, p_level: v.level, p_starts: v.startsOn || null, p_po: v.po, p_reason: v.reason }),
    revalidate: subjectPage("university", input.universityId ?? ""),
  });
}

export async function opsVoidInvoice(input: { id: string; reason: string }): Promise<ActionResult> {
  return rpcAction({ name: "ops.billing_void", schema: z.object({ id: uuid, reason }), input, fn: "ops_void_invoice", args: (v) => ({ p_invoice: v.id, p_reason: v.reason }), revalidate: PAGES });
}

const paidSchema = z.object({ id: uuid, reference: z.string().trim().min(3, "Enter the bank reference.").max(100), reason });
export async function opsMarkPaid(input: z.input<typeof paidSchema>): Promise<ActionResult> {
  return rpcAction({ name: "ops.billing_mark_paid", schema: paidSchema, input, fn: "ops_mark_invoice_paid", args: (v) => ({ p_invoice: v.id, p_reference: v.reference, p_reason: v.reason }), revalidate: PAGES });
}

const refundSchema = z.object({ id: uuid, amount: z.union([z.coerce.number().positive(), z.literal("")]).optional(), reason });
export async function opsRefund(input: z.input<typeof refundSchema>): Promise<ActionResult> {
  return rpcAction({
    name: "ops.billing_refund",
    schema: refundSchema,
    input,
    fn: "ops_refund",
    args: (v) => ({ p_payment: v.id, p_amount: v.amount === "" || v.amount === undefined ? null : v.amount, p_reason: v.reason }),
    revalidate: PAGES,
  });
}

const feeSchema = z.object({ id: uuid, outcome: z.enum(["paid", "void", "waived"]), reason });
export async function opsResolveHireFee(input: z.input<typeof feeSchema>): Promise<ActionResult> {
  return rpcAction({ name: "ops.billing_hire_fee", schema: feeSchema, input, fn: "ops_resolve_hire_fee", args: (v) => ({ p_fee: v.id, p_outcome: v.outcome, p_reason: v.reason }), revalidate: PAGES });
}

const taxSchema = z.object({
  province: z.enum(["Punjab", "Sindh", "KP", "Balochistan", "ICT", "AJK", "GB"]),
  label: z.string().trim().min(3).max(60),
  ratePercent: z.coerce.number().min(0).max(50),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it applies from."),
  reason,
});
export async function opsSetTaxRate(input: z.input<typeof taxSchema>): Promise<ActionResult<string>> {
  return rpcAction<typeof taxSchema, string>({
    name: "ops.billing_tax",
    schema: taxSchema,
    input,
    fn: "ops_set_tax_rate",
    args: (v) => ({ p_province: v.province, p_label: v.label, p_rate: Math.round(v.ratePercent * 100) / 10000, p_from: v.from, p_reason: v.reason }),
    revalidate: PAGES,
  });
}

const simulateSchema = z.object({ id: uuid, action: z.enum(["renew_now", "fail_next", "end_grace", "retry_now"]), reason, type: subject, subjectId: uuid });
export async function opsSimulate(input: z.input<typeof simulateSchema>): Promise<ActionResult> {
  return rpcAction({
    name: "ops.billing_simulate",
    schema: simulateSchema,
    input,
    fn: "ops_simulate",
    args: (v) => ({ p_sub: v.id, p_action: v.action, p_reason: v.reason }),
    revalidate: subjectPage(input.type ?? "", input.subjectId ?? ""),
  });
}

export async function opsCloseTask(input: { id: string; note: string }): Promise<ActionResult> {
  return rpcAction({ name: "ops.billing_close_task", schema: z.object({ id: uuid, note: reason }), input, fn: "ops_close_task", args: (v) => ({ p_task: v.id, p_note: v.note }), revalidate: PAGES });
}
