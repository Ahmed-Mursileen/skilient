import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { logger, requestIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * The public keys that sign verified CVs (PRD 5.18), retired ones included so every CV ever
 * issued can still be checked. Read with the publishable key; `signing_keys` is public.
 */
export async function GET(request: Request) {
  const env = publicEnv();
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("signing_keys")
    .select("key_id, algorithm, public_key, active_from, retired_at")
    .order("active_from", { ascending: true });
  if (error) {
    logger.error("cv.keys", {
      request_id: requestIdFrom(request.headers),
      action: "GET /.well-known/skilient-cv-keys.json",
      outcome: "error",
      error_code: error.code ?? "unknown",
    });
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    {
      issuer: "Skilient",
      format:
        "Each CV record is signed over the SHA-256 digest (32 bytes) of the RFC 8785 canonical JSON of " +
        "{v, code, key_id, issued_at, expires_at, snapshot}, with the Ed25519 key named by key_id. " +
        "public_key is the raw 32-byte key, base64url. Retired keys no longer sign but still verify.",
      keys: (data ?? []).map((k) => ({
        key_id: k.key_id,
        alg: k.algorithm,
        public_key: k.public_key,
        active_from: k.active_from,
        retired_at: k.retired_at,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
