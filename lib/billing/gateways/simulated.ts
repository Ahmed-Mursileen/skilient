/** The simulated gateway (test mode). Logic shared with the billing-worker Edge Function. */
export { createSimulatedAdapter, newSimulatedPaymentId, SIMULATED_SIGNATURE_HEADER, simulatedWebhook } from "@/supabase/functions/_shared/billing/simulated.ts";
