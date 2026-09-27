import "server-only";

import { createHash } from "node:crypto";
import { logger } from "@/lib/log";

const RANGE_API = "https://api.pwnedpasswords.com/range/";

/**
 * Breached-password check (PRD 5.27) with Have I Been Pwned's k-anonymity range API:
 * only the first 5 hex characters of the SHA-1 leave the server, with padded responses.
 * Fails open (returns false) if the API is down, so signup never hard-depends on it;
 * Supabase Auth's own leaked-password protection is the second layer.
 */
export async function isBreachedPassword(password: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`${RANGE_API}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "Skilient" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch (err) {
    logger.warn("hibp.unavailable", {
      action: "hibp.check",
      outcome: "error",
      error_code: err instanceof Error ? err.message.slice(0, 60) : "unknown",
    });
    return false;
  }
}
