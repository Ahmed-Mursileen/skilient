// billing-worker: renewal charges and refunds through the gateway adapters (PRD 4b.1). Woken each minute by
// pg_cron (private.wake_billing_worker) with a bearer secret from Vault (`billing_worker_secret`).
import postgres from "npm:postgres@3.4.9";
import { billingGateways } from "../_shared/billing/config.ts";
import { runBillingWorker } from "../_shared/billing/worker.ts";
import { dbFrom, jsonLog, safeEqual } from "../_shared/github/types.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));
const env = (name: string) => Deno.env.get(name);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const [row] = await db.query<{ secret: string }>("select decrypted_secret as secret from vault.decrypted_secrets where name = 'billing_worker_secret'");
  if (!row || !safeEqual(auth, `Bearer ${row.secret}`)) {
    return new Response(null, { status: 401 });
  }
  const gateways = billingGateways(env, { appUrl: env("SITE_URL") ?? "https://skilient.com", production: env("BILLING_PRODUCTION") === "1" });
  return Response.json(await runBillingWorker({ db, gateways, log: jsonLog }));
});
