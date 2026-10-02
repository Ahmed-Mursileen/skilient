/**
 * Which gateway takes which payment, from environment variables only (decisions.md 2026-10-05):
 *
 *   BILLING_GATEWAY_LOCAL   simulated | safepay     PKR payments (default simulated)
 *   BILLING_GATEWAY_MOR     simulated | paddle      USD payments (default simulated)
 *   BILLING_ALLOW_SIMULATED 1                       production override (see below)
 *   SIMULATED_GATEWAY_SECRET                         ≥ 32 characters, signs simulated webhooks
 *   SAFEPAY_* / PADDLE_*                             each real adapter's keys (disabled until all are set)
 *
 * The simulated gateway's rule in production: allowed while no real adapter is configured; refused once one
 * is, unless BILLING_ALLOW_SIMULATED=1. Outside production it is always allowed. In production it is also
 * limited to staff and `billing.simulated_testers` (checked in SQL by `may_use_simulated()`).
 */
import { createPaddleAdapter, paddleConfig } from "./paddle.ts";
import { createSafepayAdapter, safepayConfig } from "./safepay.ts";
import { createSimulatedAdapter } from "./simulated.ts";
import type { Currency, Env, Fetch, GatewayAdapter, GatewayId } from "./types.ts";

export interface BillingGateways {
  simulated: GatewayAdapter;
  safepay: GatewayAdapter;
  paddle: GatewayAdapter;
  local: GatewayId;
  mor: GatewayId;
  production: boolean;
  allowSimulatedOverride: boolean;
}

export function billingGateways(env: Env, opts: { appUrl: string; production: boolean; fetch?: Fetch }): BillingGateways {
  const local = env("BILLING_GATEWAY_LOCAL") === "safepay" ? "safepay" : "simulated";
  const mor = env("BILLING_GATEWAY_MOR") === "paddle" ? "paddle" : "simulated";
  return {
    simulated: createSimulatedAdapter({ secret: env("SIMULATED_GATEWAY_SECRET"), appUrl: opts.appUrl }),
    safepay: createSafepayAdapter(safepayConfig(env), opts.fetch),
    paddle: createPaddleAdapter(paddleConfig(env), opts.fetch),
    local,
    mor,
    production: opts.production,
    allowSimulatedOverride: env("BILLING_ALLOW_SIMULATED") === "1",
  };
}

export function adapterFor(g: BillingGateways, id: string): GatewayAdapter | null {
  return id === "simulated" ? g.simulated : id === "safepay" ? g.safepay : id === "paddle" ? g.paddle : null;
}

/** May the simulated gateway run here at all (before the per-person check)? */
export function simulatedAllowed(g: BillingGateways): boolean {
  if (!g.simulated.configured) return false;
  if (!g.production) return true;
  const realConfigured = g.safepay.configured || g.paddle.configured;
  return !realConfigured || g.allowSimulatedOverride;
}

export type GatewayChoice = { ok: true; gateway: GatewayId } | { ok: false; reason: "not_configured" | "simulated_refused" };

/** The gateway for a currency: the configured real one, else the simulated one where allowed. */
export function gatewayFor(g: BillingGateways, currency: Currency): GatewayChoice {
  const chosen = currency === "USD" ? g.mor : g.local;
  if (chosen !== "simulated") {
    const adapter = adapterFor(g, chosen);
    return adapter?.configured ? { ok: true, gateway: chosen } : { ok: false, reason: "not_configured" };
  }
  return simulatedAllowed(g) ? { ok: true, gateway: "simulated" } : { ok: false, reason: g.simulated.configured ? "simulated_refused" : "not_configured" };
}

export interface GatewayReadiness {
  id: GatewayId;
  role: "local" | "mor" | "test";
  configured: boolean;
  selected: boolean;
  mode: "live" | "sandbox" | "test";
  usable: boolean;
  missing: string[];
}

/** For /ops/billing: which adapters are configured, test or live, and in use. Never prints a value. */
export function readiness(g: BillingGateways, env: Env): GatewayReadiness[] {
  const missing = (names: string[]) => names.filter((n) => !env(n));
  return [
    {
      id: "simulated",
      role: "test",
      configured: g.simulated.configured,
      selected: g.local === "simulated" || g.mor === "simulated",
      mode: "test",
      usable: simulatedAllowed(g),
      missing: g.simulated.configured ? [] : ["SIMULATED_GATEWAY_SECRET"],
    },
    {
      id: "safepay",
      role: "local",
      configured: g.safepay.configured,
      selected: g.local === "safepay",
      mode: g.safepay.live ? "live" : "sandbox",
      usable: g.safepay.configured && g.local === "safepay",
      missing: missing(["SAFEPAY_API_KEY", "SAFEPAY_SECRET_KEY", "SAFEPAY_WEBHOOK_SECRET"]),
    },
    {
      id: "paddle",
      role: "mor",
      configured: g.paddle.configured,
      selected: g.mor === "paddle",
      mode: g.paddle.live ? "live" : "sandbox",
      usable: g.paddle.configured && g.mor === "paddle",
      missing: missing(["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET"]),
    },
  ];
}
