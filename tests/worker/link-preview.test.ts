import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import type { Resolve } from "../../supabase/functions/_shared/links/ssrf.ts";
import { runLinkPreviewWorker } from "../../supabase/functions/_shared/links/worker.ts";

/**
 * Link previews end to end on the local database: a post with a link queues a fetch, the
 * worker fetches it through the SSRF guard (fake web and DNS) and caches the preview, which
 * then appears on the post card. Private targets are cached as failed and never shown.
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);
const author = randomUUID();
const log = () => undefined;

const resolve: Resolve = async (host) => ({ "news.example": ["93.184.216.34"], "sneaky.example": ["10.0.0.7"] })[host] ?? [];
const pages: Record<string, { status: number; headers: Record<string, string>; body: string }> = {
  "https://news.example/story": {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<html><head><meta property="og:title" content="Robots win"><meta property="og:description" content="NUTECH team takes first."><meta property="og:image" content="https://news.example/card.jpg"></head></html>`,
  },
  "https://news.example/moved": { status: 302, headers: { location: "https://sneaky.example/internal" }, body: "" },
};
const fetchImpl = (async (input: RequestInfo | URL) => {
  const page = pages[String(input)];
  return page ? new Response(page.body, { status: page.status, headers: page.headers }) : new Response("", { status: 404 });
}) as typeof fetch;

async function asAuthor<T>(query: string, params: unknown[] = []): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: author, role: "authenticated" })]);
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(query, params as never[]);
    return rows[0] as T;
  }) as Promise<T>;
}

beforeAll(async () => {
  await sql`insert into auth.users (id, email) values (${author}, ${`lp-${author.slice(0, 8)}@nutech.edu.pk`})`;
  await sql`update public.profiles set onboarding_complete = true, username = ${`lp_${author.slice(0, 8)}`} where user_id = ${author}`;
});
beforeEach(async () => {
  await sql`select pgmq.purge_queue('link_previews')`;
  await sql`delete from private.rate_limit_events`;
  await sql`delete from public.link_previews where url like 'https://news.example/%'`;
});
afterAll(async () => {
  await sql`delete from auth.users where id = ${author}`;
  await sql`delete from public.link_previews where url like 'https://news.example/%'`;
  await sql.end();
});

describe("link-preview worker", () => {
  it("queues, fetches, caches and shows a preview", async () => {
    const { id } = await asAuthor<{ id: string }>(
      "select public.create_post('{\"type\":\"general\",\"audience\":\"global\",\"body\":\"Read this: https://news.example/story.\"}') as id",
    );
    const queued = await sql`select message->>'url' as url from pgmq.q_link_previews`;
    expect(queued.map((q) => q.url)).toEqual(["https://news.example/story"]);

    expect(await runLinkPreviewWorker({ db, fetch: fetchImpl, resolve, log })).toEqual({ ok: 1, failed: 0, cached: 0 });
    const card = await asAuthor<{ link: Record<string, string> }>("select link from public.post_cards(array[$1::uuid])", [id]);
    expect(card.link).toMatchObject({ url: "https://news.example/story", title: "Robots win", image_url: "https://news.example/card.jpg" });

    // A second post with the same link doesn't fetch again within 7 days.
    await sql`delete from private.rate_limit_events`;
    await asAuthor("select public.create_post('{\"type\":\"general\",\"audience\":\"global\",\"body\":\"Again https://news.example/story\"}')");
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from pgmq.q_link_previews`;
    expect(n).toBe(0);
  });

  it("caches a redirect into a private range as failed and shows nothing", async () => {
    const { id } = await asAuthor<{ id: string }>(
      "select public.create_post('{\"type\":\"general\",\"audience\":\"global\",\"body\":\"https://news.example/moved\"}') as id",
    );
    expect(await runLinkPreviewWorker({ db, fetch: fetchImpl, resolve, log })).toEqual({ ok: 0, failed: 1, cached: 0 });
    const [row] = await sql`select status from public.link_previews where url = 'https://news.example/moved'`;
    expect(row.status).toBe("failed");
    const card = await asAuthor<{ link: unknown }>("select link from public.post_cards(array[$1::uuid])", [id]);
    expect(card.link).toBeNull();
  });
});
