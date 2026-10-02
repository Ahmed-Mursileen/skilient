/**
 * Billing gateways (PRD 4b.1): one interface for every payment gateway, shared by the Next app
 * (checkout, webhook route) and the billing-worker Edge Function (renewal charges, refunds).
 * Plain TypeScript, web APIs only, relative `.ts` imports, no Deno or Node globals.
 *
 * Swapping the simulated gateway for a real one changes only the adapter and its env vars:
 * every adapter turns its gateway's webhook into the same normalised `BillingEvent`, and the
 * lifecycle (supabase/migrations/*_billing_lifecycle.sql) only ever reads that.
 */

export type GatewayId = "simulated" | "safepay" | "paddle";
export type Currency = "PKR" | "USD";

/** What the lifecycle understands. Anything else a gateway sends is acknowledged and ignored. */
export type BillingEventType = "payment.succeeded" | "payment.failed" | "payment.refunded" | "checkout.cancelled";

/** The adapter's reading of one gateway event (stored as `billing_webhook_events.event`). */
export interface BillingEvent {
  /** Our checkout session id, carried through the gateway as metadata. */
  session_id?: string;
  /** Our subscription id, for renewals charged by the worker (or by the gateway itself). */
  subscription_id?: string;
  /** The gateway's id for the payment (refunds name the payment they refund). */
  payment_id?: string;
  /** In major units (PKR 399.00, USD 55.00). */
  amount?: number;
  currency?: Currency;
  method?: "card" | "wallet";
  /** A token the gateway gives for a saved card; never card details. */
  saved_method_ref?: string;
  customer_ref?: string;
  subscription_ref?: string;
  /** The merchant of record's own invoice number (USD sales). */
  mor_invoice_ref?: string;
  reason?: string;
  gateway?: GatewayId;
}

export interface VerifiedEvent {
  eventId: string;
  type: BillingEventType;
  event: BillingEvent;
  /** False for sandbox and simulated events: never revenue. */
  live: boolean;
  /** The gateway's body as received, for the record. */
  payload: unknown;
}

export interface CreateSessionInput {
  sessionId: string;
  amount: number;
  currency: Currency;
  description: string;
  customerEmail?: string;
  /** Where the gateway sends the payer back; the page polls our database, never trusts the redirect. */
  returnUrl: string;
  cancelUrl: string;
  /** Save the card for automatic renewals (subscriptions only). */
  recurring: boolean;
}

export interface CreateSessionResult {
  redirectUrl: string;
  gatewaySessionRef: string;
}

export interface RefundInput {
  gatewayPaymentId: string;
  amount: number;
  currency: Currency;
  idempotencyKey: string;
  reason?: string;
}

export interface RefundResult {
  status: "succeeded" | "pending" | "failed";
  refundId?: string;
  error?: string;
}

export interface ChargeInput {
  subscriptionId: string;
  savedMethodRef?: string | null;
  customerRef?: string | null;
  subscriptionRef?: string | null;
  amount: number;
  currency: Currency;
  idempotencyKey: string;
  /** Simulated gateway only: the staff test tool asked for this charge to fail. */
  simulateFail?: boolean;
}

export interface ChargeResult {
  /** `deferred`: the gateway runs the renewal itself and will send a webhook. */
  status: "succeeded" | "failed" | "deferred";
  paymentId?: string;
  reason?: string;
}

export interface GatewayAdapter {
  id: GatewayId;
  /** True when keys are present for this adapter. */
  configured: boolean;
  /** True only for production keys: payments are real money. */
  live: boolean;
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  /** Checks signature and timestamp (5 minutes) and normalises. Throws WebhookRejected. */
  verifyWebhook(rawBody: string, headers: Headers, nowMs?: number): Promise<VerifiedEvent[]>;
  refund(input: RefundInput): Promise<RefundResult>;
  chargeSavedMethod(input: ChargeInput): Promise<ChargeResult>;
}

export class WebhookRejected extends Error {
  constructor(readonly reason: "missing_signature" | "bad_signature" | "stale" | "malformed" | "not_configured") {
    super(reason);
    this.name = "WebhookRejected";
  }
}

export class GatewayUnavailable extends Error {
  constructor(readonly gateway: string, message: string) {
    super(message);
    this.name = "GatewayUnavailable";
  }
}

/** Webhooks older (or newer) than this are refused (PRD 4b.12). */
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export type Env = (name: string) => string | undefined;
export type Fetch = typeof fetch;
