// github-link: binds a student to the GitHub account behind a one-time OAuth code
// (PRD 5.5 P0). Called by /api/github/callback with a ticket the student wrote under
// their own session; the ticket, not the caller, decides who is linked.
import postgres from "npm:postgres@3.4.9";
import { linkGithub } from "../_shared/github/link.ts";
import { runWorker } from "../_shared/github/worker.ts";
import { configFromEnv, dbFrom, jsonLog, type GithubConfig } from "../_shared/github/types.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));

function config(): GithubConfig | null {
  try {
    return configFromEnv((name) => Deno.env.get(name));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  // Checked before the ticket is claimed, so a missing secret doesn't burn the student's code.
  const cfg = config();
  if (!cfg) return Response.json({ status: "not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const status = await linkGithub(String(body?.ticket ?? ""), { db, cfg, log: jsonLog });
  if (status === "linked") {
    // Start discovery now rather than at the next minute's cron tick.
    EdgeRuntime.waitUntil(runWorker({ db, cfg, log: jsonLog, budgetMs: 40_000 }).catch(() => undefined));
  }
  return Response.json({ status });
});
