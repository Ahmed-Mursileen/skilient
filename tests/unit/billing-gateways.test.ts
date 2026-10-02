import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { billingGateways, gatewayFor, readiness, simulatedAllowed } from "@/supabase/functions/_shared/billing/config.ts";
import { createPaddleAdapter, PADDLE_SIGNATURE_HEADER, parsePaddleSignature, signPaddle } from "@/supabase/functions/_shared/billing/paddle.ts";
import { createSafepayAdapter, SAFEPAY_SIGNATURE_HEADER } from "@/supabase/functions/_shared/billing/safepay.ts";
import { createSimulatedAdapter, SIMULATED_SIGNATURE_HEADER, simulatedWebhook } from "@/supabase/functions/_shared/billing/simulated.ts";
import { WebhookRejected } from "@/supabase/functions/_shared/billing/types.ts";

/**
 * Gateway adapters (PRD 4b.1, 4b.12): signature and timestamp checks against fixtures in each gateway's documented
 * scheme (tests/fixtures/billing/README.md), normalisation into the one event shape the lifecycle reads, and the
 * rule that decides when the simulated gateway may run.
 */
const FIX = join(process.cwd(), "tests", "fixtures", "billing");
const fixture = (path: string, session = "11111111-2222-4333-8444-555555555555") => readFileSync(join(FIX, path), "utf8").replaceAll("SESSION_ID", session);
const NOW = Date.UTC(2026, 9, 5, 10, 15, 30);
const SECRET = "whsec_test_" + "x".repeat(40);

async function rejects(p: Promise<unknown>, reason: string) {
  await expect(p).rejects.toBeInstanceOf(WebhookRejected);
  await expect(p).rejects.toMatchObject({ reason });
}

describe("simulated gateway", () => {
  const adapter = createSimulatedAdapter({ secret: SECRET, appUrl: "https://skilient.test" });

  it("signs and verifies its own events, always as tests", async () => {
    const hook = await simulatedWebhook(SECRET, "payment.succeeded", { session_id: "s1", payment_id: "pay_1", amount: 399, currency: "PKR", method: "card" }, NOW);
    const [e] = await adapter.verifyWebhook(hook.body, hook.headers, NOW);
    expect(e).toMatchObject({ type: "payment.succeeded", live: false, event: { session_id: "s1", amount: 399, gateway: "simulated" } });
    expect(e!.eventId).toMatch(/^evt_sim_/);
  });

  it("refuses a tampered body, a wrong secret, no signature and an old event", async () => {
    const hook = await simulatedWebhook(SECRET, "payment.succeeded", { session_id: "s1", amount: 399, currency: "PKR" }, NOW);
    await rejects(adapter.verifyWebhook(hook.body.replace("399", "1"), hook.headers, NOW), "bad_signature");
    const other = await simulatedWebhook("y".repeat(40), "payment.succeeded", { session_id: "s1" }, NOW);
    await rejects(adapter.verifyWebhook(other.body, other.headers, NOW), "bad_signature");
    await rejects(adapter.verifyWebhook(hook.body, new Headers(), NOW), "missing_signature");
    await rejects(adapter.verifyWebhook(hook.body, hook.headers, NOW + 6 * 60 * 1000), "stale");
  });

  it("is off without a long enough secret", async () => {
    const off = createSimulatedAdapter({ secret: "short", appUrl: "https://skilient.test" });
    expect(off.configured).toBe(false);
    const hook = await simulatedWebhook("short", "payment.succeeded", {}, NOW);
    await rejects(off.verifyWebhook(hook.body, hook.headers, NOW), "not_configured");
  });

  it("opens our own checkout page and fails a charge only when told to", async () => {
    expect((await adapter.createSession({ sessionId: "abc", amount: 1, currency: "PKR", description: "x", returnUrl: "", cancelUrl: "", recurring: false })).redirectUrl).toBe(
      "https://skilient.test/billing/checkout/abc",
    );
    expect(await adapter.chargeSavedMethod({ subscriptionId: "s", savedMethodRef: "card", amount: 1, currency: "PKR", idempotencyKey: "k" })).toMatchObject({ status: "succeeded" });
    expect(await adapter.chargeSavedMethod({ subscriptionId: "s", savedMethodRef: "card", amount: 1, currency: "PKR", idempotencyKey: "k", simulateFail: true })).toMatchObject({ status: "failed" });
    expect(SIMULATED_SIGNATURE_HEADER).toBe("x-simulated-signature");
  });
});

describe("Paddle adapter (fixtures)", () => {
  const adapter = createPaddleAdapter({ apiKey: "pdl_test", webhookSecret: SECRET, environment: "sandbox" });
  const signed = async (body: string, ts = NOW / 1000) => new Headers({ [PADDLE_SIGNATURE_HEADER]: await signPaddle(SECRET, body, ts) });

  it("uses Paddle's documented scheme: HMAC-SHA256 of ts:body", async () => {
    const body = fixture("paddle/transaction.completed.json");
    const header = await signPaddle(SECRET, body, 1_700_000_000);
    expect(header).toBe(`ts=1700000000;h1=${createHmac("sha256", SECRET).update(`1700000000:${body}`).digest("hex")}`);
    expect(parsePaddleSignature("ts=1;h1=aa;h1=bb")).toEqual({ ts: 1, h1: ["aa", "bb"] });
  });

  it("normalises a first payment, with the session from custom_data", async () => {
    const body = fixture("paddle/transaction.completed.json", "sess-1");
    const [e] = await adapter.verifyWebhook(body, await signed(body), NOW);
    expect(e).toMatchObject({
      eventId: "evt_01hv8x9kq3m4n5p6r7s8t9v0w1",
      type: "payment.succeeded",
      live: false,
      event: { session_id: "sess-1", payment_id: "txn_01hv8x7a6b5c4d3e2f1g0h9j8k", amount: 55, currency: "USD", subscription_ref: "sub_01hv8x9kq3m4n5p6r7s8t9v0aa", mor_invoice_ref: "325-10024" },
    });
  });

  it("routes a renewal by subscription, never by the first checkout's session", async () => {
    const body = fixture("paddle/transaction.completed.recurring.json", "sess-1");
    const [e] = await adapter.verifyWebhook(body, await signed(body), NOW);
    expect(e!.event.session_id).toBeUndefined();
    expect(e!.event.subscription_ref).toBe("sub_01hv8x9kq3m4n5p6r7s8t9v0aa");
  });

  it("normalises failures and approved refunds, and ignores other events", async () => {
    const failed = fixture("paddle/transaction.payment_failed.json");
    expect((await adapter.verifyWebhook(failed, await signed(failed), NOW))[0]).toMatchObject({ type: "payment.failed", event: { reason: "declined" } });
    const refund = fixture("paddle/adjustment.updated.json");
    expect((await adapter.verifyWebhook(refund, await signed(refund), NOW))[0]).toMatchObject({
      type: "payment.refunded",
      event: { payment_id: "txn_01hv8x7a6b5c4d3e2f1g0h9j8k", amount: 55 },
    });
    const other = fixture("paddle/customer.updated.json");
    expect(await adapter.verifyWebhook(other, await signed(other), NOW)).toEqual([]);
  });

  it("accepts either signature while a secret rotates, and refuses tampering and replays after 5 minutes", async () => {
    const body = fixture("paddle/transaction.completed.json");
    const good = await signPaddle(SECRET, body, NOW / 1000);
    const rotating = new Headers({ [PADDLE_SIGNATURE_HEADER]: `ts=${NOW / 1000};h1=${"0".repeat(64)};${good.split(";")[1]}` });
    expect(await adapter.verifyWebhook(body, rotating, NOW)).toHaveLength(1);
    await rejects(adapter.verifyWebhook(body.replace("5500", "1"), await signed(body), NOW), "bad_signature");
    await rejects(adapter.verifyWebhook(body, await signed(body, NOW / 1000 - 400), NOW), "stale");
    await rejects(adapter.verifyWebhook(body, new Headers(), NOW), "missing_signature");
  });

  it("is live only with production keys, and off without them", () => {
    expect(createPaddleAdapter({ apiKey: "k", webhookSecret: "s", environment: "production" }).live).toBe(true);
    expect(createPaddleAdapter({ environment: "sandbox" }).configured).toBe(false);
  });
});

describe("Safepay adapter (fixtures)", () => {
  const adapter = createSafepayAdapter({ apiKey: "sec_test", secretKey: "secret", webhookSecret: SECRET, environment: "sandbox" });
  const prepare = (path: string, session: string, at = NOW) => {
    const body = JSON.parse(fixture(path, session)) as { data: { created_at: { seconds: number } } };
    body.data.created_at.seconds = Math.floor(at / 1000);
    const raw = JSON.stringify(body);
    const sig = createHmac("sha512", SECRET).update(JSON.stringify(body.data)).digest("hex");
    return { raw, headers: new Headers({ [SAFEPAY_SIGNATURE_HEADER]: sig }) };
  };

  it("verifies the SDK's scheme (HMAC-SHA512 of the data object) and normalises a payment", async () => {
    const { raw, headers } = prepare("safepay/payment.created.json", "sess-2");
    const [e] = await adapter.verifyWebhook(raw, headers, NOW);
    expect(e).toMatchObject({ type: "payment.succeeded", live: false, event: { session_id: "sess-2", amount: 399, currency: "PKR", method: "card", gateway: "safepay" } });
    expect(e!.eventId).toBe("track_9b1e6d2c-4f5a-4c7e-9a8b-1c2d3e4f5a6b:payment:created");
    expect(e!.event.saved_method_ref).toBeUndefined();
  });

  it("refuses a tampered body and an old delivery", async () => {
    const { raw, headers } = prepare("safepay/payment.created.json", "sess-2");
    await rejects(adapter.verifyWebhook(raw.replace("39900", "100"), headers, NOW), "bad_signature");
    const old = prepare("safepay/payment.created.json", "sess-2", NOW - 10 * 60 * 1000);
    await rejects(adapter.verifyWebhook(old.raw, old.headers, NOW), "stale");
  });

  it("normalises refunds; refunds and saved-card charges stay off until confirmed in the sandbox", async () => {
    const { raw, headers } = prepare("safepay/refund.created.json", "sess-2");
    expect((await adapter.verifyWebhook(raw, headers, NOW))[0]).toMatchObject({ type: "payment.refunded" });
    expect((await adapter.refund({ gatewayPaymentId: "t", amount: 1, currency: "PKR", idempotencyKey: "k" })).status).toBe("failed");
    expect((await adapter.chargeSavedMethod({ subscriptionId: "s", amount: 1, currency: "PKR", idempotencyKey: "k" })).status).toBe("failed");
  });
});

describe("which gateway runs (decisions.md 2026-10-05)", () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  const sim = { SIMULATED_GATEWAY_SECRET: SECRET };
  const safepay = { SAFEPAY_API_KEY: "a", SAFEPAY_SECRET_KEY: "b", SAFEPAY_WEBHOOK_SECRET: "c" };

  it("outside production the simulated gateway is the default for both currencies", () => {
    const g = billingGateways(env(sim), { appUrl: "http://x", production: false });
    expect(gatewayFor(g, "PKR")).toEqual({ ok: true, gateway: "simulated" });
    expect(gatewayFor(g, "USD")).toEqual({ ok: true, gateway: "simulated" });
  });

  it("in production it runs only while no real gateway is configured", () => {
    expect(simulatedAllowed(billingGateways(env(sim), { appUrl: "http://x", production: true }))).toBe(true);
    expect(simulatedAllowed(billingGateways(env({ ...sim, ...safepay }), { appUrl: "http://x", production: true }))).toBe(false);
    expect(simulatedAllowed(billingGateways(env({ ...sim, ...safepay, BILLING_ALLOW_SIMULATED: "1" }), { appUrl: "http://x", production: true }))).toBe(true);
    expect(simulatedAllowed(billingGateways(env({ ...sim, ...safepay }), { appUrl: "http://x", production: false }))).toBe(true);
  });

  it("a selected real gateway is used only when its keys are set", () => {
    const missing = billingGateways(env({ ...sim, BILLING_GATEWAY_LOCAL: "safepay" }), { appUrl: "http://x", production: false });
    expect(gatewayFor(missing, "PKR")).toEqual({ ok: false, reason: "not_configured" });
    const ready = billingGateways(env({ ...sim, ...safepay, BILLING_GATEWAY_LOCAL: "safepay" }), { appUrl: "http://x", production: true });
    expect(gatewayFor(ready, "PKR")).toEqual({ ok: true, gateway: "safepay" });
    expect(gatewayFor(ready, "USD")).toEqual({ ok: false, reason: "simulated_refused" });
  });

  it("the readiness view names what's missing and never prints a value", () => {
    const rows = readiness(billingGateways(env({ ...sim, PADDLE_API_KEY: "secret-value" }), { appUrl: "http://x", production: false }), env({ ...sim, PADDLE_API_KEY: "secret-value" }));
    expect(rows.find((r) => r.id === "paddle")).toMatchObject({ configured: false, missing: ["PADDLE_WEBHOOK_SECRET"], mode: "sandbox" });
    expect(JSON.stringify(rows)).not.toContain("secret-value");
  });
});
