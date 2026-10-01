import "server-only";

import { billingGateways, type BillingGateways } from "@/supabase/functions/_shared/billing/config.ts";

/**
 * The gateways for this deployment, from env vars only (docs/setup-checklist.md "Switching to a real
 * gateway"). Production is Vercel's production environment; previews and local runs are never live.
 */
export function gateways(): BillingGateways {
  return billingGateways((name) => process.env[name], {
    appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000",
    production: process.env.VERCEL_ENV === "production",
  });
}
