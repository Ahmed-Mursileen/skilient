// competition-freeze: at a competition's deadline, records each submitted repository's latest commit
// where GitHub lets us read it (PRD 5.20). Woken every 5 minutes by pg_cron
// (private.wake_competition_freeze) with a bearer secret from the database.
import postgres from "npm:postgres@3.4.9";
import { runCompetitionFreeze } from "../_shared/competitions/freeze.ts";
import { dbFrom, jsonLog, safeEqual } from "../_shared/github/types.ts";

const db = dbFrom(postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 }));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const [row] = await db.query<{ secret: string }>("select decrypted_secret as secret from vault.decrypted_secrets where name = 'competition_freeze_secret'");
  if (!row || !safeEqual(auth, `Bearer ${row.secret}`)) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await runCompetitionFreeze({ db, fetch, log: jsonLog, token: Deno.env.get("GITHUB_READ_TOKEN") ?? undefined }));
});
