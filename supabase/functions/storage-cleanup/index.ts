// storage-cleanup: deletes image files whose post, chat message or profile photo is gone
// (decisions.md 2026-09-30). Woken each minute by pg_cron (private.wake_storage_cleanup_worker)
// with a bearer secret from the database; deletes through the Storage API as the service role.
import postgres from "npm:postgres@3.4.9";
import { dbFrom, jsonLog, safeEqual } from "../_shared/github/types.ts";
import { runStorageCleanup, storageRemover } from "../_shared/storage/cleanup.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));
const remove = storageRemover({ fetch, url: Deno.env.get("SUPABASE_URL")!, key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const [row] = await db.query<{ secret: string }>(
    "select decrypted_secret as secret from vault.decrypted_secrets where name = 'storage_cleanup_worker_secret'",
  );
  if (!row || !safeEqual(auth, `Bearer ${row.secret}`)) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await runStorageCleanup({ db, remove, log: jsonLog }));
});
