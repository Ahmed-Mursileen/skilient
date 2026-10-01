import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleBillingWebhook, type RecordEvent } from "../../lib/billing/webhook.ts";
import { billingGateways } from "../../supabase/functions/_shared/billing/config.ts";
import { PADDLE_SIGNATURE_HEADER, signPaddle } from "../../supabase/functions/_shared/billing/paddle.ts";
import { simulatedWebhook } from "../../supabase/functions/_shared/billing/simulated.ts";
import { runBillingWorker } from "../../supabase/functions/_shared/billing/worker.ts";
import { asUser, cleanup, db, orgWithAdmin, sql, student, tag } from "./billing-support.ts";

/**
 * PRD 4b.13 B2: the whole pipeline on the local database. A gateway's signed result goes through the webhook
 * handler (verify → store once → queue), the 10-second job applies it, the worker charges renewals and refunds
 * through the adapter, and a replay changes nothing. The simulated gateway drives every transition; the Paddle
 * fixtures (tests/fixtures/billing) prove a real adapter feeds the same lifecycle.
 */
const SECRET = "sim_" + "s".repeat(40);
const PADDLE_SECRET = "pdl_" + "p".repeat(40);
const env = (vars: Record<string, string>) => (name: string) => vars[name];
const gateways = billingGateways(env({ SIMULATED_GATEWAY_SECRET: SECRET, BILLING_GATEWAY_MOR: "paddle", PADDLE_API_KEY: "pdl_test", PADDLE_WEBHOOK_SECRET: PADDLE_SECRET }), {
  appUrl: "http://127.0.0.1:3000",
  production: false,
});
const log = () => undefined;
const record: RecordEvent = async (gateway, e) => {
  const [row] = await sql`select private.record_billing_event(${gateway}, ${e.eventId}, ${e.type}, ${sql.json(e.payload as never)}, ${sql.json(e.event as never)}, ${e.live}) as r`;
  return { duplicate: Boolean((row!.r as { duplicate: boolean }).duplicate) };
};
const process_ = async () => (await sql`select private.billing_process_events() as n`)[0]!.n as number;
const t = tag();
let s1 = "";
let staff = "";
let org = { org: "", admin: "" };

async function checkout(user: string, aal: "aal1" | "aal2", subject: string, plan: string, currency: string, gateway: string): Promise<string> {
  return asUser(user, aal, async (tx) => {
    const [row] = await tx`select public.create_checkout(${subject}, ${plan}, ${currency}, ${gateway}, ${`k-${t}-${plan}-${currency}-${gateway}-${Date.now()}`}) as r`;
    return (row!.r as { session_id: string }).session_id;
  });
}
const sub = async (id: string) => (await sql`select * from public.subscriptions where subject_id = ${id} order by created_at desc limit 1`)[0]!;

beforeAll(async () => {
  s1 = await student(t, 1);
  org = await orgWithAdmin(t);
  staff = await student(t, 9);
  await sql`insert into public.staff_roles (user_id, role) values (${staff}, 'accounts')`;
});
afterAll(async () => {
  await sql`delete from public.staff_roles where user_id = ${staff}`;
  await cleanup([s1], [org.org]);
  await sql.end();
});

describe("simulated gateway through the real pipeline", () => {
  let session = "";
  let body = "";
  let headers = new Headers();

  it("a card payment activates Student Pro with a saved card", async () => {
    session = await checkout(s1, "aal1", "user", "student_pro_monthly", "PKR", "simulated");
    const hook = await simulatedWebhook(SECRET, "payment.succeeded", { session_id: session, payment_id: `pay_sim_${t}`, amount: 399, currency: "PKR", method: "card", saved_method_ref: `card_${t}` });
    body = hook.body;
    headers = hook.headers;
    expect(await handleBillingWebhook({ gateway: "simulated", rawBody: body, headers, gateways, record })).toMatchObject({ status: 200, stored: 1, duplicates: 0 });
    expect(await process_()).toBeGreaterThanOrEqual(1);
    expect(await sub(s1)).toMatchObject({ status: "active", plan_id: "student_pro_monthly", payment_method: "card", live: false });
    const [{ ok }] = await sql`select private.has_entitlement(${s1}, 'cv.pdf_export') as ok`;
    expect(ok).toBe(true);
  });

  it("a replayed webhook changes nothing", async () => {
    const before = await sub(s1);
    const counts = async () => (await sql`select (select count(*) from public.payments where subject_id = ${s1})::int as p, (select count(*) from public.invoices where subject_id = ${s1})::int as i,
                                                 (select count(*) from public.entitlement_grants where subject_id = ${s1})::int as g`)[0];
    const c0 = await counts();
    expect(await handleBillingWebhook({ gateway: "simulated", rawBody: body, headers, gateways, record })).toMatchObject({ status: 200, stored: 0, duplicates: 1 });
    await process_();
    expect(await counts()).toEqual(c0);
    expect((await sub(s1)).current_period_end).toEqual(before.current_period_end);
  });

  it("a tampered or unsigned webhook is refused before anything is stored", async () => {
    const n0 = (await sql`select count(*)::int as n from public.billing_webhook_events`)[0]!.n;
    expect((await handleBillingWebhook({ gateway: "simulated", rawBody: body.replace("399", "1"), headers, gateways, record })).status).toBe(401);
    expect((await handleBillingWebhook({ gateway: "simulated", rawBody: body, headers: new Headers(), gateways, record })).status).toBe(401);
    expect((await handleBillingWebhook({ gateway: "stripe", rawBody: body, headers, gateways, record })).status).toBe(404);
    expect((await sql`select count(*)::int as n from public.billing_webhook_events`)[0]!.n).toBe(n0);
  });

  it("the worker renews on the saved card at the period end", async () => {
    await sql`update public.subscriptions set current_period_start = now() - interval '31 days', current_period_end = now() where subject_id = ${s1} and status = 'active'`;
    await sql`select private.billing_tick()`;
    expect((await sub(s1)).charge_pending).toBe(true);
    expect(await runBillingWorker({ db, gateways, log })).toMatchObject({ charged: 1, errors: 0 });
    const s = await sub(s1);
    expect(s.status).toBe("active");
    expect(s.charge_pending).toBe(false);
    expect(new Date(s.current_period_end).getTime()).toBeGreaterThan(Date.now() + 27 * 86400_000);
    expect(await runBillingWorker({ db, gateways, log })).toMatchObject({ charged: 0, failed: 0 });
  });

  it("a declined renewal makes it past due, and the retry succeeds", async () => {
    await sql`update public.subscriptions set simulate_fail_next = true, current_period_start = now() - interval '31 days', current_period_end = now() where subject_id = ${s1} and status = 'active'`;
    await sql`select private.billing_tick()`;
    expect(await runBillingWorker({ db, gateways, log })).toMatchObject({ failed: 1 });
    expect(await sub(s1)).toMatchObject({ status: "past_due", retry_count: 1 });
    await sql`update public.subscriptions set next_retry_at = now(), simulate_fail_next = false where subject_id = ${s1} and status = 'past_due'`;
    await sql`select private.billing_tick()`;
    expect(await runBillingWorker({ db, gateways, log })).toMatchObject({ charged: 1 });
    expect(await sub(s1)).toMatchObject({ status: "active", retry_count: 0 });
  });

  it("a staff refund goes through the adapter and ends what it bought", async () => {
    const [pay] = await sql`select id, amount from public.payments where subject_id = ${s1} order by created_at desc limit 1`;
    await asUser(staff, "aal2", (tx) => tx`select public.ops_refund(${pay!.id}, null, 'Charged twice by mistake')`);
    expect(await runBillingWorker({ db, gateways, log })).toMatchObject({ refunded: 1 });
    expect((await sql`select status from public.payments where id = ${pay!.id}`)[0]!.status).toBe("refunded");
    expect((await sub(s1)).status).toBe("expired");
    expect((await sql`select count(*)::int as n from public.invoices where subject_id = ${s1} and kind = 'credit_note'`)[0]!.n).toBe(1);
    expect((await sql`select count(*)::int as n from public.ops_audit_log where action = 'billing.refund' and target_id = ${pay!.id}::text`)[0]!.n).toBe(1);
  });
});

describe("Paddle fixtures through the same pipeline", () => {
  const fixture = (name: string, session: string) => readFileSync(join(process.cwd(), "tests", "fixtures", "billing", "paddle", name), "utf8").replaceAll("SESSION_ID", session).replaceAll("_01hv8x", `_${t}x`).replaceAll("_01hw", `_${t}w`);
  const sign = async (body: string) => new Headers({ [PADDLE_SIGNATURE_HEADER]: await signPaddle(PADDLE_SECRET, body, Math.floor(Date.now() / 1000)) });

  it("a USD payment activates the organisation's plan, with the merchant of record's invoice", async () => {
    const session = await checkout(org.admin, "aal2", "org", "recruiter_starter_monthly", "USD", "paddle");
    const body = fixture("transaction.completed.json", session);
    expect(await handleBillingWebhook({ gateway: "paddle", rawBody: body, headers: await sign(body), gateways, record })).toMatchObject({ status: 200, stored: 1 });
    await process_();
    expect(await sub(org.org)).toMatchObject({ status: "active", gateway: "paddle", currency: "USD", live: false });
    const [pay] = await sql`select currency, mor_invoice_ref, invoice_id from public.payments where subject_id = ${org.org}`;
    expect(pay).toMatchObject({ currency: "USD", mor_invoice_ref: "325-10024", invoice_id: null });
  });

  it("Paddle's own renewal is matched by subscription and rolls the period", async () => {
    await sql`update public.subscriptions set current_period_start = now() - interval '31 days', current_period_end = now() where subject_id = ${org.org}`;
    await sql`select private.billing_tick()`;
    expect(await runBillingWorker({ db, gateways, log })).toMatchObject({ deferred: 1 });
    const body = fixture("transaction.completed.recurring.json", "ignored");
    await handleBillingWebhook({ gateway: "paddle", rawBody: body, headers: await sign(body), gateways, record });
    await process_();
    const s = await sub(org.org);
    expect(s.status).toBe("active");
    expect(new Date(s.current_period_end).getTime()).toBeGreaterThan(Date.now() + 27 * 86400_000);
    expect((await sql`select count(*)::int as n from public.payments where subject_id = ${org.org}`)[0]!.n).toBe(2);
  });

  it("an approved Paddle refund refunds the first payment", async () => {
    const body = fixture("adjustment.updated.json", "ignored");
    await handleBillingWebhook({ gateway: "paddle", rawBody: body, headers: await sign(body), gateways, record });
    await process_();
    const [pay] = await sql`select status from public.payments where subject_id = ${org.org} order by created_at limit 1`;
    expect(pay!.status).toBe("refunded");
  });
});
