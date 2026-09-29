import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import { runStorageCleanup, storageRemover } from "../../supabase/functions/_shared/storage/cleanup.ts";

/**
 * Storage cleanup on the local database: queued paths are deleted through the Storage
 * API in one call per bucket (fake API with the real request and response shapes), a
 * failure leaves them queued for a retry, and malformed messages are dropped.
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);
const log = () => undefined;

const pathFor = () => `${randomUUID()}/${randomUUID()}.webp`;

/** The Storage API's DELETE /storage/v1/object/{bucket}: 200 with the deleted objects. */
function fakeStorage(status = 200) {
  const calls: { url: string; method: string; auth: string | null; prefixes: string[] }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { prefixes: string[] };
    calls.push({ url: String(input), method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization"), prefixes: body.prefixes });
    if (status !== 200) return new Response(JSON.stringify({ statusCode: String(status), error: "Error", message: "failed" }), { status });
    const bucket = String(input).split("/").pop();
    return Response.json(body.prefixes.map((name) => ({ bucket_id: bucket, name, id: randomUUID(), metadata: {} })));
  }) as typeof fetch;
  return { calls, remove: storageRemover({ fetch: fetchImpl, url: "http://storage.test/", key: "service-key" }) };
}

async function queue(bucket: string, path: string) {
  await sql`select pgmq.send('storage_cleanup', ${sql.json({ bucket, path })})`;
}
async function queued(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::integer as n from pgmq.q_storage_cleanup`;
  return row.n;
}

beforeEach(async () => {
  await sql`select pgmq.purge_queue('storage_cleanup')`;
});
afterAll(async () => {
  await sql`select pgmq.purge_queue('storage_cleanup')`;
  await sql.end();
});

describe("storage-cleanup worker", () => {
  it("deletes queued files, one request per bucket", async () => {
    const [a, b, c] = [pathFor(), pathFor(), pathFor()];
    await queue("post-media", a);
    await queue("post-media", b);
    await queue("avatars", c);
    const storage = fakeStorage();
    const out = await runStorageCleanup({ db, remove: storage.remove, log });
    expect(out).toEqual({ deleted: 3, failed: 0, dropped: 0 });
    expect(storage.calls).toHaveLength(2);
    const postCall = storage.calls.find((x) => x.url.endsWith("/post-media"))!;
    expect(postCall).toMatchObject({ url: "http://storage.test/storage/v1/object/post-media", method: "DELETE", auth: "Bearer service-key" });
    expect(postCall.prefixes.sort()).toEqual([a, b].sort());
    expect(await queued()).toBe(0);
  });

  it("deletes credential files (phase 4) like the other buckets", async () => {
    const path = `${randomUUID()}/${randomUUID()}.pdf`;
    await queue("credentials", path);
    const storage = fakeStorage();
    expect(await runStorageCleanup({ db, remove: storage.remove, log })).toEqual({ deleted: 1, failed: 0, dropped: 0 });
    expect(storage.calls[0]).toMatchObject({ url: "http://storage.test/storage/v1/object/credentials", prefixes: [path] });
  });

  it("leaves files queued when the Storage API fails", async () => {
    await queue("chat-media", pathFor());
    const out = await runStorageCleanup({ db, remove: fakeStorage(500).remove, log });
    expect(out).toEqual({ deleted: 0, failed: 1, dropped: 0 });
    expect(await queued()).toBe(1);
  });

  it("drops messages that don't name a known bucket and path", async () => {
    await queue("secrets", pathFor());
    await queue("avatars", "../../etc/passwd");
    const storage = fakeStorage();
    const out = await runStorageCleanup({ db, remove: storage.remove, log });
    expect(out).toEqual({ deleted: 0, failed: 0, dropped: 2 });
    expect(storage.calls).toHaveLength(0);
    expect(await queued()).toBe(0);
  });
});
