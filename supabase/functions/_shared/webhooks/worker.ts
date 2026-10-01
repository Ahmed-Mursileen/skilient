/**
 * webhook-worker (PRD 5.20): delivers `application.created` and `contact.accepted` to an
 * organisation's endpoints. Each delivery is checked like a link preview fetch (https only, a public
 * address, no redirects followed) and signed with HMAC-SHA256 over `<timestamp>.<body>`:
 *
 *   X-Skilient-Signature: t=<unix seconds>,v1=<hex>
 *
 * The receiver rebuilds the HMAC from its secret and rejects a timestamp older than five minutes.
 * Failures back off 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours (in the database), then stop.
 */
import type { Db, Log } from "../github/types.ts";
import { checkHost, checkUrl, PreviewRefused, type Resolve } from "../links/ssrf.ts";

interface DueRow {
  id: number | string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
  attempt: number;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The signature header for a body at a time. Exported so receivers' docs and tests share one definition. */
export async function signWebhook(secret: string, body: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `t=${timestamp},v1=${hex(mac)}`;
}

export async function runWebhookWorker(opts: {
  db: Db;
  fetch: typeof fetch;
  resolve: Resolve;
  log: Log;
  now?: () => number;
  budgetMs?: number;
  batch?: number;
}): Promise<{ delivered: number; failed: number }> {
  const { db, log } = opts;
  const out = { delivered: 0, failed: 0 };
  const rows = await db.query<DueRow>("select id, url, secret, event, payload, attempt from private.webhook_due($1::integer)", [opts.batch ?? 20]);
  for (const row of rows) {
    let ok = false;
    let status: number | null = null;
    let error: string | null = null;
    try {
      const url = checkUrl(row.url);
      if (url.protocol !== "https:") throw new PreviewRefused("scheme");
      await checkHost(url, opts.resolve);
      const body = JSON.stringify({ ...row.payload, delivery_id: String(row.id), attempt: row.attempt + 1 });
      const timestamp = Math.floor((opts.now?.() ?? Date.now()) / 1000);
      const res = await opts.fetch(url.toString(), {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(opts.budgetMs ?? 10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "SkilientWebhooks/1.0",
          "x-skilient-event": row.event,
          "x-skilient-signature": await signWebhook(row.secret, body, timestamp),
        },
        body,
      });
      status = res.status;
      ok = res.status >= 200 && res.status < 300;
      if (!ok) error = res.status >= 300 && res.status < 400 ? "redirect_not_followed" : `http_${res.status}`;
    } catch (e) {
      error = e instanceof PreviewRefused ? e.reason : "network";
    }
    await db.query("select private.webhook_result($1::bigint, $2::boolean, $3::integer, $4)", [row.id, ok, status, error]);
    if (ok) out.delivered++;
    else out.failed++;
    log("webhooks.deliver", { outcome: ok ? "ok" : "error", event: row.event, status, error });
  }
  return out;
}
