import "server-only";

import { createHash, createHmac } from "node:crypto";
import { logger } from "@/lib/log";

let warned = false;

/**
 * HMAC-SHA256 with IP_HASH_SECRET, hex. Used for IP hashes and rate-limit keys so the
 * database never holds raw IPs or guessable keys. Without the secret (local dev) it
 * falls back to a plain SHA-256 and logs once.
 */
export function keyedHash(value: string): string {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) {
    if (!warned) {
      warned = true;
      logger.warn("security.ip_hash_secret_missing", { action: "security.hash", outcome: "ok", error_code: "no_secret" });
    }
    return createHash("sha256").update(`skilient:${value}`).digest("hex");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashIp(ip: string | null): string | null {
  return ip ? keyedHash(`ip:${ip}`) : null;
}
