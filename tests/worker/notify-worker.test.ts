import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import { DAILY_CAP, runNotifyWorker, type NotifyConfig } from "../../supabase/functions/_shared/notify/worker.ts";

/**
 * The notify-worker's shared code against the real local database, with Resend faked.
 * The fake answers exactly like Resend's API: 200 `{ "id": "..." }` on success and
 * `{ "statusCode", "message", "name" }` on errors (the shape its SDK parses).
 */
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(url, { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);

const cfg: NotifyConfig = {
  resendApiKey: "re_test_key",
  from: "Skilient <notify@send.example.test>",
  appUrl: "https://app.example.test",
  resendUrl: "https://api.resend.test",
  sendGapMs: 0,
};

interface Sent {
  headers: Record<string, string>;
  body: { from: string; to: string[]; subject: string; html: string; text: string };
}

/** A Resend stand-in: records requests, answers with the queued responses (default success). */
function fakeResend(responses: { status: number; body: unknown }[] = []) {
  const sent: Sent[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input.toString();
    expect(target).toBe("https://api.resend.test/emails");
    expect(init?.method).toBe("POST");
    sent.push({ headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body)) });
    const next = responses.shift() ?? { status: 200, body: { id: randomUUID() } };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, sent };
}

const logs: { event: string; fields?: Record<string, unknown> }[] = [];
const log = (event: string, fields?: Record<string, unknown>) => logs.push({ event, fields });

const users = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
const emails = { a: `nw-a-${users.a.slice(0, 8)}@nutech.edu.pk`, b: `nw-b-${users.b.slice(0, 8)}@nutech.edu.pk`, c: `nw-c-${users.c.slice(0, 8)}@nutech.edu.pk` };

async function as(userId: string, query: string, params: unknown[] = []) {
  return sql.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await tx.unsafe("set local role authenticated");
    return tx.unsafe(query, params as never[]);
  });
}

async function queueSize(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from pgmq.q_notification_emails`;
  return n;
}

beforeAll(async () => {
  for (const [key, id] of Object.entries(users)) {
    await sql`insert into auth.users (id, email) values (${id}, ${emails[key as keyof typeof emails]})`;
    await sql`update public.profiles set onboarding_complete = true, username = ${`nw_${key}_${id.slice(0, 6)}`},
              full_name = ${`Worker ${key.toUpperCase()}`} where user_id = ${id}`;
  }
});

beforeEach(async () => {
  await sql`select pgmq.purge_queue('notification_emails')`;
  await sql`delete from private.rate_limit_events`;
  logs.length = 0;
});

afterAll(async () => {
  await sql`select pgmq.purge_queue('notification_emails')`;
  await sql`delete from private.email_sends where user_id = any(${Object.values(users)})`;
  await sql`delete from auth.users where id = any(${Object.values(users)})`;
  await sql.end();
});

describe("notify-worker", () => {
  it("emails a friend request once, with an idempotency key, and records the send", async () => {
    await as(users.a, "select * from public.send_friend_request($1)", [`nw_b_${users.b.slice(0, 6)}`]);
    expect(await queueSize()).toBe(1);
    const resend = fakeResend();
    const result = await runNotifyWorker({ db, cfg, fetch: resend.impl, log });
    expect(result).toEqual({ sent: 1, skipped: 0, deferred: 0, failed: 0 });
    expect(resend.sent).toHaveLength(1);
    const [mail] = resend.sent;
    expect(mail.headers.authorization).toBe("Bearer re_test_key");
    expect(mail.headers["idempotency-key"]).toMatch(/^notification-[0-9a-f-]{36}$/);
    expect(mail.body.from).toBe(cfg.from);
    expect(mail.body.to).toEqual([emails.b]);
    expect(mail.body.subject).toBe("Worker A wants to be your friend on Skilient");
    expect(mail.body.text).toContain("https://app.example.test/friends?tab=received");
    expect(mail.body.html).toContain("Worker A sent you a friend request.");
    expect(await queueSize()).toBe(0);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from private.email_sends where user_id = ${users.b}`;
    expect(n).toBe(1);

    // Draining again sends nothing more.
    const again = await runNotifyWorker({ db, cfg, fetch: resend.impl, log });
    expect(again.sent).toBe(0);
    expect(resend.sent).toHaveLength(1);
  });

  it("skips a notification already read in the app", async () => {
    await as(users.c, "select * from public.send_friend_request($1)", [`nw_b_${users.b.slice(0, 6)}`]);
    await as(users.b, "select public.mark_all_notifications_read()");
    const resend = fakeResend();
    const result = await runNotifyWorker({ db, cfg, fetch: resend.impl, log });
    expect(result.skipped).toBe(1);
    expect(resend.sent).toHaveLength(0);
    expect(logs.some((l) => l.event === "notify.skipped" && l.fields?.reason === "already_read")).toBe(true);
    await as(users.b, "select public.respond_friend_request(id, false) from public.friend_requests where receiver_id = $1 and status = 'pending'", [users.b]);
  });

  it("parks every message until the next UTC day when Resend's daily quota is spent", async () => {
    await sql`delete from public.friend_requests where sender_id = any(${Object.values(users)}) or receiver_id = any(${Object.values(users)})`;
    await sql`delete from public.friendships where user_id_a = any(${Object.values(users)}) or user_id_b = any(${Object.values(users)})`;
    await as(users.a, "select * from public.send_friend_request($1)", [`nw_c_${users.c.slice(0, 6)}`]);
    await sql`delete from private.rate_limit_events`;
    await as(users.b, "select * from public.send_friend_request($1)", [`nw_c_${users.c.slice(0, 6)}`]);
    expect(await queueSize()).toBe(2);
    const resend = fakeResend([
      { status: 429, body: { statusCode: 429, message: "You have reached your daily email sending quota.", name: "daily_quota_exceeded" } },
    ]);
    const now = new Date();
    const result = await runNotifyWorker({ db, cfg, fetch: resend.impl, log, now: () => now });
    expect(result).toEqual({ sent: 0, skipped: 0, deferred: 1, failed: 0 });
    expect(resend.sent).toHaveLength(1);
    const [{ ready }] = await sql<{ ready: number }[]>`select count(*)::int as ready from pgmq.q_notification_emails where vt <= now()`;
    expect(ready).toBe(0);
    const [{ hidden }] = await sql<{ hidden: number }[]>`select count(*)::int as hidden from pgmq.q_notification_emails where vt > now() + interval '1 minute'`;
    expect(hidden).toBe(2);
    expect(logs.some((l) => l.event === "notify.quota")).toBe(true);
  });

  it("drops a message Resend refuses as invalid, and defers a rate-limited one", async () => {
    await sql`delete from public.friend_requests where receiver_id = ${users.c} or sender_id = ${users.c}`;
    await as(users.a, "select * from public.send_friend_request($1)", [`nw_c_${users.c.slice(0, 6)}`]);
    const invalid = fakeResend([{ status: 422, body: { statusCode: 422, message: "Invalid `to` field.", name: "validation_error" } }]);
    expect(await runNotifyWorker({ db, cfg, fetch: invalid.impl, log })).toEqual({ sent: 0, skipped: 0, deferred: 0, failed: 1 });
    expect(await queueSize()).toBe(0);

    await sql`delete from public.friend_requests where receiver_id = ${users.c}`;
    await sql`delete from private.rate_limit_events`;
    await as(users.a, "select * from public.send_friend_request($1)", [`nw_c_${users.c.slice(0, 6)}`]);
    const limited = fakeResend([{ status: 429, body: { statusCode: 429, message: "Too many requests.", name: "rate_limit_exceeded" } }]);
    expect(await runNotifyWorker({ db, cfg, fetch: limited.impl, log })).toEqual({ sent: 0, skipped: 0, deferred: 1, failed: 0 });
    expect(await queueSize()).toBe(1);
  });

  it("stops notification emails for the day at 60 and parks the rest until tomorrow", async () => {
    await sql`delete from public.friend_requests where receiver_id = ${users.c}`;
    await sql`delete from private.email_sends where sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    await sql`insert into private.email_sends (kind, user_id) select 'instant', ${users.a} from generate_series(1, ${DAILY_CAP - 1})`;
    await sql`delete from private.rate_limit_events`;
    await as(users.a, "select * from public.send_friend_request($1)", [`nw_c_${users.c.slice(0, 6)}`]);
    await sql`delete from private.rate_limit_events`;
    await as(users.b, "select * from public.send_friend_request($1)", [`nw_c_${users.c.slice(0, 6)}`]);
    expect(await queueSize()).toBe(2);
    const resend = fakeResend();
    const result = await runNotifyWorker({ db, cfg, fetch: resend.impl, log });
    // The 60th goes out; the 61st waits for the next UTC day without calling Resend.
    expect(result).toEqual({ sent: 1, skipped: 0, deferred: 1, failed: 0 });
    expect(resend.sent).toHaveLength(1);
    const [{ hidden }] = await sql<{ hidden: number }[]>`select count(*)::int as hidden from pgmq.q_notification_emails where vt > now() + interval '1 minute'`;
    expect(hidden).toBe(1);
    expect(logs.find((l) => l.event === "notify.daily_cap")?.fields).toMatchObject({ level: "warn", daily_count: DAILY_CAP, cap: DAILY_CAP });
    await sql`select pgmq.purge_queue('notification_emails')`;
    await sql`delete from private.email_sends where sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  });

  it("sends a digest only to inactive people with unread digest items, never empty, once a day", async () => {
    await sql`delete from private.email_sends where user_id = any(${Object.values(users)})`;
    // A moves friend requests to the digest and hasn't been around for two days.
    await as(users.a, "select public.set_notification_pref('friend_requests', 'digest')");
    await sql`delete from public.friend_requests where receiver_id = ${users.a} or sender_id = ${users.a}`;
    await sql`delete from public.friendships where user_id_a = ${users.a} or user_id_b = ${users.a}`;
    await sql`insert into private.user_activity (user_id, last_active_at) values (${users.a}, now() - interval '2 days'), (${users.b}, now() - interval '2 days')
              on conflict (user_id) do update set last_active_at = excluded.last_active_at, last_digest_at = null`;
    await sql`delete from private.rate_limit_events`;
    await as(users.c, "select * from public.send_friend_request($1)", [`nw_a_${users.a.slice(0, 6)}`]);
    expect(await queueSize()).toBe(0); // digest channel: nothing instant

    // B has nothing unread in a digest category, so only A is queued.
    await sql`select private.queue_notification_digests()`;
    const queued = await sql<{ user_id: string }[]>`select message->>'user_id' as user_id from pgmq.q_notification_emails where message->>'kind' = 'digest'`;
    expect(queued.map((q) => q.user_id)).toContain(users.a);
    expect(queued.map((q) => q.user_id)).not.toContain(users.b);

    // A digest queued for B anyway (e.g. read in between) is never sent empty.
    await sql`select pgmq.send('notification_emails', ${sql.json({ kind: "digest", user_id: users.b })})`;
    const resend = fakeResend();
    const result = await runNotifyWorker({ db, cfg, fetch: resend.impl, log });
    const toA = resend.sent.filter((s) => s.body.to[0] === emails.a);
    expect(toA).toHaveLength(1);
    expect(resend.sent.filter((s) => s.body.to[0] === emails.b)).toHaveLength(0);
    expect(toA[0].body.subject).toBe("1 thing waiting for you on Skilient");
    expect(toA[0].body.text).toContain("Worker C sent you a friend request.");
    expect(toA[0].headers["idempotency-key"]).toMatch(/^digest-/);
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    // Nothing new since: the next day's run queues nothing for A.
    await sql`select private.queue_notification_digests()`;
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from pgmq.q_notification_emails where message->>'user_id' = ${users.a}`;
    expect(n).toBe(0);
  });
});
