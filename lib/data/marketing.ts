import "server-only";

import { unstable_cache } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { homeFor, type GateState } from "@/lib/auth/gate";
import { logger } from "@/lib/log";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the marketing pages (PRD 5.1). Public data is cached for an hour (decisions
 * 2026-10-02: pages render per request for the nonce CSP, their data doesn't); the viewer is
 * read per request with getUser() so signed-in visitors see "Open Skilient".
 */

export interface Viewer {
  /** Where "Open Skilient" goes: the same home the gate would send them to. */
  home: string;
  role: string | null;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const { data: state } = await supabase.rpc("my_gate_state");
    const gate = (state as GateState | null) ?? null;
    return { home: gate ? homeFor(gate) : "/feed", role: gate?.role ?? null };
  } catch (err) {
    // Next's own signals (dynamic rendering, redirects) pass through untouched.
    unstable_rethrow(err);
    // The public pages never fail because auth is unreachable: the visitor just sees "Join".
    logger.error("marketing.viewer", { action: "getViewer", outcome: "error", error_code: err instanceof Error ? err.message.slice(0, 80) : "unknown" });
    return null;
  }
});

export interface LandingStats {
  /** Live universities with enough verified students, most students first. */
  universities: string[];
  /** Each total is null below marketing.stats_min (200), so it can't be shown. */
  verified_students: number | null;
  ventures: number | null;
  shipped_ventures: number | null;
}

const EMPTY_STATS: LandingStats = { universities: [], verified_students: null, ventures: null, shipped_ventures: null };

export const getLandingStats = unstable_cache(
  async (): Promise<LandingStats> => {
    const { data, error } = await Promise.resolve()
      .then(() => createPublicClient().rpc("landing_stats"))
      .then((r) => r, (e: unknown) => ({ data: null, error: { code: e instanceof Error ? e.message.slice(0, 60) : "unknown" } }));
    if (error) {
      logger.error("marketing.landing_stats", { action: "landing_stats", outcome: "error", error_code: error.code ?? "unknown" });
      return EMPTY_STATS;
    }
    return { ...EMPTY_STATS, ...(data as Partial<LandingStats>) };
  },
  ["marketing-landing-stats"],
  { revalidate: 3600 },
);

export interface PublicPlan {
  id: string;
  audience: "user" | "org" | "university";
  tier: string;
  label: string;
  interval: "month" | "year";
  price_pkr: number | null;
  self_serve: boolean;
  position: number;
  grants: Record<string, unknown>;
}

export const getPublicPlans = unstable_cache(
  async (): Promise<PublicPlan[]> => {
    const { data, error } = await Promise.resolve()
      .then(() => createPublicClient().rpc("public_plans"))
      .then((r) => r, (e: unknown) => ({ data: null, error: { code: e instanceof Error ? e.message.slice(0, 60) : "unknown" } }));
    if (error) {
      logger.error("marketing.public_plans", { action: "public_plans", outcome: "error", error_code: error.code ?? "unknown" });
      return [];
    }
    return (data as PublicPlan[] | null) ?? [];
  },
  ["marketing-public-plans"],
  { revalidate: 3600 },
);

export interface PricingExtras {
  add_ons: { sponsored_post?: { pkr: number; days: number }; contact_credits?: { pkr: number } } | null;
  hire_fees: { intern?: number; full_time?: number } | null;
  trial_days: number | null;
}

/** Add-ons, hiring fees and the trial length for /pricing, from platform_config (what billing charges). */
export const getPricingExtras = unstable_cache(
  async (): Promise<PricingExtras> => {
    const empty: PricingExtras = { add_ons: null, hire_fees: null, trial_days: null };
    const { data, error } = await Promise.resolve()
      .then(() => createPublicClient().rpc("public_pricing_extras"))
      .then((r) => r, (e: unknown) => ({ data: null, error: { code: e instanceof Error ? e.message.slice(0, 60) : "unknown" } }));
    if (error) {
      logger.error("marketing.pricing_extras", { action: "public_pricing_extras", outcome: "error", error_code: error.code ?? "unknown" });
      return empty;
    }
    return { ...empty, ...(data as Partial<PricingExtras> | null) };
  },
  ["marketing-pricing-extras"],
  { revalidate: 3600 },
);
