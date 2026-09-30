import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import { drainQueue, handleCvSign, issueCv, rotateKey } from "../../supabase/functions/_shared/cv/issue.ts";
import { checkEnvelope, envelopeOf } from "../../supabase/functions/_shared/cv/sign.ts";

/**
 * The cv-sign Edge Function's logic on the local database (PRD 5.18, decisions.md
 * 2026-10-01): keys are generated here and kept in Vault, records verify with the key that
 * signed them after a rotation, any change to a stored snapshot is caught, the monthly
 * queue issues only changed CVs, and the handler tells its two kinds of caller apart.
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);
const log = () => undefined;
const userId = randomUUID();
const keys: string[] = [];

interface RecordRow {
  id: string;
  code: string;
  key_id: string;
  issued_at: Date;
  expires_at: Date;
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
  signature: string;
  public_key: string;
  superseded_by: string | null;
}

async function record(id: string): Promise<RecordRow> {
  const [row] = await sql<RecordRow[]>`
    select r.id, r.code, r.key_id, r.issued_at, r.expires_at, r.snapshot, r.snapshot_hash, r.signature, r.superseded_by, k.public_key
      from public.cv_records r join public.signing_keys k on k.key_id = r.key_id
     where r.id = ${id}`;
  return row;
}

async function check(id: string) {
  const r = await record(id);
  return checkEnvelope(envelopeOf(r), r.snapshot_hash, r.signature, r.public_key);
}

async function rotate() {
  const { key_id } = await rotateKey({ db, log });
  keys.push(key_id);
  return key_id;
}

async function issued(source: "first" | "monthly") {
  const r = await issueCv({ db, log }, userId, source);
  if (r.status !== "issued") throw new Error(`expected a new CV, got ${r.status}`);
  return r;
}

beforeAll(async () => {
  await sql`select pgmq.purge_queue('cv_jobs')`;
  await sql`insert into auth.users (id, email) values (${userId}, ${`cvsign-${userId.slice(0, 8)}@nutech.edu.pk`})`;
  await sql`update public.profiles set onboarding_complete = true, username = ${`cvs_${userId.slice(0, 8)}`},
              department = 'Computer Science', graduation_year = 2027 where user_id = ${userId}`;
});

beforeEach(async () => {
  await sql`select pgmq.purge_queue('cv_jobs')`;
});

afterAll(async () => {
  await sql`delete from public.cv_records where user_id = ${userId}`;
  await sql`delete from auth.users where id = ${userId}`;
  await sql`delete from vault.secrets where name = any (${keys.map((k) => `cv_signing_key:${k}`)})`;
  await sql`delete from public.signing_keys where key_id = any (${keys}) and not exists (
              select 1 from public.cv_records r where r.key_id = signing_keys.key_id)`;
  await sql`select pgmq.purge_queue('cv_jobs')`;
  await sql.end();
});

describe("cv-sign", () => {
  it("keeps old CVs valid after a key rotation", async () => {
    const k1 = await rotate();
    const [secret] = await sql`select count(*)::integer as n from vault.secrets where name = ${`cv_signing_key:${k1}`}`;
    expect(secret.n).toBe(1);
    const first = await issued("first");
    expect(first.code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect((await record(first.id)).key_id).toBe(k1);
    expect(await check(first.id)).toBe("valid");

    const k2 = await rotate();
    const [old] = await sql`select retired_at, (select count(*)::integer from vault.secrets where name = ${`cv_signing_key:${k1}`}) as secrets
                              from public.signing_keys where key_id = ${k1}`;
    expect(old.retired_at).not.toBeNull();
    expect(old.secrets).toBe(0);
    expect(await check(first.id)).toBe("valid");

    await sql`update public.profiles set department = 'Software Engineering' where user_id = ${userId}`;
    const second = await issued("monthly");
    expect((await record(second.id)).key_id).toBe(k2);
    expect(await check(second.id)).toBe("valid");
    expect((await record(first.id)).superseded_by).toBe(second.id);
    expect(await check(first.id)).toBe("valid");
  });

  it("issues a first CV only once", async () => {
    expect((await issueCv({ db, log }, userId, "first")).status).toBe("exists");
  });

  it("catches a changed snapshot or signature", async () => {
    const [latest] = await sql<{ id: string }[]>`select id from public.cv_records where user_id = ${userId} order by version desc limit 1`;
    await sql`update public.cv_records set snapshot = jsonb_set(snapshot, '{person,name}', '"Someone Else"') where id = ${latest.id}`;
    expect(await check(latest.id)).toBe("hash_mismatch");
    const other = await sql<{ signature: string }[]>`select signature from public.cv_records where user_id = ${userId} and id <> ${latest.id}`;
    // Put the name back; now swap in another record's signature.
    await sql`update public.cv_records set snapshot = jsonb_set(snapshot, '{person,name}', to_jsonb((select full_name from public.profiles where user_id = ${userId}))),
                                           signature = ${other[0].signature} where id = ${latest.id}`;
    expect(await check(latest.id)).toBe("bad_signature");
  });

  it("refreshes monthly only when the data changed", async () => {
    // The start queues every student with a CV (others may exist in the local database).
    await sql`select private.cv_refresh_start(true)`;
    const [mine] = await sql`select count(*)::integer as n from pgmq.q_cv_jobs where message->>'user_id' = ${userId}`;
    expect(mine.n).toBe(1);
    await sql`select pgmq.purge_queue('cv_jobs')`;
    const queueMine = () => sql`select pgmq.send('cv_jobs', ${sql.json({ user_id: userId, source: "monthly" })})`;

    const beforeCount = (await sql`select count(*)::integer as n from public.cv_records where user_id = ${userId}`)[0].n;
    await queueMine();
    expect(await drainQueue({ db, log })).toMatchObject({ issued: 0, unchanged: 1, failed: 0 });

    await sql`update public.profiles set graduation_year = 2028 where user_id = ${userId}`;
    await queueMine();
    expect(await drainQueue({ db, log })).toMatchObject({ issued: 1, failed: 0 });
    const after = await sql`select count(*)::integer as n from public.cv_records where user_id = ${userId}`;
    expect(after[0].n).toBe(beforeCount + 1);
    const [queued] = await sql`select count(*)::integer as n from pgmq.q_cv_jobs`;
    expect(queued.n).toBe(0);
  });

  it("tells the worker secret and a student's token apart", async () => {
    const [{ secret }] = await sql`select decrypted_secret as secret from vault.decrypted_secrets where name = 'cv_worker_secret'`;
    const verify = async (token: string) => (token === "student-token" ? { id: userId } : null);
    const deps = { db, log, verify };

    expect((await handleCvSign(deps, null, { action: "ensure" })).status).toBe(401);
    expect((await handleCvSign(deps, "Bearer wrong", { action: "rotate" })).status).toBe(401);
    expect((await handleCvSign(deps, `Bearer ${secret}`, { action: "nope" })).status).toBe(400);
    expect((await handleCvSign(deps, "Bearer student-token", { action: "rotate" })).status).toBe(400);

    const ensured = await handleCvSign(deps, "Bearer student-token", { action: "ensure" });
    const [latest] = await sql`select code from public.cv_records where user_id = ${userId} order by version desc limit 1`;
    expect(ensured).toEqual({ status: 200, body: { status: "exists", code: latest.code } });

    const rotated = await handleCvSign(deps, `Bearer ${secret}`, { action: "rotate" });
    expect(rotated.status).toBe(200);
    keys.push(String(rotated.body.key_id));
    const [active] = await sql`select key_id from public.signing_keys where retired_at is null`;
    expect(active.key_id).toBe(rotated.body.key_id);
  });

  it("re-issues the revoked newest version under a new code, and keeps refresh for Pro", async () => {
    const verify = async (token: string) => (token === "student-token" ? { id: userId } : null);
    const deps = { db, log, verify };
    expect(await handleCvSign(deps, "Bearer student-token", { action: "refresh" })).toEqual({ status: 403, body: { error: "forbidden" } });
    expect(await handleCvSign(deps, "Bearer student-token", { action: "reissue" })).toEqual({ status: 409, body: { error: "not_now" } });

    const [newest] = await sql`select id, code, content_hash, snapshot from public.cv_records where user_id = ${userId} order by version desc limit 1`;
    await sql`update public.cv_records set revoked_at = now(), revoked_reason = 'owner', revoked_by = ${userId} where id = ${newest.id}`;
    // Data changed since, but a re-issue signs the revoked content, not a fresh snapshot.
    await sql`update public.profiles set graduation_year = 2029 where user_id = ${userId}`;
    const out = await handleCvSign(deps, "Bearer student-token", { action: "reissue" });
    expect(out.status).toBe(200);
    expect(out.body.code).not.toBe(newest.code);
    const [again] = await sql<{ id: string; content_hash: string; snapshot: unknown; source: string }[]>`
      select id, content_hash, snapshot, source from public.cv_records where code = ${String(out.body.code)}`;
    expect(again.source).toBe("reissue");
    expect(again.content_hash).toBe(newest.content_hash);
    expect(again.snapshot).toEqual(newest.snapshot);
    expect(await check(again.id)).toBe("valid");
  });
});
