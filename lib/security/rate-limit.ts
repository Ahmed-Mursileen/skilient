import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { logger } from "@/lib/log";
import { keyedHash } from "./hash";

/**
 * App rate limits over `rate_limit_events` (PRD 8). The key is `scope:` plus an HMAC of
 * the subject, so the table holds no emails or IPs and keys can't be guessed from outside.
 * Fails closed: if the check itself errors, the action is refused.
 */
export async function rateLimit(
  supabase: SupabaseClient<Database>,
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `${scope}:${keyedHash(`${scope}:${subject}`)}`;
  const { data, error } = await supabase.rpc("rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    logger.error("rate_limit.failed", { action: "rate_limit", outcome: "error", error_code: error.code ?? "unknown", scope });
    return false;
  }
  return data === true;
}
