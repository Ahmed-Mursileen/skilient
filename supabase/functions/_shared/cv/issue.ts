/**
 * The cv-sign Edge Function's logic (PRD 5.18, decisions.md 2026-10-01): issue a signed CV
 * version, rotate the signing key, and drain the monthly refresh queue. The snapshot is
 * built in SQL (private.cv_snapshot); only signing happens here, with the private key read
 * from Vault over the function's direct database connection. Shared with the Node tests;
 * web APIs only.
 */
import { safeEqual, type Db, type Log } from "../github/types.ts";
import { generateSigningKey, isoSeconds, newCode, signEnvelope, type CvEnvelope } from "./sign.ts";

export type IssueSource = "first" | "monthly" | "on_demand" | "reissue";

export interface CvDeps {
  db: Db;
  log: Log;
  /** Checks the caller's access token with Supabase Auth; null when it isn't valid. */
  verify: (token: string) => Promise<{ id: string } | null>;
}

export type IssueResult =
  | { status: "issued"; id: string; code: string }
  | { status: "unchanged" | "exists" | "not_eligible" };

export class NoSigningKey extends Error {}

interface Prepared {
  snapshot: Record<string, unknown>;
  content_hash: string;
  latest_content_hash: string | null;
  issued_at: string;
  expires_at: string;
}

function isCodeClash(error: unknown): boolean {
  const e = error as { code?: string; constraint_name?: string; message?: string };
  return e?.code === "23505" && (e.constraint_name === "cv_records_code_key" || /cv_records_code_key/.test(e.message ?? ""));
}

export async function rotateKey(deps: Pick<CvDeps, "db" | "log">): Promise<{ key_id: string }> {
  const key = await generateSigningKey();
  await deps.db.query("select private.cv_install_key($1, $2, $3)", [key.keyId, key.publicKey, key.privateKey]);
  deps.log("cv.key_rotated", { outcome: "ok", key_id: key.keyId });
  return { key_id: key.keyId };
}

export async function issueCv(deps: Pick<CvDeps, "db" | "log">, userId: string, source: IssueSource): Promise<IssueResult> {
  const [prep] = await deps.db.query<Prepared>("select * from private.cv_issue_prepare($1)", [userId]);
  if (!prep) return { status: "not_eligible" };
  if (source === "monthly" && prep.content_hash === prep.latest_content_hash) return { status: "unchanged" };

  const [key] = await deps.db.query<{ key_id: string; private_key: string }>("select * from private.cv_active_key()");
  if (!key) throw new NoSigningKey("no active CV signing key: run select private.cv_rotate_key()");

  for (let attempt = 0; attempt < 5; attempt++) {
    const envelope: CvEnvelope = {
      v: 1,
      code: newCode(),
      key_id: key.key_id,
      issued_at: isoSeconds(prep.issued_at),
      expires_at: isoSeconds(prep.expires_at),
      snapshot: prep.snapshot,
    };
    const { hash, signature } = await signEnvelope(envelope, key.private_key);
    try {
      const [row] = await deps.db.query<{ id: string | null }>(
        `select private.cv_issue_commit($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::jsonb, $7, $8, $9, $10) as id`,
        [userId, envelope.code, key.key_id, envelope.issued_at, envelope.expires_at, prep.snapshot,
          prep.content_hash, hash, signature, source],
      );
      if (!row?.id) return { status: source === "first" ? "exists" : "unchanged" };
      deps.log("cv.issued", { outcome: "ok", source, key_id: key.key_id });
      return { status: "issued", id: row.id, code: envelope.code };
    } catch (error) {
      if (!isCodeClash(error)) throw error;
    }
  }
  throw new Error("could not find a free CV code");
}

interface QueueMessage {
  msg_id: string;
  read_ct: number;
  message: { user_id?: unknown; source?: unknown };
}

/** One pass over the monthly queue; failed messages come back after 2 minutes, 5 tries. */
export async function drainQueue(deps: Pick<CvDeps, "db" | "log">, batch = 20) {
  const out = { issued: 0, unchanged: 0, skipped: 0, failed: 0, dropped: 0 };
  const messages = await deps.db.query<QueueMessage>("select msg_id, read_ct, message from pgmq.read('cv_jobs', 120, $1)", [batch]);
  for (const m of messages) {
    const userId = typeof m.message?.user_id === "string" ? m.message.user_id : null;
    if (!userId || m.read_ct > 5) {
      await deps.db.query("select pgmq.archive('cv_jobs', $1::bigint)", [m.msg_id]);
      out.dropped++;
      deps.log("cv.refresh", { level: "error", outcome: "dropped", msg_id: String(m.msg_id) });
      continue;
    }
    try {
      const r = await issueCv(deps, userId, "monthly");
      if (r.status === "issued") out.issued++;
      else if (r.status === "unchanged") out.unchanged++;
      else out.skipped++;
      await deps.db.query("select pgmq.delete('cv_jobs', $1::bigint)", [m.msg_id]);
    } catch (error) {
      out.failed++;
      deps.log("cv.refresh", { level: "error", outcome: "error", error: error instanceof Error ? error.message : "unknown" });
      if (error instanceof NoSigningKey) break;
    }
  }
  return out;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Two callers: pg_cron and private.cv_rotate_key() with the worker secret (rotate, drain),
 * and the Next server with the signed-in student's access token (ensure: issue their first
 * CV if they have none, and return the newest code).
 */
export async function handleCvSign(deps: CvDeps, authorization: string | null, body: unknown): Promise<HandlerResult> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { status: 401, body: { error: "unauthorized" } };
  const action = (body as { action?: unknown } | null)?.action;

  const [secret] = await deps.db.query<{ secret: string }>(
    "select decrypted_secret as secret from vault.decrypted_secrets where name = 'cv_worker_secret'",
  );
  if (secret && safeEqual(token, secret.secret)) {
    if (action === "rotate") return { status: 200, body: await rotateKey(deps) };
    if (action === "drain") return { status: 200, body: await drainQueue(deps) };
    return { status: 400, body: { error: "invalid_input" } };
  }

  const caller = await deps.verify(token);
  if (!caller) return { status: 401, body: { error: "unauthorized" } };
  if (action !== "ensure") return { status: 400, body: { error: "invalid_input" } };
  const result = await issueCv(deps, caller.id, "first");
  if (result.status === "not_eligible") return { status: 403, body: { error: "not_eligible" } };
  const [latest] = await deps.db.query<{ code: string }>(
    "select code from public.cv_records where user_id = $1 and revoked_at is null order by version desc limit 1",
    [caller.id],
  );
  return { status: 200, body: { status: result.status, code: latest?.code ?? null } };
}
