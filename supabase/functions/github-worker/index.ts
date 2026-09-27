// github-worker: drains the github_jobs queue (PRD 5.5 "Import pipeline"). Woken each
// minute by pg_cron (private.wake_github_worker) with a bearer secret generated in the
// database; nothing else may call it.
import postgres from "npm:postgres@3.4.9";
import { runWorker } from "../_shared/github/worker.ts";
import { configFromEnv, dbFrom, jsonLog, safeEqual } from "../_shared/github/types.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const [row] = await db.query<{ secret: string }>(
    "select decrypted_secret as secret from vault.decrypted_secrets where name = 'github_worker_secret'",
  );
  if (!row || !safeEqual(auth, `Bearer ${row.secret}`)) {
    return new Response(null, { status: 401 });
  }
  let cfg;
  try {
    cfg = configFromEnv((name) => Deno.env.get(name));
  } catch (error) {
    jsonLog("github.worker", { outcome: "error", error_code: error instanceof Error ? error.message : "config" });
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  return Response.json(await runWorker({ db, cfg, log: jsonLog }));
});
