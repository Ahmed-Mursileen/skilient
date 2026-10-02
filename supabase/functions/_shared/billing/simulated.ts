/**
 * The simulated gateway (decisions.md 2026-10-05): no money moves. Its checkout is a page in our app
 * (/billing/checkout/[session]); the page's server action produces the gateway's "result" as a webhook
 * signed with SIMULATED_GATEWAY_SECRET, which goes through the same webhook handler as a real gateway
 * (verify → store once → queue → apply). Every event it produces is a test (`live: false`).
 *
 *   X-Simulated-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
 */
import { hmacHex, safeEqualHex } from "./crypto.ts";
import {
  type BillingEvent,
  type BillingEventType,
  type ChargeInput,
  type ChargeResult,
  type CreateSessionInput,
  type CreateSessionResult,
  type GatewayAdapter,
  type RefundInput,
  type RefundResult,
  type VerifiedEvent,
  WEBHOOK_TOLERANCE_MS,
  WebhookRejected,
} from "./types.ts";

export const SIMULATED_SIGNATURE_HEADER = "x-simulated-signature";

export interface SimulatedBody {
  id: string;
  type: BillingEventType;
  created: number;
  data: BillingEvent;
}

export async function signSimulated(secret: string, body: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex("SHA-256", secret, `${timestamp}.${body}`)}`;
}

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return prefix + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds and signs one simulated gateway event (used by the checkout page's action and by tests). */
export async function simulatedWebhook(
  secret: string,
  type: BillingEventType,
  data: BillingEvent,
  nowMs = Date.now(),
): Promise<{ body: string; headers: Headers }> {
  const body = JSON.stringify({ id: randomId("evt_sim_"), type, created: Math.floor(nowMs / 1000), data } satisfies SimulatedBody);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set(SIMULATED_SIGNATURE_HEADER, await signSimulated(secret, body, Math.floor(nowMs / 1000)));
  return { body, headers };
}

export function newSimulatedPaymentId(): string {
  return randomId("pay_sim_");
}

export function createSimulatedAdapter(opts: { secret: string | undefined; appUrl: string }): GatewayAdapter {
  const secret = opts.secret ?? "";
  return {
    id: "simulated",
    configured: secret.length >= 32,
    live: false,

    createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      return Promise.resolve({
        redirectUrl: `${opts.appUrl.replace(/\/$/, "")}/billing/checkout/${input.sessionId}`,
        gatewaySessionRef: input.sessionId,
      });
    },

    async verifyWebhook(rawBody: string, headers: Headers, nowMs = Date.now()): Promise<VerifiedEvent[]> {
      if (secret.length < 32) throw new WebhookRejected("not_configured");
      const header = headers.get(SIMULATED_SIGNATURE_HEADER);
      if (!header) throw new WebhookRejected("missing_signature");
      const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
      const t = Number(parts.t);
      if (!Number.isFinite(t) || !parts.v1) throw new WebhookRejected("missing_signature");
      if (!safeEqualHex(await hmacHex("SHA-256", secret, `${t}.${rawBody}`), parts.v1)) throw new WebhookRejected("bad_signature");
      if (Math.abs(nowMs - t * 1000) > WEBHOOK_TOLERANCE_MS) throw new WebhookRejected("stale");
      let body: SimulatedBody;
      try {
        body = JSON.parse(rawBody) as SimulatedBody;
      } catch {
        throw new WebhookRejected("malformed");
      }
      if (typeof body.id !== "string" || !body.data || typeof body.type !== "string") throw new WebhookRejected("malformed");
      return [{ eventId: body.id, type: body.type, event: { ...body.data, gateway: "simulated" }, live: false, payload: body }];
    },

    refund(input: RefundInput): Promise<RefundResult> {
      return Promise.resolve({ status: "succeeded", refundId: `re_sim_${input.idempotencyKey.replace(/[^a-z0-9]/gi, "").slice(-24)}` });
    },

    chargeSavedMethod(input: ChargeInput): Promise<ChargeResult> {
      if (input.simulateFail) return Promise.resolve({ status: "failed", reason: "card_declined" });
      if (!input.savedMethodRef) return Promise.resolve({ status: "failed", reason: "no_saved_method" });
      return Promise.resolve({ status: "succeeded", paymentId: newSimulatedPaymentId() });
    },
  };
}
