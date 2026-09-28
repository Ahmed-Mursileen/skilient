// link-preview: drains the link_previews queue (PRD 5.28 link previews), fetching each
// page SSRF-safely and caching title/description/image for 7 days. Woken each minute by
// pg_cron (private.wake_link_preview_worker) with a bearer secret from the database.
import postgres from "npm:postgres@3.4.9";
import { dbFrom, jsonLog, safeEqual } from "../_shared/github/types.ts";
import { dohResolver } from "../_shared/links/ssrf.ts";
import { runLinkPreviewWorker } from "../_shared/links/worker.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const [row] = await db.query<{ secret: string }>(
    "select decrypted_secret as secret from vault.decrypted_secrets where name = 'link_preview_worker_secret'",
  );
  if (!row || !safeEqual(auth, `Bearer ${row.secret}`)) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await runLinkPreviewWorker({ db, fetch, resolve: dohResolver(fetch), log: jsonLog }));
});
