// cv-sign: issues signed CV versions, rotates the signing key and drains the monthly refresh
// queue (PRD 5.18). The private key is read from Vault over the direct connection and never
// leaves this function. Called by pg_cron / private.cv_rotate_key() with a bearer secret from
// the database, or by the Next server with the signed-in student's access token.
import postgres from "npm:postgres@3.4.9";
import { authVerifier } from "../_shared/codecheck/serve.ts";
import { handleCvSign } from "../_shared/cv/issue.ts";
import { dbFrom, jsonLog } from "../_shared/github/types.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));
const verify = authVerifier({ url: Deno.env.get("SUPABASE_URL")!, key: Deno.env.get("SUPABASE_ANON_KEY")!, fetch });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.json().catch(() => ({}));
  try {
    const result = await handleCvSign({ db, log: jsonLog, verify }, req.headers.get("authorization"), body);
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    jsonLog("cv.sign", { level: "error", outcome: "error", error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
});
