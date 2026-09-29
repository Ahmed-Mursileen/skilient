// code-check: shows a code check's snippet (PRD 5.5), read from GitHub at that commit and
// never stored, to its student during the attempt or to the reviewer who claimed it. Called by
// the Next server with the signed-in user's access token, which Supabase Auth checks here.
import postgres from "npm:postgres@3.4.9";
import { authVerifier, serveSnippet } from "../_shared/codecheck/serve.ts";
import { configFromEnv, dbFrom, jsonLog, type GithubConfig } from "../_shared/github/types.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));
let cfg: GithubConfig | null = null;
try {
  cfg = configFromEnv((name) => Deno.env.get(name));
} catch {
  cfg = null; // answers "not configured" until the GitHub App secrets are set
}
const verify = authVerifier({ url: Deno.env.get("SUPABASE_URL")!, key: Deno.env.get("SUPABASE_ANON_KEY")!, fetch });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.json().catch(() => ({}));
  try {
    const result = await serveSnippet({ db, cfg, fetch, log: jsonLog, verify }, body?.check_id, req.headers.get("authorization"));
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    jsonLog("code_check.snippet", { level: "error", outcome: "error", error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
});
