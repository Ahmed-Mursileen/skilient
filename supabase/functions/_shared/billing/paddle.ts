/**
 * Paddle Billing (v2 API) as the USD merchant of record (decisions.md 2026-10-05). Disabled until
 * PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET are set.
 *
 * Confirmed from Paddle's public docs (and covered by tests with fixtures in tests/fixtures/billing/paddle):
 *   - Webhook signature: `Paddle-Signature: ts=<unix>;h1=<hex HMAC-SHA256 of "<ts>:<raw body>">` with the
 *     notification destination's secret; several h1 values may appear while a secret rotates.
 *   - Event envelope: { event_id, event_type, occurred_at, notification_id, data }.
 *   - Amounts are strings in minor units (`details.totals.grand_total`), currency in `currency_code`.
 * CONFIRM IN THE PADDLE SANDBOX before going live (marked `CONFIRM` below):
 *   - That Paddle onboards a Pakistan-registered seller at all (decisions.md: confirm before signing).
 *   - Non-catalog items with a `billing_cycle` create a Paddle subscription that Paddle renews itself;
 *     renewals then arrive as `transaction.completed` with `origin: "subscription_recurring"`.
 *   - `transaction.checkout.url` is returned only when a default payment link is set in the dashboard.
 *   - Full refunds through `POST /adjustments` with `type: "full"`.
 */
import { fromMinor, hmacHex, safeEqualHex, toMinor } from "./crypto.ts";
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

export interface PaddleConfig {
  apiKey?: string;
  webhookSecret?: string;
  environment: "sandbox" | "production";
}

export function paddleConfig(env: Env): PaddleConfig {
  return {
    apiKey: env("PADDLE_API_KEY") || undefined,
    webhookSecret: env("PADDLE_WEBHOOK_SECRET") || undefined,
    environment: env("PADDLE_ENVIRONMENT") === "production" ? "production" : "sandbox",
  };
}

export const PADDLE_SIGNATURE_HEADER = "paddle-signature";

interface PaddleTransaction {
  id: string;
  status?: string;
  origin?: string;
  currency_code?: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  invoice_number?: string | null;
  custom_data?: Record<string, unknown> | null;
  details?: { totals?: { grand_total?: string; total?: string } };
  payments?: { method_details?: { type?: string }; payment_method_id?: string | null; error_code?: string | null }[];
}

interface PaddleAdjustment {
  id: string;
  action?: string;
  status?: string;
  transaction_id?: string;
  currency_code?: string;
  totals?: { total?: string };
}

interface PaddleEnvelope {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  data: Record<string, unknown>;
}

/** Splits `ts=...;h1=...;h1=...` into its timestamp and every h1. */
export function parsePaddleSignature(header: string): { ts: number; h1: string[] } {
  const out = { ts: Number.NaN, h1: [] as string[] };
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "ts") out.ts = Number(v);
    if (k === "h1" && v) out.h1.push(v);
  }
  return out;
}

export async function signPaddle(secret: string, body: string, ts: number): Promise<string> {
  return `ts=${ts};h1=${await hmacHex("SHA-256", secret, `${ts}:${body}`)}`;
}

/** Turns one Paddle event into what the lifecycle reads; null for event types we don't act on. */
export function normalisePaddle(env: PaddleEnvelope): Omit<VerifiedEvent, "live" | "payload"> | null {
  if (env.event_type === "transaction.completed" || env.event_type === "transaction.payment_failed") {
    const t = env.data as unknown as PaddleTransaction;
    const recurring = t.origin === "subscription_recurring";
    const custom = t.custom_data ?? {};
    const event: BillingEvent = {
      gateway: "paddle",
      payment_id: t.id,
      amount: t.details?.totals?.grand_total ? fromMinor(t.details.totals.grand_total) : undefined,
      currency: t.currency_code === "USD" ? "USD" : t.currency_code === "PKR" ? "PKR" : undefined,
      method: "card",
      customer_ref: t.customer_id ?? undefined,
      subscription_ref: t.subscription_id ?? undefined,
      mor_invoice_ref: t.invoice_number ?? undefined,
      saved_method_ref: t.payments?.find((p) => p.payment_method_id)?.payment_method_id ?? undefined,
      reason: t.payments?.find((p) => p.error_code)?.error_code ?? undefined,
    };
    // A renewal carries the first checkout's custom data too: route it by subscription, not session.
    if (!recurring && typeof custom.session_id === "string") event.session_id = custom.session_id;
    return { eventId: env.event_id, type: env.event_type === "transaction.completed" ? "payment.succeeded" : "payment.failed", event };
  }
  if (env.event_type === "adjustment.created" || env.event_type === "adjustment.updated") {
    const a = env.data as unknown as PaddleAdjustment;
    if (a.action !== "refund" || a.status !== "approved") return null;
    return {
      eventId: env.event_id,
      type: "payment.refunded",
      event: {
        gateway: "paddle",
        payment_id: a.transaction_id,
        amount: a.totals?.total ? fromMinor(a.totals.total) : undefined,
        currency: a.currency_code === "USD" ? "USD" : "PKR",
      },
    };
  }
  return null;
}

export function createPaddleAdapter(cfg: PaddleConfig, fetchImpl: Fetch = fetch): GatewayAdapter {
  const api = cfg.environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const configured = Boolean(cfg.apiKey && cfg.webhookSecret);

  async function call<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    if (!cfg.apiKey) throw new GatewayUnavailable("paddle", "PADDLE_API_KEY is not set");
    const res = await fetchImpl(`${api}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "paddle-idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } };
    if (!res.ok || !json.data) throw new GatewayUnavailable("paddle", json.error?.code ?? `http_${res.status}`);
    return json.data;
  }

  return {
    id: "paddle",
    configured,
    live: cfg.environment === "production",

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      // CONFIRM: non-catalog items with billing_cycle, and the checkout URL from the default payment link.
      const txn = await call<{ id: string; checkout?: { url?: string } }>("/transactions", {
        items: [
          {
            quantity: 1,
            price: {
              description: input.description,
              name: input.description,
              unit_price: { amount: String(toMinor(input.amount)), currency_code: input.currency },
              ...(input.recurring ? { billing_cycle: { interval: "month", frequency: 1 } } : {}),
              product: { name: input.description, tax_category: "standard" },
            },
          },
        ],
        custom_data: { session_id: input.sessionId },
        collection_mode: "automatic",
        checkout: { url: input.returnUrl },
      }, input.sessionId);
      if (!txn.checkout?.url) throw new GatewayUnavailable("paddle", "no checkout url (set a default payment link in Paddle)");
      return { redirectUrl: txn.checkout.url, gatewaySessionRef: txn.id };
    },

    async verifyWebhook(rawBody: string, headers: Headers, nowMs = Date.now()): Promise<VerifiedEvent[]> {
      if (!cfg.webhookSecret) throw new WebhookRejected("not_configured");
      const header = headers.get(PADDLE_SIGNATURE_HEADER);
      if (!header) throw new WebhookRejected("missing_signature");
      const { ts, h1 } = parsePaddleSignature(header);
      if (!Number.isFinite(ts) || h1.length === 0) throw new WebhookRejected("missing_signature");
      const expected = await hmacHex("SHA-256", cfg.webhookSecret, `${ts}:${rawBody}`);
      if (!h1.some((sig) => safeEqualHex(expected, sig))) throw new WebhookRejected("bad_signature");
      if (Math.abs(nowMs - ts * 1000) > WEBHOOK_TOLERANCE_MS) throw new WebhookRejected("stale");
      let env: PaddleEnvelope;
      try {
        env = JSON.parse(rawBody) as PaddleEnvelope;
      } catch {
        throw new WebhookRejected("malformed");
      }
      if (typeof env.event_id !== "string" || typeof env.event_type !== "string" || !env.data) throw new WebhookRejected("malformed");
      const n = normalisePaddle(env);
      return n ? [{ ...n, live: cfg.environment === "production", payload: env }] : [];
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      // CONFIRM: full refunds without listing items. The refund's outcome arrives as adjustment.updated.
      const adj = await call<{ id: string; status?: string }>("/adjustments", {
        action: "refund",
        transaction_id: input.gatewayPaymentId,
        reason: input.reason ?? "Refund requested by Skilient accounts",
        type: "full",
      }, input.idempotencyKey);
      return { status: adj.status === "approved" ? "succeeded" : "pending", refundId: adj.id };
    },

    chargeSavedMethod(_input: ChargeInput): Promise<ChargeResult> {
      // Paddle renews its own subscriptions and sends transaction.completed / payment_failed.
      return Promise.resolve({ status: "deferred" });
    },
  };
}
