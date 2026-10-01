/**
 * Safepay as the local PKR gateway (cards, and wallets where Safepay offers them; decisions.md 2026-10-05).
 * Disabled until SAFEPAY_API_KEY, SAFEPAY_SECRET_KEY and SAFEPAY_WEBHOOK_SECRET are set.
 *
 * Implemented from Safepay's public docs and its open-source Node SDK (`@sfpy/node-sdk`):
 *   - Payment: POST {api}/order/v1/init {client, amount, currency, environment} → data.token (the tracker),
 *     then the hosted checkout at {api}/components?env=…&beacon=<token>&order_id=…&source=custom&redirect_url=…&cancel_url=….
 *   - Webhook: header `X-SFPY-SIGNATURE` = hex HMAC-SHA512 of JSON.stringify(body.data) with the webhook secret
 *     (the SDK's `verify.webhook`). The body carries no signed timestamp, so the 5-minute window uses
 *     `data.created_at` when present.
 * CONFIRM IN THE SAFEPAY SANDBOX before going live (marked `CONFIRM` below; see docs/setup-checklist.md):
 *   - The webhook event names and fields (`payment:created`, `notification.state`, `metadata.order_id`).
 *   - JazzCash and Easypaisa on the hosted checkout, and how the payment method is reported.
 *   - Refunds through the API (until confirmed, refunds fail here and staff refund in the Safepay dashboard).
 *   - Saved cards: until Safepay's tokenisation is confirmed, every Safepay payment is a prepaid period with
 *     reminders (no saved card, so no automatic renewal); `chargeSavedMethod` is never reached.
 */
import { fromMinor, hmacHex, safeEqualHex } from "./crypto.ts";
import {
  type BillingEvent,
  type ChargeInput,
  type ChargeResult,
  type CreateSessionInput,
  type CreateSessionResult,
  type Env,
  type Fetch,
  type GatewayAdapter,
  GatewayUnavailable,
  type RefundInput,
  type RefundResult,
  type VerifiedEvent,
  WEBHOOK_TOLERANCE_MS,
  WebhookRejected,
} from "./types.ts";

export interface SafepayConfig {
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  environment: "sandbox" | "production";
}

export function safepayConfig(env: Env): SafepayConfig {
  return {
    apiKey: env("SAFEPAY_API_KEY") || undefined,
    secretKey: env("SAFEPAY_SECRET_KEY") || undefined,
    webhookSecret: env("SAFEPAY_WEBHOOK_SECRET") || undefined,
    environment: env("SAFEPAY_ENVIRONMENT") === "production" ? "production" : "sandbox",
  };
}

export const SAFEPAY_SIGNATURE_HEADER = "x-sfpy-signature";

interface SafepayNotification {
  tracker?: string;
  reference?: string;
  state?: string;
  amount?: number;
  currency?: string;
  payment_method?: string;
  metadata?: Record<string, unknown> | null;
  order_id?: string;
}

interface SafepayBody {
  data?: {
    type?: string;
    token?: string;
    created_at?: { seconds?: number } | string;
    notification?: SafepayNotification;
  };
}

export async function signSafepay(secret: string, data: unknown): Promise<string> {
  return hmacHex("SHA-512", secret, JSON.stringify(data));
}

function createdMs(created: { seconds?: number } | string | undefined): number | null {
  if (!created) return null;
  if (typeof created === "string") {
    const ms = Date.parse(created);
    return Number.isNaN(ms) ? null : ms;
  }
  return typeof created.seconds === "number" ? created.seconds * 1000 : null;
}

/** CONFIRM: event names and fields against real sandbox deliveries. */
export function normaliseSafepay(body: SafepayBody, eventId: string): Omit<VerifiedEvent, "live" | "payload"> | null {
  const data = body.data;
  const n = data?.notification;
  if (!data || !n) return null;
  const sessionId = typeof n.metadata?.order_id === "string" ? n.metadata.order_id : n.order_id;
  const event: BillingEvent = {
    gateway: "safepay",
    session_id: sessionId,
    payment_id: n.tracker,
    // Safepay reports amounts in paisa on webhooks (the SDK's examples); CONFIRM.
    amount: typeof n.amount === "number" ? fromMinor(n.amount) : undefined,
    currency: n.currency === "USD" ? "USD" : "PKR",
    method: n.payment_method && /jazz|easy|wallet/i.test(n.payment_method) ? "wallet" : "card",
  };
  if (data.type === "payment:created" && (n.state ?? "PAID").toUpperCase() === "PAID") return { eventId, type: "payment.succeeded", event };
  if (data.type === "payment:failed" || (n.state ?? "").toUpperCase() === "FAILED") return { eventId, type: "payment.failed", event: { ...event, reason: n.state } };
  if (data.type === "refund:created") return { eventId, type: "payment.refunded", event };
  return null;
}

export function createSafepayAdapter(cfg: SafepayConfig, fetchImpl: Fetch = fetch): GatewayAdapter {
  const api = cfg.environment === "production" ? "https://api.getsafepay.com" : "https://sandbox.api.getsafepay.com";
  const configured = Boolean(cfg.apiKey && cfg.secretKey && cfg.webhookSecret);

  return {
    id: "safepay",
    configured,
    live: cfg.environment === "production",

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      if (!cfg.apiKey) throw new GatewayUnavailable("safepay", "SAFEPAY_API_KEY is not set");
      const res = await fetchImpl(`${api}/order/v1/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client: cfg.apiKey, amount: input.amount, currency: input.currency, environment: cfg.environment }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { token?: string } };
      const token = json.data?.token;
      if (!res.ok || !token) throw new GatewayUnavailable("safepay", `init failed (http_${res.status})`);
      const url = new URL(`${api}/components`);
      url.searchParams.set("env", cfg.environment);
      url.searchParams.set("beacon", token);
      url.searchParams.set("source", "custom");
      url.searchParams.set("order_id", input.sessionId);
      url.searchParams.set("redirect_url", input.returnUrl);
      url.searchParams.set("cancel_url", input.cancelUrl);
      return { redirectUrl: url.toString(), gatewaySessionRef: token };
    },

    async verifyWebhook(rawBody: string, headers: Headers, nowMs = Date.now()): Promise<VerifiedEvent[]> {
      if (!cfg.webhookSecret) throw new WebhookRejected("not_configured");
      const signature = headers.get(SAFEPAY_SIGNATURE_HEADER);
      if (!signature) throw new WebhookRejected("missing_signature");
      let body: SafepayBody;
      try {
        body = JSON.parse(rawBody) as SafepayBody;
      } catch {
        throw new WebhookRejected("malformed");
      }
      if (!body.data) throw new WebhookRejected("malformed");
      if (!safeEqualHex(await signSafepay(cfg.webhookSecret, body.data), signature)) throw new WebhookRejected("bad_signature");
      const at = createdMs(body.data.created_at);
      if (at !== null && Math.abs(nowMs - at) > WEBHOOK_TOLERANCE_MS) throw new WebhookRejected("stale");
      // Safepay sends no event id; the tracker plus the event type is unique per delivery kind.
      const eventId = `${body.data.notification?.tracker ?? body.data.token ?? "unknown"}:${body.data.type ?? "event"}`;
      const n = normaliseSafepay(body, eventId);
      return n ? [{ ...n, live: cfg.environment === "production", payload: body }] : [];
    },

    refund(_input: RefundInput): Promise<RefundResult> {
      // CONFIRM: Safepay's refund API. Until then staff refund in the Safepay dashboard and record it.
      return Promise.resolve({ status: "failed", error: "Refund in the Safepay dashboard until its refund API is confirmed" });
    },

    chargeSavedMethod(_input: ChargeInput): Promise<ChargeResult> {
      // Never reached until saved cards are confirmed (Safepay payments carry no saved method).
      return Promise.resolve({ status: "failed", reason: "saved_cards_not_enabled" });
    },
  };
}
