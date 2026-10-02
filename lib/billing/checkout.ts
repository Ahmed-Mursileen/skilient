import "server-only";

import type { Supabase } from "@/lib/actions/rpc";
import { adapterFor, gatewayFor } from "@/supabase/functions/_shared/billing/config.ts";
import type { Currency, GatewayAdapter } from "@/supabase/functions/_shared/billing/types.ts";
import { BILLING_HOME, type SubjectKind } from "./constants";
import { gateways } from "./gateways";

/**
 * Checkout (PRD 4b.5): the gateway is chosen here from env vars, the amount and tax by SQL from `plans`
 * and config (`create_checkout`, `create_add_on_checkout`, `create_invoice_checkout`), and the adapter opens
 * its page. The redirect back is never trusted: /billing/return/[session] polls the database.
 */
export type CheckoutRequest =
  | { kind: "plan"; subject: SubjectKind; planId: string; currency: Currency }
  | { kind: "add_on"; addOn: "contact_credits" | "sponsored_post"; quantity: number; jobId: string | null; currency: Currency }
  | { kind: "invoice"; subject: SubjectKind; invoiceId: string };

export type CheckoutStart =
  | { ok: true; sessionId: string; redirectUrl: string }
  | { ok: false; code: "not_configured" | "simulated_refused" | "refused" | "gateway_error"; message: string; sqlCode?: string };

export async function startCheckout(supabase: Supabase, req: CheckoutRequest, origin: string, key: string): Promise<CheckoutStart> {
  const g = gateways();
  const currency: Currency = req.kind === "invoice" ? "PKR" : req.currency;
  const choice = gatewayFor(g, currency);
  if (!choice.ok) {
    return {
      ok: false,
      code: choice.reason,
      message: currency === "USD" ? "Paying in USD isn't available yet. Pay in PKR instead." : "Payments aren't available yet. Write to the Skilient team.",
    };
  }
  if (choice.gateway === "simulated" && g.production) {
    const { data: allowed } = await supabase.rpc("may_use_simulated");
    if (!allowed) return { ok: false, code: "simulated_refused", message: "Payments open soon. Write to the Skilient team to be invited." };
  }
  const rpc =
    req.kind === "plan"
      ? supabase.rpc("create_checkout", { p_subject: req.subject, p_plan: req.planId, p_currency: req.currency, p_gateway: choice.gateway, p_key: key })
      : req.kind === "add_on"
        ? supabase.rpc("create_add_on_checkout", {
            p_kind: req.addOn,
            p_quantity: req.quantity,
            p_job: req.jobId as string,
            p_currency: req.currency,
            p_gateway: choice.gateway,
            p_key: key,
          })
        : supabase.rpc("create_invoice_checkout", { p_subject: req.subject, p_invoice: req.invoiceId, p_gateway: choice.gateway, p_key: key });
  const { data, error } = await rpc;
  if (error) return { ok: false, code: "refused", message: error.message, sqlCode: error.code };
  const session = data as unknown as { session_id: string; amount: number; currency: Currency; status: string };
  const adapter = adapterFor(g, choice.gateway) as GatewayAdapter;
  const subject: SubjectKind = req.kind === "add_on" ? "org" : req.subject;
  try {
    const opened = await adapter.createSession({
      sessionId: session.session_id,
      amount: Number(session.amount),
      currency: session.currency,
      description: req.kind === "plan" ? `Skilient ${req.planId.replace(/_/g, " ")}` : req.kind === "add_on" ? `Skilient ${req.addOn.replace(/_/g, " ")}` : "Skilient invoice",
      returnUrl: `${origin}/billing/return/${session.session_id}`,
      cancelUrl: `${origin}${BILLING_HOME[subject]}`,
      recurring: req.kind === "plan",
    });
    return { ok: true, sessionId: session.session_id, redirectUrl: opened.redirectUrl };
  } catch {
    return { ok: false, code: "gateway_error", message: "The payment page didn't open. Try again in a minute." };
  }
}
