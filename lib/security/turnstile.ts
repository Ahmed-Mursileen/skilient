import "server-only";

import { logger } from "@/lib/log";
import { TURNSTILE_ORIGIN } from "./headers";

/**
 * Cloudflare Turnstile, verified server-side (PRD 10). Keys come from Vercel env:
 * real keys on Production, Cloudflare's test keys on Preview and local.
 */
export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

/** Real production refuses to run without a secret; elsewhere a missing key skips the check. */
function mustVerify(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "invalid" | "unavailable" };

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (mustVerify()) {
      logger.error("turnstile.not_configured", { action: "turnstile.verify", outcome: "error" });
      return { ok: false, reason: "unavailable" };
    }
    logger.warn("turnstile.skipped", { action: "turnstile.verify", outcome: "ok", error_code: "no_secret" });
    return { ok: true };
  }
  if (!token) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    logger.warn("turnstile.refused", {
      action: "turnstile.verify",
      outcome: "refused",
      error_code: (data["error-codes"] ?? []).join(",").slice(0, 80),
    });
    return { ok: false, reason: "invalid" };
  } catch (err) {
    logger.error("turnstile.unavailable", {
      action: "turnstile.verify",
      outcome: "error",
      error_code: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "unavailable" };
  }
}
