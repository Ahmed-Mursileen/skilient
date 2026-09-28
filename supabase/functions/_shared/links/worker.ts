/**
 * link-preview worker: drains the `link_previews` queue and caches what it finds (7 days).
 * A refused or failed fetch is cached as `failed` so the same URL isn't retried for a week.
 */
import type { Db, Log } from "../github/types.ts";
import { parsePreview } from "./meta.ts";
import { PreviewRefused, safeFetchHtml, type Resolve } from "./ssrf.ts";

interface QueueRow {
  msg_id: number | string;
  message: { url?: string };
}

export async function runLinkPreviewWorker(opts: {
  db: Db;
  fetch: typeof fetch;
  resolve: Resolve;
  log: Log;
  budgetMs?: number;
  batch?: number;
}): Promise<{ ok: number; failed: number; cached: number }> {
  const { db, log } = opts;
  const out = { ok: 0, failed: 0, cached: 0 };
  const rows = await db.query<QueueRow>("select msg_id, message from pgmq.read('link_previews', 60, $1::integer)", [opts.batch ?? 10]);
  for (const row of rows) {
    const url = typeof row.message?.url === "string" ? row.message.url : "";
    const [fresh] = url
      ? await db.query<{ fresh: boolean }>(
          "select exists (select 1 from public.link_previews where url_hash = private.url_hash($1) and fetched_at > now() - interval '7 days') as fresh",
          [url],
        )
      : [{ fresh: true }];
    if (fresh?.fresh) {
      out.cached++;
    } else {
      try {
        const page = await safeFetchHtml(url, { fetch: opts.fetch, resolve: opts.resolve, budgetMs: opts.budgetMs });
        const meta = parsePreview(page.html, page.url);
        await db.query("select private.save_link_preview($1, 'ok', $2, $3, $4, $5)", [url, meta.title, meta.description, meta.imageUrl, meta.siteName]);
        out.ok++;
        log("links.preview", { outcome: "ok" });
      } catch (error) {
        const reason = error instanceof PreviewRefused ? error.reason : "error";
        await db.query("select private.save_link_preview($1, 'failed', null, null, null, null)", [url]);
        out.failed++;
        log("links.preview", { outcome: "refused", reason });
      }
    }
    await db.query("select pgmq.archive('link_previews', $1::bigint)", [row.msg_id]);
  }
  return out;
}
