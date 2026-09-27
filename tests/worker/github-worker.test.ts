import { generateKeyPairSync, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { linkGithub } from "../../supabase/functions/_shared/github/link.ts";
import { dbFrom, type GithubConfig } from "../../supabase/functions/_shared/github/types.ts";
import { runWorker } from "../../supabase/functions/_shared/github/worker.ts";

/**
 * The Edge Functions' shared code against the real local database, with GitHub faked.
 * Needs the local stack (`pnpm db:start`; CI runs it after pgTAP). Everything it creates
 * hangs off one throwaway auth user and is deleted afterwards.
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
  max: 1,
  onnotice: () => undefined,
});
const db = dbFrom(sql);
const log = (e: string, f?: Record<string, unknown>) => { if (process.env.DEBUG_WORKER) console.log(e, f); };

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const cfg: GithubConfig = {
  appId: "4242",
  clientId: "Iv1.test",
  clientSecret: "test-secret",
  privateKey,
  apiUrl: "https://api.github.test",
  webUrl: "https://github.test",
};

const STUDENT_GITHUB_ID = 7001;
const INSTALLATION = 9001;
const REPOS = [
  { id: 801, full_name: "student/robot", owner: { id: STUDENT_GITHUB_ID }, private: true, fork: false, default_branch: "main", pushed_at: "2026-09-01T00:00:00Z" },
  { id: 802, full_name: "club/site", owner: { id: 55 }, private: false, fork: false, default_branch: "main", pushed_at: "2026-09-02T00:00:00Z" },
];

/** A scriptable GitHub: records calls; `repositoryStatus` breaks /repositories/:id on demand. */
function fakeGithub() {
  const calls: string[] = [];
  const state = { repositoryStatus: 200, rateLimited: false, accessCounter: 0 };
  const reset = String(Math.floor(Date.now() / 1000) + 3600);
  const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": reset, ...headers },
    });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(`${method} ${url.pathname}${body.grant_type ? ` ${body.grant_type}` : ""}`);

    if (url.origin === cfg.webUrl && url.pathname === "/login/oauth/access_token") {
      if (body.client_secret !== cfg.clientSecret) return reply({ error: "incorrect_client_credentials" });
      state.accessCounter++;
      return reply({
        access_token: body.grant_type === "refresh_token" ? "gho_refreshed" : `gho_${state.accessCounter}`,
        expires_in: 28_800,
        refresh_token: `ghr_${state.accessCounter}`,
        refresh_token_expires_in: 15_811_200,
      });
    }
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    switch (`${method} ${url.pathname}`) {
      case "GET /user":
        return reply({ id: STUDENT_GITHUB_ID, login: "student" });
      case "GET /user/installations":
        return reply({
          installations: [
            { id: INSTALLATION, app_id: Number(cfg.appId), account: { id: STUDENT_GITHUB_ID, login: "student", type: "User" }, repository_selection: "selected", suspended_at: null },
            { id: 1, app_id: 999, account: { id: 1, login: "someone-elses-app", type: "User" }, repository_selection: "all", suspended_at: null },
          ],
        });
      case `GET /user/installations/${INSTALLATION}/repositories`:
        return reply({ repositories: REPOS });
      case `POST /app/installations/${INSTALLATION}/access_tokens`:
        expect(auth).toMatch(/^Bearer ey/); // an App JWT
        return reply({ token: "ghs_installation", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
      case `DELETE /applications/${cfg.clientId}/grant`:
        return reply(null, 204);
    }
    const repo = /^\/repositories\/(\d+)$/.exec(url.pathname);
    if (method === "GET" && repo) {
      if (state.rateLimited) return reply({ message: "rate limited" }, 403, { "x-ratelimit-remaining": "0" });
      if (state.repositoryStatus !== 200) return reply({ message: "boom" }, state.repositoryStatus);
      const found = REPOS.find((r) => r.id === Number(repo[1]));
      return found ? reply({ ...found, parent: undefined, template_repository: null }) : reply({}, 404);
    }
    return reply({ message: `unexpected ${method} ${url.pathname}` }, 500);
  }) as typeof fetch;

  return { fetch: fetchImpl, calls, state };
}

const userId = randomUUID();

async function asStudent<T>(query: string, params: unknown[] = []): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1" }),
    ]);
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(query, params as never[]);
    return rows[0] as T;
  }) as Promise<T>;
}

async function newTicket(code: string): Promise<string> {
  const row = await asStudent<{ ticket: string }>("select public.start_github_link($1, $2) as ticket", [code, INSTALLATION]);
  return row.ticket;
}

async function job() {
  const [row] = await sql`select status::text, stage, repos_total, repos_done, error from public.sync_jobs
                          where user_id = ${userId} order by id desc limit 1`;
  return row;
}

beforeAll(async () => {
  await sql`select pgmq.purge_queue('github_jobs')`;
  await sql`insert into auth.users (id, email) values (${userId}, ${`worker-${userId.slice(0, 8)}@nutech.edu.pk`})`;
});

beforeEach(async () => {
  await sql`select pgmq.purge_queue('github_jobs')`;
  await sql`update public.sync_jobs set status = 'cancelled', finished_at = now()
            where user_id = ${userId} and status in ('queued', 'running')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id = ${userId}`;
  await sql`delete from public.github_repos where repo_id in (801, 802)`;
  await sql`delete from public.github_installations where installation_id = ${INSTALLATION}`;
  await sql`select pgmq.purge_queue('github_jobs')`;
  await sql.end();
});

describe("github-link and github-worker", () => {
  it("links through the student's ticket, then discovers and classifies their repositories", async () => {
    const gh = fakeGithub();
    const ticket = await newTicket("code-one");
    expect(await linkGithub(ticket, { db, cfg, fetch: gh.fetch, log })).toBe("linked");

    const [account] = await sql`select github_id::int, login from public.github_accounts where user_id = ${userId}`;
    expect(account).toEqual({ github_id: STUDENT_GITHUB_ID, login: "student" });
    const installs = await sql`select installation_id::int from public.github_user_installations where user_id = ${userId}`;
    expect(installs).toEqual([{ installation_id: INSTALLATION }]); // the other App's installation is ignored

    const result = await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    expect(result).toEqual({ processed: 3, deferred: 0, failed: 0 }); // discover + 2 classify
    expect(await job()).toMatchObject({ status: "done", repos_total: 2, repos_done: 2 });
    const kinds = await sql`select repo_id::int, kind::text from public.github_user_repos where user_id = ${userId} order by repo_id`;
    expect(kinds).toEqual([
      { repo_id: 801, kind: "owned" },
      { repo_id: 802, kind: "collaborator" },
    ]);
  });

  it("refuses unknown and reused tickets", async () => {
    const gh = fakeGithub();
    expect(await linkGithub(randomUUID(), { db, cfg, fetch: gh.fetch, log })).toBe("expired");
    expect(await linkGithub("not-a-uuid", { db, cfg, fetch: gh.fetch, log })).toBe("expired");
    const ticket = await newTicket("code-two");
    expect(await linkGithub(ticket, { db, cfg, fetch: gh.fetch, log })).toBe("linked");
    expect(await linkGithub(ticket, { db, cfg, fetch: gh.fetch, log })).toBe("expired");
    expect(gh.calls.filter((c) => c.startsWith("POST /login/oauth"))).toHaveLength(1);
  });

  it("refreshes an expired access token before using it", async () => {
    const gh = fakeGithub();
    await sql`update private.github_tokens set access_expires_at = now() - interval '1 minute' where user_id = ${userId}`;
    expect(await asStudent<{ ok: boolean }>("select public.request_github_resync() as ok")).toEqual({ ok: true });
    await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    expect(gh.calls).toContain("POST /login/oauth/access_token refresh_token");
    const [token] = await sql`select s.decrypted_secret from private.github_tokens t
                              join vault.decrypted_secrets s on s.id = t.access_secret_id where t.user_id = ${userId}`;
    expect(token.decrypted_secret).toBe("gho_refreshed");
    expect(await job()).toMatchObject({ status: "done" });
  });

  it("waits out a rate limit instead of failing", async () => {
    const gh = fakeGithub();
    gh.state.rateLimited = true;
    await sql`select private.start_github_sync(${userId}, 'resync')`;
    const result = await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    expect(result.deferred).toBe(2);
    expect(result.failed).toBe(0);
    const [waiting] = await sql`select count(*)::int as n from pgmq.q_github_jobs
                                where message ->> 'stage' = 'classify' and vt > now() + interval '1 minute'`;
    expect(waiting.n).toBe(2);
    expect(await job()).toMatchObject({ status: "running", stage: "classify" });
    await sql`update public.sync_jobs set status = 'cancelled', finished_at = now() where user_id = ${userId} and status = 'running'`;
  });

  it("dead-letters a stage that keeps failing and marks the sync failed", async () => {
    const gh = fakeGithub();
    gh.state.repositoryStatus = 500;
    await sql`select private.start_github_sync(${userId}, 'resync')`;
    const result = await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    expect(result.processed).toBe(1); // discover
    const [queued] = await sql`select count(*)::int as n from pgmq.q_github_jobs`;
    expect(queued.n).toBe(0);
    const failed = await job();
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/^classify: GET \/repositories\/80[12] returned 500$/);
  });

  it("processes a replayed webhook once", async () => {
    const gh = fakeGithub();
    const delivery = randomUUID();
    const payload = JSON.stringify({ installation: { id: INSTALLATION }, repositories_removed: [{ id: 802 }] });
    for (let i = 0; i < 2; i++) {
      await sql`select private.record_github_webhook(${delivery}, 'installation_repositories', 'removed', ${INSTALLATION}, ${payload}::text::jsonb)`;
    }
    await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    const [events] = await sql`select count(*)::int as n from private.github_webhook_events where delivery_id = ${delivery} and processed_at is not null`;
    expect(events.n).toBe(1);
    const syncs = await sql`select trigger from public.sync_jobs where user_id = ${userId} and trigger = 'webhook'`;
    expect(syncs).toHaveLength(1);
    await sql`delete from private.github_webhook_events where delivery_id = ${delivery}`;
  });

  it("disconnect revokes the grant at GitHub and forgets the secrets", async () => {
    const gh = fakeGithub();
    const [before] = await sql`select access_secret_id, refresh_secret_id from private.github_tokens where user_id = ${userId}`;
    expect(await asStudent<{ ok: boolean }>("select public.disconnect_github() as ok")).toEqual({ ok: true });
    await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    expect(gh.calls).toContain(`DELETE /applications/${cfg.clientId}/grant`);
    const [left] = await sql`select count(*)::int as n from vault.secrets
                             where id in (${before.access_secret_id}, ${before.refresh_secret_id})`;
    expect(left.n).toBe(0);
    const [account] = await sql`select count(*)::int as n from public.github_accounts where user_id = ${userId}`;
    expect(account.n).toBe(0);
  });
});
