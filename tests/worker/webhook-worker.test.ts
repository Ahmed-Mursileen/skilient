import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import type { Resolve } from "../../supabase/functions/_shared/links/ssrf.ts";
import { runWebhookWorker, signWebhook } from "../../supabase/functions/_shared/webhooks/worker.ts";

/**
 * Webhook delivery end to end on the local database (PRD 5.20): signed with HMAC-SHA256 over
 * `<timestamp>.<body>`, https and public addresses only, redirects not followed, failures back off.
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);
const log = () => undefined;
const org = randomUUID();
const hook = randomUUID();
const secret = "whsec_" + "a".repeat(40);

const resolve: Resolve = async (host) => ({ "hooks.example.com": ["93.184.216.34"], "internal.example.com": ["10.0.0.9"] })[host] ?? [];

async function queue(url: string): Promise<number> {
  await sql`update public.api_webhooks set url = ${url} where id = ${hook}`;
  const [row] = await sql`insert into public.api_webhook_deliveries (webhook_id, event, payload) values (${hook}, 'application.created', ${sql.json({ event: "application.created", data: { application_id: "a1" } })}) returning id`;
  return Number(row!.id);
}

beforeAll(async () => {
  await sql`insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status)
            values (${org}, ${`wh-${org.slice(0, 8)}`}, 'Hook Co', ${`hook-${org.slice(0, 8)}.example.com`}, ${`https://hook-${org.slice(0, 8)}.example.com`}, 'Software', '1-10', 'Lahore', 'CTO', 'verified')`;
  await sql`insert into public.api_webhooks (id, org_id, url, secret, events) values (${hook}, ${org}, 'https://hooks.example.com/in', ${secret}, array['application.created'])`;
});
beforeEach(async () => {
  await sql`delete from public.api_webhook_deliveries where webhook_id = ${hook}`;
  await sql`update public.api_webhooks set active = true, consecutive_failures = 0 where id = ${hook}`;
});
afterAll(async () => {
  await sql`delete from public.organizations where id = ${org}`;
  await sql.end();
});

describe("webhook worker", () => {
  it("delivers a signed body the receiver can verify, with a timestamp", async () => {
    const id = await queue("https://hooks.example.com/in");
    let seen: { headers: Headers; body: string } | null = null;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen = { headers: new Headers(init?.headers), body: String(init?.body) };
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    const now = Date.UTC(2026, 9, 3, 12, 0, 0);
    expect(await runWebhookWorker({ db, fetch: fetchImpl, resolve, log, now: () => now })).toEqual({ delivered: 1, failed: 0 });
    const header = seen!.headers.get("x-skilient-signature")!;
    const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
    expect(Number(t)).toBe(now / 1000);
    expect(v1).toBe(createHmac("sha256", secret).update(`${t}.${seen!.body}`).digest("hex"));
    expect(header).toBe(await signWebhook(secret, seen!.body, now / 1000));
    expect(JSON.parse(seen!.body)).toMatchObject({ event: "application.created", delivery_id: String(id), data: { application_id: "a1" } });
    expect(seen!.headers.get("x-skilient-event")).toBe("application.created");
    const [row] = await sql`select status, attempt from public.api_webhook_deliveries where id = ${id}`;
    expect(row).toMatchObject({ status: "delivered", attempt: 1 });
  });

  it("refuses an address that resolves to a private network and backs off", async () => {
    const id = await queue("https://internal.example.com/in");
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("ok");
    }) as typeof fetch;
    expect(await runWebhookWorker({ db, fetch: fetchImpl, resolve, log })).toEqual({ delivered: 0, failed: 1 });
    expect(called).toBe(false);
    const [row] = await sql`select status, attempt, last_error, next_attempt_at > now() as later from public.api_webhook_deliveries where id = ${id}`;
    expect(row).toMatchObject({ status: "pending", attempt: 1, last_error: "private_address", later: true });
  });

  it("does not follow redirects and records the failure", async () => {
    const id = await queue("https://hooks.example.com/in");
    const fetchImpl = (async () => new Response("", { status: 302, headers: { location: "https://internal.example.com/x" } })) as typeof fetch;
    expect(await runWebhookWorker({ db, fetch: fetchImpl, resolve, log })).toEqual({ delivered: 0, failed: 1 });
    const [row] = await sql`select last_error, last_status from public.api_webhook_deliveries where id = ${id}`;
    expect(row).toMatchObject({ last_error: "redirect_not_followed", last_status: 302 });
  });

  it("refuses plain http and never calls out", async () => {
    await queue("https://hooks.example.com/in");
    await sql`update public.api_webhooks set url = 'https://hooks.example.com/in' where id = ${hook}`;
    // The table forbids http, so simulate a tampered row through the worker's own check.
    await sql`alter table public.api_webhooks drop constraint api_webhooks_url_check`;
    try {
      await sql`update public.api_webhooks set url = 'http://hooks.example.com/in' where id = ${hook}`;
      let called = false;
      const fetchImpl = (async () => {
        called = true;
        return new Response("ok");
      }) as typeof fetch;
      expect(await runWebhookWorker({ db, fetch: fetchImpl, resolve, log })).toEqual({ delivered: 0, failed: 1 });
      expect(called).toBe(false);
    } finally {
      await sql`update public.api_webhooks set url = 'https://hooks.example.com/in' where id = ${hook}`;
      await sql`alter table public.api_webhooks add constraint api_webhooks_url_check check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 300)`;
    }
  });

  it("gives up after the last backoff and pauses a webhook that keeps failing", async () => {
    const id = await queue("https://hooks.example.com/in");
    const fail = (async () => new Response("no", { status: 500 })) as typeof fetch;
    for (let i = 0; i < 6; i++) {
      await sql`update public.api_webhook_deliveries set next_attempt_at = now() - interval '1 second' where id = ${id}`;
      await runWebhookWorker({ db, fetch: fail, resolve, log });
    }
    const [row] = await sql`select status, attempt from public.api_webhook_deliveries where id = ${id}`;
    expect(row).toMatchObject({ status: "failed", attempt: 6 });
    const [h] = await sql`select consecutive_failures from public.api_webhooks where id = ${hook}`;
    expect(h!.consecutive_failures).toBe(6);
  });
});
