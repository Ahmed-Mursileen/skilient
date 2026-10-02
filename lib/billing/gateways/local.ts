/** The local PKR gateway (Safepay). Logic shared with the billing-worker Edge Function. */
export { createSafepayAdapter, normaliseSafepay, safepayConfig, SAFEPAY_SIGNATURE_HEADER, signSafepay } from "@/supabase/functions/_shared/billing/safepay.ts";
