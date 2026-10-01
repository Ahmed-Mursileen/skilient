/**
 * billing-worker (PRD 4b.1): the only billing code that calls a gateway on its own. It takes jobs the
 * database queued (pgmq `billing_jobs`): renewal charges on saved cards and staff refunds. Each outcome is
 * recorded as an event exactly like a webhook (`record_billing_event`, gateway `worker`) and applied by the
 * same SQL, so the lifecycle has one path whatever the gateway.
 */
import type { Db, Log } from "../github/types.ts";
import { adapterFor, type BillingGateways } from "./config.ts";
import type { Currency } from "./types.ts";

interface Job {
  kind: "charge" | "refund";
  subscription_id?: string;
  payment_id?: string;
  gateway: string;
  live?: boolean;
  saved_method_ref?: string | null;
  customer_ref?: string | null;
  subscription_ref?: string | null;
  gateway_payment_id?: string;
  amount: number | string;
  currency: Currency;
  idempotency_key: string;
  simulate_fail?: boolean;
}

interface Row {
  msg_id: string | number;
  read_ct: number;
  job: Job;
}

async function record(db: Db, eventId: string, type: string, payload: unknown, event: Record<string, unknown>, live: boolean) {
  await db.query("select private.record_billing_event('worker', $1, $2, $3::jsonb, $4::jsonb, $5::boolean)", [
    eventId,
    type,
    JSON.stringify(payload),
    JSON.stringify(event),
    live,
  ]);
}

export async function runBillingWorker(opts: {
  db: Db;
  gateways: BillingGateways;
  log: Log;
  batch?: number;
}): Promise<{ charged: number; failed: number; deferred: number; refunded: number; errors: number }> {
  const { db, log } = opts;
  const out = { charged: 0, failed: 0, deferred: 0, refunded: 0, errors: 0 };
  const rows = await db.query<Row>("select msg_id, read_ct, job from private.billing_jobs_read($1::integer)", [opts.batch ?? 10]);
  for (const row of rows) {
    const job = row.job;
    const adapter = adapterFor(opts.gateways, job.gateway);
    try {
      if (!adapter) throw new Error(`no adapter for ${job.gateway}`);
      if (job.kind === "charge") {
        const res = await adapter.chargeSavedMethod({
          subscriptionId: job.subscription_id!,
          savedMethodRef: job.saved_method_ref,
          customerRef: job.customer_ref,
          subscriptionRef: job.subscription_ref,
          amount: Number(job.amount),
          currency: job.currency,
          idempotencyKey: job.idempotency_key,
          simulateFail: job.simulate_fail,
        });
        if (res.status === "deferred") {
          out.deferred++;
        } else {
          await record(db, `charge:${job.idempotency_key}`, res.status === "succeeded" ? "payment.succeeded" : "payment.failed", res, {
            subscription_id: job.subscription_id,
            gateway: job.gateway,
            payment_id: res.paymentId,
            amount: Number(job.amount),
            currency: job.currency,
            method: "card",
            reason: res.reason,
          }, Boolean(job.live));
          if (res.status === "succeeded") out.charged++;
          else out.failed++;
        }
      } else {
        const res = await adapter.refund({
          gatewayPaymentId: job.gateway_payment_id!,
          amount: Number(job.amount),
          currency: job.currency,
          idempotencyKey: job.idempotency_key,
        });
        if (res.status === "failed") throw new Error(res.error ?? "refund failed");
        if (res.status === "succeeded") {
          await record(db, `refund:${job.idempotency_key}`, "payment.refunded", res, {
            gateway: job.gateway,
            payment_id: job.gateway_payment_id,
            amount: Number(job.amount),
            currency: job.currency,
          }, Boolean(job.live));
          out.refunded++;
        }
      }
      await db.query("select private.billing_job_done($1::bigint)", [row.msg_id]);
      log("billing.job", { outcome: "ok", kind: job.kind, gateway: job.gateway });
    } catch (e) {
      out.errors++;
      const message = e instanceof Error ? e.message : String(e);
      await db.query("select private.billing_job_failed($1::bigint, $2::integer, $3::jsonb, $4)", [row.msg_id, row.read_ct, JSON.stringify(job), message]);
      log("billing.job", { outcome: "error", kind: job.kind, gateway: job.gateway, error: message.slice(0, 200) });
    }
  }
  // Apply what was just recorded now rather than waiting for the 10-second job.
  if (out.charged + out.failed + out.refunded > 0) await db.query("select private.billing_process_events()");
  return out;
}
