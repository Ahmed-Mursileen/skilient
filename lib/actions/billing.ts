"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { rpcAction } from "@/lib/actions/recruit-run";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { NO_SESSION, REFUSALS, sentence, signedIn } from "@/lib/actions/rpc";
import { startCheckout, type CheckoutRequest } from "@/lib/billing/checkout";
import { gateways } from "@/lib/billing/gateways";
import { simulatedAllowed } from "@/supabase/functions/_shared/billing/config.ts";
import { newSimulatedPaymentId, simulatedWebhook } from "@/supabase/functions/_shared/billing/simulated.ts";
import type { BillingEvent, BillingEventType } from "@/supabase/functions/_shared/billing/types.ts";

/**
 * Billing actions for students (/settings/billing), organisations (/org/billing: admin and billing members on
 * two-factor) and universities (/uni/billing: the owner on two-factor). Zod input, getUser(), and SQL that
 * re-checks who is asking, prices everything from `plans` and config, and never takes an amount, a user id or
 * an entitlement from the browser (supabase/migrations/2026102[3-5]_billing_*.sql).
 */

const uuid = z.uuid();
const subject = z.enum(["user", "org", "university"]);
const key = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/, "Reload the page and try again.");
const currency = z.enum(["PKR", "USD"]);
const HOMES = ["/settings/billing", "/org/billing", "/uni/billing"];

async function checkout(name: string, req: CheckoutRequest, idem: string): Promise<ActionResult<{ redirectUrl: string }>> {
  const ctx = await actionContext(name);
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const res = await startCheckout(session.supabase, req, ctx.origin, idem);
  if (!res.ok) {
    const code = res.sqlCode ? (REFUSALS[res.sqlCode] ?? "unavailable") : res.code;
    ctx.done(code === "unavailable" ? "error" : "refused", { error_code: res.sqlCode ?? res.code, user_id: session.userId });
    return code === "unavailable"
      ? fail("unavailable", "Something went wrong on our side. Try again.", { requestId: ctx.requestId })
      : fail(code, sentence(res.message));
  }
  ctx.done("ok", { user_id: session.userId, session_id: res.sessionId });
  return ok({ redirectUrl: res.redirectUrl });
}

const planSchema = z.object({ subject: subject.exclude(["university"]), planId: z.string().regex(/^[a-z0-9_]{3,60}$/), currency, key });
export async function startPlanCheckout(input: z.input<typeof planSchema>): Promise<ActionResult<{ redirectUrl: string }>> {
  const v = planSchema.safeParse(input);
  if (!v.success) return fail("invalid_input", v.error.issues[0]?.message ?? "Check the form.");
  return checkout("billing.checkout_plan", { kind: "plan", subject: v.data.subject, planId: v.data.planId, currency: v.data.currency }, v.data.key);
}

const addOnSchema = z.object({
  kind: z.enum(["contact_credits", "sponsored_post"]),
  quantity: z.coerce.number().int().min(1).max(100),
  jobId: z.union([uuid, z.literal(""), z.null()]).optional().transform((x) => x || null),
  currency,
  key,
});
export async function startAddOnCheckout(input: z.input<typeof addOnSchema>): Promise<ActionResult<{ redirectUrl: string }>> {
  const v = addOnSchema.safeParse(input);
  if (!v.success) return fail("invalid_input", v.error.issues[0]?.message ?? "Check the form.");
  if (v.data.kind === "sponsored_post" && !v.data.jobId) return fail("invalid_input", "Choose the post to sponsor.");
  return checkout("billing.checkout_add_on", { kind: "add_on", addOn: v.data.kind, quantity: v.data.quantity, jobId: v.data.jobId, currency: v.data.currency }, v.data.key);
}

const invoiceSchema = z.object({ subject: subject.exclude(["user"]), invoiceId: uuid, key });
export async function startInvoiceCheckout(input: z.input<typeof invoiceSchema>): Promise<ActionResult<{ redirectUrl: string }>> {
  const v = invoiceSchema.safeParse(input);
  if (!v.success) return fail("invalid_input", v.error.issues[0]?.message ?? "Check the form.");
  return checkout("billing.checkout_invoice", { kind: "invoice", subject: v.data.subject, invoiceId: v.data.invoiceId }, v.data.key);
}

// ---------------------------------------------------------------------------
// The simulated gateway's buttons: its "result" is a signed webhook to our own webhook route
// ---------------------------------------------------------------------------
const simulateSchema = z.object({ sessionId: uuid, outcome: z.enum(["card", "wallet", "fail", "cancel"]) });
export async function simulatePayment(input: z.input<typeof simulateSchema>): Promise<ActionResult<{ next: string }>> {
  const ctx = await actionContext("billing.simulate_payment");
  const v = simulateSchema.safeParse(input);
  if (!v.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Reload the page and try again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const g = gateways();
  if (!simulatedAllowed(g)) {
    ctx.done("refused", { error_code: "simulated_refused", user_id: session.userId });
    return fail("forbidden", "Test payments are switched off here.");
  }
  if (g.production) {
    const { data: allowed } = await session.supabase.rpc("may_use_simulated");
    if (!allowed) {
      ctx.done("refused", { error_code: "simulated_refused", user_id: session.userId });
      return fail("forbidden", "Test payments are only for invited testers.");
    }
  }
  // Amount, currency and state come from the database (RLS-checked: only the person who started it).
  const { data, error } = await session.supabase.rpc("checkout_session", { p_id: v.data.sessionId });
  const c = data as unknown as { status: string; gateway: string; amount: number; currency: "PKR" | "USD"; recurring_allowed: boolean } | null;
  if (error || !c) {
    ctx.done("refused", { error_code: error?.code ?? "not_found", user_id: session.userId });
    return fail("not_found", "This checkout isn't available.");
  }
  if (c.gateway !== "simulated" || c.status !== "open") {
    ctx.done("refused", { error_code: "not_open", user_id: session.userId });
    return fail("not_now", "This checkout is already closed.");
  }
  const outcome = v.data.outcome;
  const type: BillingEventType = outcome === "fail" ? "payment.failed" : outcome === "cancel" ? "checkout.cancelled" : "payment.succeeded";
  const paymentId = newSimulatedPaymentId();
  const data_: BillingEvent =
    outcome === "card" || outcome === "wallet"
      ? {
          session_id: v.data.sessionId,
          payment_id: paymentId,
          amount: Number(c.amount),
          currency: c.currency,
          method: outcome,
          saved_method_ref: outcome === "card" && c.recurring_allowed ? `sim_card_${paymentId.slice(-12)}` : undefined,
        }
      : { session_id: v.data.sessionId, reason: outcome === "fail" ? "card_declined" : "cancelled" };
  const secret = process.env.SIMULATED_GATEWAY_SECRET as string;
  const hook = await simulatedWebhook(secret, type, data_);
  const headers = new Headers(hook.headers);
  headers.set("x-request-id", ctx.requestId);
  // Vercel previews behind Deployment Protection let this request through with the automation bypass.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers.set("x-vercel-protection-bypass", process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  let status = 0;
  try {
    const res = await fetch(`${ctx.origin}/api/billing/webhook/simulated`, { method: "POST", headers, body: hook.body, cache: "no-store" });
    status = res.status;
  } catch {
    status = 0;
  }
  if (status !== 200) {
    ctx.done("error", { error_code: `webhook_${status}`, user_id: session.userId });
    return fail("unavailable", "The test payment didn't go through. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: session.userId, session_id: v.data.sessionId, simulated: outcome });
  return ok({ next: `/billing/return/${v.data.sessionId}` });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export async function startTrial(): Promise<ActionResult<string>> {
  return rpcAction<z.ZodUndefined, string>({ name: "billing.start_trial", schema: z.undefined(), input: undefined, fn: "start_trial", args: () => ({}), revalidate: ["/settings/billing"] });
}

const changeSchema = z.object({ subject: subject.exclude(["university"]), planId: z.string().regex(/^(free|[a-z0-9_]{3,60})$/) });
export async function schedulePlanChange(input: z.input<typeof changeSchema>): Promise<ActionResult> {
  return rpcAction({ name: "billing.schedule_change", schema: changeSchema, input, fn: "schedule_plan_change", args: (v) => ({ p_subject: v.subject, p_plan: v.planId }), revalidate: HOMES });
}

const cancelSchema = z.object({ subject: subject.exclude(["university"]), resume: z.boolean().default(false) });
export async function cancelSubscription(input: z.input<typeof cancelSchema>): Promise<ActionResult> {
  return rpcAction({ name: "billing.cancel", schema: cancelSchema, input, fn: "cancel_subscription", args: (v) => ({ p_subject: v.subject, p_resume: v.resume }), revalidate: HOMES });
}

const seatsSchema = z.object({ keep: z.array(uuid).max(500) });
export async function chooseSeats(input: z.input<typeof seatsSchema>): Promise<ActionResult> {
  return rpcAction({ name: "billing.choose_seats", schema: seatsSchema, input, fn: "choose_seats", args: (v) => ({ p_keep: v.keep }), revalidate: ["/org/billing"] });
}

export async function reopenPausedJob(input: { id: string }): Promise<ActionResult> {
  return rpcAction({ name: "billing.reopen_job", schema: z.object({ id: uuid }), input, fn: "reopen_paused_job", args: (v) => ({ p_id: v.id }), revalidate: ["/org/billing", "/recruit/jobs"] });
}

const detailsSchema = z.object({
  subject: subject.exclude(["user"]),
  province: z.enum(["Punjab", "Sindh", "KP", "Balochistan", "ICT", "AJK", "GB", ""]).optional(),
  ntn: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
});
export async function saveBillingDetails(input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  return rpcAction({
    name: "billing.save_details",
    schema: detailsSchema,
    input,
    fn: "save_billing_details",
    args: (v) => ({ p_subject: v.subject, p: { province: v.province ?? "", ntn: v.ntn ?? "", address: v.address ?? "" } }),
    revalidate: HOMES,
  });
}

const licenceSchema = z.object({ level: z.enum(["basic", "growth", "campus"]), note: z.string().trim().max(1000).optional() });
export async function requestLicence(input: z.input<typeof licenceSchema>): Promise<ActionResult> {
  return rpcAction({ name: "billing.request_licence", schema: licenceSchema, input, fn: "request_licence", args: (v) => ({ p_level: v.level, p_note: v.note ?? "" }), revalidate: ["/uni/billing"] });
}

const disputeSchema = z.object({
  id: uuid,
  kind: z.enum(["candidate_withdrew", "marked_in_error"]),
  reason: z.string().trim().min(10, "Say what happened (at least 10 characters).").max(1000),
});
export async function disputeHireFee(input: z.input<typeof disputeSchema>): Promise<ActionResult> {
  return rpcAction({ name: "billing.dispute_fee", schema: disputeSchema, input, fn: "dispute_hire_fee", args: (v) => ({ p_id: v.id, p_kind: v.kind, p_reason: v.reason }), revalidate: ["/org/billing"] });
}

export async function cancelCheckout(input: { id: string }): Promise<ActionResult> {
  return rpcAction({ name: "billing.cancel_checkout", schema: z.object({ id: uuid }), input, fn: "cancel_checkout", args: (v) => ({ p_id: v.id }) });
}

/** The return page's poll: the session's state as the database has it (never the gateway's redirect). */
export async function checkoutStatus(id: string): Promise<ActionResult<string>> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return fail("invalid_input", "Unknown checkout.");
  const ctx = await actionContext("billing.checkout_status");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data, error } = await session.supabase.rpc("checkout_session", { p_id: parsed.data });
  if (error || !data) {
    ctx.done("refused", { error_code: error?.code ?? "not_found", user_id: session.userId });
    return fail("not_found", "Unknown checkout.");
  }
  ctx.done("ok", { user_id: session.userId });
  return ok(String((data as { status?: string }).status ?? "open"));
}
