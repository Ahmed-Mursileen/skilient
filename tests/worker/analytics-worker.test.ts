import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import {
  analyticsConfigFromEnv,
  MAX_TRIES,
  runAnalyticsWorker,
  safeProps,
  type AnalyticsConfig,
  type PostHogEvent,
} from "../../supabase/functions/_shared/analytics/worker.ts";

/**
 * The analytics outbox on the local database (phase 13 slice 1): real triggers write the messages,
 * the worker sends them to a fake PostHog with the real request and response shapes (capture
 * `/batch/` answers `{"status": 1}`; persons `bulk_delete` answers the queued and not-found lists).
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
  max: 1,
  onnotice: () => undefined,
});
const db = dbFrom(sql);
const logs: { event: string; fields?: Record<string, unknown> }[] = [];
const log = (event: string, fields?: Record<string, unknown>) => logs.push({ event, fields });

const cfg: AnalyticsConfig = {
  host: "https://eu.i.posthog.com",
  projectKey: "phc_test",
  apiHost: "https://eu.posthog.com",
  projectId: "4242",
  personalKey: "phx_test",
};

interface Call {
  url: string;
  auth: string | null;
  body: Record<string, unknown>;
}

function fakePostHog(opts: { capture?: number; deletion?: { status: number; body: unknown } } = {}) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, auth: new Headers(init?.headers).get("authorization"), body });
    if (url.endsWith("/batch/")) {
      const status = opts.capture ?? 200;
      return Response.json(status === 200 ? { status: 1 } : { type: "server_error", detail: "down" }, { status });
    }
    if (url.includes("/persons/bulk_delete/")) {
      const answer = opts.deletion ?? {
        status: 202,
        body: { persons_queued_for_deletion: 1, persons_deleted: 0, ids_not_found: [], distinct_ids_not_found: [] },
      };
      return Response.json(answer.body, { status: answer.status });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

const batchOf = (call: Call) => (call.body.batch ?? []) as PostHogEvent[];

async function queued(kind?: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::integer as n from pgmq.q_analytics where ${kind ?? null}::text is null or message ->> 'kind' = ${kind ?? null}`;
  return row.n;
}

const user = randomUUID();
const email = `aw-${user.slice(0, 8)}@nutech.edu.pk`;

beforeEach(async () => {
  await sql`select pgmq.purge_queue('analytics')`;
  logs.length = 0;
});

afterAll(async () => {
  await sql`delete from auth.users where id = ${user}`;
  await sql`select pgmq.purge_queue('analytics')`;
  await sql.end();
});

describe("analytics worker", () => {
  it("sends what the triggers wrote in one batch, with no personal data, then clears the queue", async () => {
    await sql`insert into auth.users (id, email) values (${user}, ${email})`;
    await sql`update public.profiles set full_name = 'Worker Person', username = ${`aw${user.slice(0, 6)}`} where user_id = ${user}`;
    await sql`
      insert into public.posts (author_id, university_id, audience, type, body)
      select ${user}, university_id, 'university', 'general', 'Body text that must stay home'
        from public.profiles where user_id = ${user}`;
    expect(await queued("capture")).toBe(2);

    const posthog = fakePostHog();
    const run = await runAnalyticsWorker({ db, cfg, fetch: posthog.impl, log });
    expect(run).toMatchObject({ sent: 2, failed: 0, dropped: 0 });
    expect(posthog.calls).toHaveLength(1);
    expect(posthog.calls[0].url).toBe("https://eu.i.posthog.com/batch/");
    expect(posthog.calls[0].body.api_key).toBe("phc_test");

    const events = batchOf(posthog.calls[0]);
    expect(events.map((e) => e.event).sort()).toEqual(["account_created", "post_created"]);
    const created = events.find((e) => e.event === "account_created")!;
    expect(created.properties.distinct_id).toBe(user);
    expect(created.properties.$set).toMatchObject({ role: "student" });
    expect(created.properties.$set_once).toHaveProperty("signup_week");
    expect(created.uuid).toMatch(/^[0-9a-f-]{36}$/);
    const post = events.find((e) => e.event === "post_created")!;
    expect(post.properties).toMatchObject({ type: "general", audience: "university", $geoip_disable: true });

    const wire = JSON.stringify(posthog.calls[0].body);
    for (const secret of [email, "Worker Person", `aw${user.slice(0, 6)}`, "Body text"]) expect(wire).not.toContain(secret);
    expect(await queued()).toBe(0);
  });

  it("keeps a failed batch for a retry and drops it after the last try", async () => {
    await sql`select private.track(${user}::uuid, 'feedback_sent', '{"type": "idea"}'::jsonb)`;
    const down = fakePostHog({ capture: 503 });
    const first = await runAnalyticsWorker({ db, cfg, fetch: down.impl, log });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(await queued("capture")).toBe(1);

    // Pretend every earlier try failed too and the message is visible again.
    await sql`update pgmq.q_analytics set read_ct = ${MAX_TRIES}, vt = now()`;
    const last = await runAnalyticsWorker({ db, cfg, fetch: down.impl, log });
    expect(last).toMatchObject({ failed: 0, dropped: 1 });
    expect(await queued()).toBe(0);
    expect(logs.some((l) => l.fields?.level === "error")).toBe(true);
  });

  it("drops muted events unsent", async () => {
    await sql`
      insert into public.platform_config (key, version, value, reason)
      select 'analytics.muted_events', coalesce(max(version), 0) + 1, '["survey_answered"]', 'worker test'
        from public.platform_config where key = 'analytics.muted_events'`;
    try {
      await sql`select private.track(${user}::uuid, 'survey_answered', '{"dimension": "clarity"}'::jsonb)`;
      await sql`select private.track(${user}::uuid, 'comment_added', '{"reply": true}'::jsonb)`;
      const posthog = fakePostHog();
      const run = await runAnalyticsWorker({ db, cfg, fetch: posthog.impl, log });
      expect(run).toMatchObject({ sent: 1, muted: 1 });
      expect(batchOf(posthog.calls[0]).map((e) => e.event)).toEqual(["comment_added"]);
    } finally {
      await sql`
        insert into public.platform_config (key, version, value, reason)
        select 'analytics.muted_events', max(version) + 1, '[]', 'worker test'
          from public.platform_config where key = 'analytics.muted_events'`;
    }
  });

  it("never sends unsafe properties, whatever a message holds", async () => {
    await sql`select pgmq.send('analytics', ${sql.json({
      kind: "capture",
      uuid: randomUUID(),
      event: "post_created",
      distinct_id: user,
      at: new Date().toISOString(),
      props: { type: "general", body: "free text with spaces", email: "someone@example.com", nested: { a: 1 } },
    })})`;
    await sql`select pgmq.send('analytics', ${sql.json({ kind: "capture", event: "post_created", distinct_id: "not-a-uuid" })})`;
    const posthog = fakePostHog();
    const run = await runAnalyticsWorker({ db, cfg, fetch: posthog.impl, log });
    expect(run).toMatchObject({ sent: 1, dropped: 1 });
    const [event] = batchOf(posthog.calls[0]);
    expect(event.properties).toMatchObject({ type: "general" });
    expect(event.properties).not.toHaveProperty("body");
    expect(event.properties).not.toHaveProperty("email");
    expect(event.properties).not.toHaveProperty("nested");
    expect(logs.find((l) => l.fields?.outcome === "dropped_props")?.fields?.keys).toEqual(["body", "email", "nested"]);
  });

  it("deletes a deleted account's person, events and recordings", async () => {
    const gone = randomUUID();
    await sql`insert into auth.users (id, email) values (${gone}, ${`aw-gone-${gone.slice(0, 8)}@nutech.edu.pk`})`;
    await sql`delete from auth.users where id = ${gone}`;
    expect(await queued("delete_person")).toBe(1);
    // Due in an hour; make it due now.
    await sql`update pgmq.q_analytics set vt = now() where message ->> 'kind' = 'delete_person'`;

    const posthog = fakePostHog();
    const run = await runAnalyticsWorker({ db, cfg, fetch: posthog.impl, log });
    expect(run.deleted).toBe(1);
    const call = posthog.calls.find((c) => c.url.includes("bulk_delete"))!;
    expect(call.url).toBe("https://eu.posthog.com/api/projects/4242/persons/bulk_delete/");
    expect(call.auth).toBe("Bearer phx_test");
    expect(call.body).toEqual({ distinct_ids: [gone], delete_events: true, delete_recordings: true });
    expect(await queued("delete_person")).toBe(0);
  });

  it("treats a person PostHog never saw as done, and retries any other failure an hour later", async () => {
    const never = randomUUID();
    await sql`select pgmq.send('analytics', ${sql.json({ kind: "delete_person", distinct_id: never })})`;
    const missing = fakePostHog({ deletion: { status: 400, body: { distinct_ids_not_found: [never], detail: "No persons found" } } });
    expect((await runAnalyticsWorker({ db, cfg, fetch: missing.impl, log })).deleted).toBe(1);
    expect(await queued()).toBe(0);

    await sql`select pgmq.send('analytics', ${sql.json({ kind: "delete_person", distinct_id: never })})`;
    const broken = fakePostHog({ deletion: { status: 500, body: { detail: "boom" } } });
    expect((await runAnalyticsWorker({ db, cfg, fetch: broken.impl, log })).failed).toBe(1);
    const [row] = await sql<{ later: boolean }[]>`select vt > now() + interval '50 minutes' as later from pgmq.q_analytics`;
    expect(row.later).toBe(true);

    // Without the personal key nothing is lost either: the deletion waits.
    await sql`update pgmq.q_analytics set vt = now()`;
    const unconfigured = await runAnalyticsWorker({ db, cfg: { ...cfg, personalKey: null }, fetch: broken.impl, log });
    expect(unconfigured.failed).toBe(1);
    expect(await queued("delete_person")).toBe(1);
  });
});

describe("analytics config", () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];

  it("accepts PostHog EU only", () => {
    expect(analyticsConfigFromEnv(env({ POSTHOG_PROJECT_KEY: "phc_abc", POSTHOG_PROJECT_ID: "12" }))).toMatchObject({
      host: "https://eu.i.posthog.com",
      apiHost: "https://eu.posthog.com",
      projectId: "12",
      personalKey: null,
    });
    expect(() => analyticsConfigFromEnv(env({ POSTHOG_PROJECT_KEY: "phc_abc", POSTHOG_HOST: "https://us.i.posthog.com" }))).toThrow(/EU/);
    expect(() => analyticsConfigFromEnv(env({}))).toThrow(/POSTHOG_PROJECT_KEY/);
  });

  it("keeps flat, short, safe values only", () => {
    expect(safeProps({ a: "plan_pro", b: 3, c: true, d: null, e: "a b", f: "x@y", g: [1], Bad: "x" })).toEqual({
      props: { a: "plan_pro", b: 3, c: true, d: null },
      dropped: ["e", "f", "g", "Bad"],
    });
  });
});
