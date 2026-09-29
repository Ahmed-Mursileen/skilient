/**
 * storage-cleanup worker: deletes image files whose post, message or profile photo is
 * gone (decisions.md 2026-09-30). Database triggers queue `{ bucket, path }`; this drains
 * the queue in batches through the Storage API. A failed delete stays queued and is
 * retried a minute later; after 5 tries it's dropped and logged.
 */
import type { Db, Log } from "../github/types.ts";

interface QueueRow {
  msg_id: number | string;
  read_ct: number;
  message: { bucket?: string; path?: string };
}

const BUCKETS = new Set(["post-media", "chat-media", "avatars"]);
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
const MAX_TRIES = 5;

export type Remove = (bucket: string, paths: string[]) => Promise<void>;

/** Deletes through the Storage REST API (`DELETE /storage/v1/object/{bucket}`, body `{ prefixes }`). */
export function storageRemover(opts: { fetch: typeof fetch; url: string; key: string }): Remove {
  return async (bucket, paths) => {
    const res = await opts.fetch(`${opts.url.replace(/\/$/, "")}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { apikey: opts.key, authorization: `Bearer ${opts.key}`, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) throw new Error(`storage delete ${res.status}`);
    await res.body?.cancel();
  };
}

export async function runStorageCleanup(opts: { db: Db; remove: Remove; log: Log; batch?: number }): Promise<{ deleted: number; failed: number; dropped: number }> {
  const { db, log } = opts;
  const out = { deleted: 0, failed: 0, dropped: 0 };
  const rows = await db.query<QueueRow>("select msg_id, read_ct, message from pgmq.read('storage_cleanup', 60, $1::integer)", [opts.batch ?? 50]);
  const byBucket = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const bucket = row.message?.bucket ?? "";
    const path = row.message?.path ?? "";
    if (!BUCKETS.has(bucket) || !PATH.test(path)) {
      await db.query("select pgmq.archive('storage_cleanup', $1::bigint)", [row.msg_id]);
      out.dropped++;
      log("storage.cleanup", { outcome: "refused", reason: "bad_message" });
      continue;
    }
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row]);
  }
  for (const [bucket, group] of byBucket) {
    try {
      await opts.remove(bucket, group.map((r) => r.message.path!));
      for (const row of group) await db.query("select pgmq.archive('storage_cleanup', $1::bigint)", [row.msg_id]);
      out.deleted += group.length;
      log("storage.cleanup", { outcome: "ok", bucket, count: group.length });
    } catch (error) {
      for (const row of group) {
        if (row.read_ct >= MAX_TRIES) {
          await db.query("select pgmq.archive('storage_cleanup', $1::bigint)", [row.msg_id]);
          out.dropped++;
        } else {
          out.failed++;
        }
      }
      log("storage.cleanup", { level: "error", outcome: "error", bucket, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return out;
}
