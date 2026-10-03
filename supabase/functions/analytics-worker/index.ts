// analytics-worker: drains the analytics outbox (pgmq `analytics`) into PostHog EU and deletes the
// PostHog data of deleted accounts (PRD 10). Woken each minute by pg_cron
// (private.wake_analytics_worker) with a bearer secret generated in the database; nothing else may
// call it.
import postgres from "npm:postgres@3.4.9";
import { dbFrom, jsonLog, safeEqual } from "../_shared/github/types.ts";
import { analyticsConfigFromEnv, runAnalyticsWorker } from "../_shared/analytics/worker.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const [row] = await db.query<{ secret: string }>(
    "select decrypted_secret as secret from vault.decrypted_secrets where name = 'analytics_worker_secret'",
  );
  if (!row || !safeEqual(auth, `Bearer ${row.secret}`)) {
    return new Response(null, { status: 401 });
  }
  let cfg;
  try {
    cfg = analyticsConfigFromEnv((name) => Deno.env.get(name));
  } catch (error) {
    jsonLog("analytics.worker", { outcome: "error", error_code: error instanceof Error ? error.message : "config" });
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  return Response.json(await runAnalyticsWorker({ db, cfg, fetch, log: jsonLog }));
});
