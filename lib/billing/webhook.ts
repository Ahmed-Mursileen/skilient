import { adapterFor, simulatedAllowed, type BillingGateways } from "@/supabase/functions/_shared/billing/config.ts";
import { WebhookRejected, type VerifiedEvent } from "@/supabase/functions/_shared/billing/types.ts";

/**
 * The webhook pipeline's first half (PRD 4b.12): verify the signature and timestamp with the gateway's
 * adapter, store each event once (gateway + event id unique) and queue it. Nothing else happens here;
 * `private.billing_process_events` applies events. The route and the simulated checkout both call this,
 * so a simulated payment travels exactly the path a real one does.
 */
export type RecordEvent = (gateway: string, e: VerifiedEvent) => Promise<{ duplicate: boolean }>;

export interface WebhookOutcome {
  status: number;
  outcome: "ok" | "refused" | "error";
  errorCode?: string;
  stored: number;
  duplicates: number;
}

export async function handleBillingWebhook(opts: {
  gateway: string;
  rawBody: string;
  headers: Headers;
  gateways: BillingGateways;
  record: RecordEvent;
  nowMs?: number;
}): Promise<WebhookOutcome> {
  const adapter = adapterFor(opts.gateways, opts.gateway);
  if (!adapter) return { status: 404, outcome: "refused", errorCode: "unknown_gateway", stored: 0, duplicates: 0 };
  if (adapter.id === "simulated" ? !simulatedAllowed(opts.gateways) : !adapter.configured) {
    return { status: 404, outcome: "refused", errorCode: "gateway_disabled", stored: 0, duplicates: 0 };
  }
  let events: VerifiedEvent[];
  try {
    events = await adapter.verifyWebhook(opts.rawBody, opts.headers, opts.nowMs);
  } catch (e) {
    if (e instanceof WebhookRejected) {
      return { status: e.reason === "malformed" ? 400 : 401, outcome: "refused", errorCode: e.reason, stored: 0, duplicates: 0 };
    }
    return { status: 500, outcome: "error", errorCode: "verify_failed", stored: 0, duplicates: 0 };
  }
  let stored = 0;
  let duplicates = 0;
  for (const e of events) {
    try {
      const r = await opts.record(adapter.id, e);
      if (r.duplicate) duplicates++;
      else stored++;
    } catch {
      // The gateway retries on a 5xx; the event id makes the retry safe.
      return { status: 500, outcome: "error", errorCode: "store_failed", stored, duplicates };
    }
  }
  return { status: 200, outcome: "ok", stored, duplicates };
}
