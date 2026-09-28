import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
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
  { id: 803, full_name: "student/from-template", owner: { id: STUDENT_GITHUB_ID }, private: false, fork: false, default_branch: "main", pushed_at: "2026-09-03T00:00:00Z" },
];
const LANGUAGES: Record<number, Record<string, number>> = { 801: { Python: 9000, Dockerfile: 100 }, 802: { TypeScript: 5000 }, 803: {} };
const TEMPLATE_BLOB = "b".repeat(40);

// --- Commit fixtures ------------------------------------------------------------------

const sha = (name: string) => createHash("sha1").update(name).digest("hex");
const lines = (n: number, first = "") => [first, ...Array.from({ length: n }, (_, i) => `value_${i} = ${i}`)].filter(Boolean);
const patch = (added: string[]) => `@@ -0,0 +1,${added.length} @@\n${added.map((l) => `+${l}`).join("\n")}`;
// GitHub's shape for a commit's files: `filename`, never `path` (a real sync crashed on that).
const file = (filename: string, added: string[], extra: Record<string, unknown> = {}) => ({
  filename, status: "added", additions: added.length, deletions: 0, changes: added.length, patch: patch(added), sha: sha(filename + added.join()), ...extra,
});
interface Fixture {
  sha: string;
  author: number | null;
  date: string;
  parents: number;
  files: ReturnType<typeof file>[];
}
const day = (d: number) => `2026-08-0${d}T10:00:00Z`;
const COMMITS: Record<number, Fixture[]> = {
  801: [
    // Python on three days (180 lines) and FastAPI imported or added to a manifest on each.
    { sha: sha("c1"), author: STUDENT_GITHUB_ID, date: day(1), parents: 0, files: [file("app/main.py", lines(60)), file("requirements.txt", ["fastapi==0.110.0"])] },
    { sha: sha("c2"), author: STUDENT_GITHUB_ID, date: day(2), parents: 1, files: [file("app/api.py", lines(60, "from fastapi import FastAPI")), file("generated/schema.py", lines(300))] },
    { sha: sha("c3"), author: STUDENT_GITHUB_ID, date: day(3), parents: 1, files: [file("app/db.py", lines(60, "from fastapi import Depends")), file("Dockerfile", ["FROM python:3.12"])] },
    // A merge, and a commit GitHub doesn't attribute to the student (a spoofed user.email).
    { sha: sha("c4"), author: STUDENT_GITHUB_ID, date: day(4), parents: 2, files: [file("app/merge.py", lines(80))] },
    { sha: sha("c5"), author: 4242, date: day(4), parents: 1, files: [file("app/spoof.py", lines(300))] },
  ],
  // A first commit dumping 60 files: counts toward "present" (L1) only.
  802: [{ sha: sha("c6"), author: STUDENT_GITHUB_ID, date: day(5), parents: 0, files: Array.from({ length: 60 }, (_, i) => file(`src/f${i}.ts`, lines(10))) }],
  // The template's own file (matching blob) is excluded; only the student's file counts.
  803: [{ sha: sha("c7"), author: STUDENT_GITHUB_ID, date: day(6), parents: 1, files: [file("src/Main.java", lines(40), { sha: TEMPLATE_BLOB })] }],
};
const gitCommit = (c: Fixture) => ({
  sha: c.sha,
  author: c.author === null ? null : { id: c.author },
  parents: Array.from({ length: c.parents }, (_, i) => ({ sha: sha(`${c.sha}-parent-${i}`) })),
  commit: { author: { date: c.date }, committer: { date: c.date }, verification: { verified: false } },
});

/** Commits pushed to 801's default branch after connecting (listed from then on too). */
const EXTRA: Fixture[] = [];

/** A scriptable GitHub: records calls; `repositoryStatus` breaks /repositories/:id on demand. */
function fakeGithub() {
  const calls: string[] = [];
  const state = { repositoryStatus: 200, rateLimited: false, accessCounter: 0, hidden: new Set<string>() };
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
      const template = found?.id === 803 ? { full_name: "org/starter" } : null;
      return found ? reply({ ...found, parent: undefined, template_repository: template }) : reply({}, 404);
    }
    const sub = /^\/repositories\/(\d+)\/(languages|commits|contents\/\.gitattributes)(?:\/([0-9a-f]{40}))?$/.exec(url.pathname);
    if (method === "GET" && sub) {
      const id = Number(sub[1]);
      const visible = (COMMITS[id] ?? []).filter((c) => !state.hidden.has(c.sha));
      if (sub[2] === "languages") return reply(LANGUAGES[id] ?? {});
      if (sub[2] === "contents/.gitattributes") {
        return id === 801
          ? reply({ encoding: "base64", content: Buffer.from("generated/ linguist-generated\n").toString("base64") })
          : reply({ message: "Not Found" }, 404);
      }
      if (sub[3]) {
        const c = [...visible, ...EXTRA].find((x) => x.sha === sub[3]);
        return c ? reply({ ...gitCommit(c), files: c.files }) : reply({ message: "No commit" }, 422);
      }
      // GitHub filters by the login's verified emails; a spoofed email can slip into the list,
      // which is why the worker checks author.id again.
      expect(url.searchParams.get("author")).toBe("student");
      return reply([...visible, ...(id === 801 ? EXTRA : [])].map(gitCommit));
    }
    if (method === "GET" && url.pathname === "/repos/org/starter/git/trees/HEAD") {
      return reply({ tree: [{ type: "blob", sha: TEMPLATE_BLOB }, { type: "tree", sha: "t".repeat(40) }] });
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
  await sql`delete from public.github_repos where repo_id in (801, 802, 803)`;
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
    // discover, 3 classify, 3 harvest, 3 extract batches
    expect(result).toEqual({ processed: 10, deferred: 0, failed: 0 });
    expect(await job()).toMatchObject({ status: "done", repos_total: 3, repos_done: 3 });
    const kinds = await sql`select repo_id::int, kind::text from public.github_user_repos where user_id = ${userId} order by repo_id`;
    expect(kinds).toEqual([
      { repo_id: 801, kind: "owned" },
      { repo_id: 802, kind: "collaborator" },
      { repo_id: 803, kind: "template" },
    ]);
  });

  it("imports only the student's own commits and turns the evidence into levels", async () => {
    const commits = await sql`select repo_id::int, sha, status::text, exclusion, meaningful_lines
                              from public.github_commits where user_id = ${userId} order by occurred_at, sha`;
    const bySha = Object.fromEntries(commits.map((c) => [c.sha, c]));
    expect(bySha[sha("c5")]).toBeUndefined(); // spoofed user.email: never stored
    expect(bySha[sha("c4")]).toMatchObject({ status: "excluded", exclusion: "merge" });
    expect(bySha[sha("c6")]).toMatchObject({ status: "excluded", exclusion: "bulk_import" });
    expect(bySha[sha("c1")]).toMatchObject({ status: "counted", meaningful_lines: 60 });
    expect(bySha[sha("c2")]).toMatchObject({ status: "counted", meaningful_lines: 61 }); // generated/ is excluded
    expect(bySha[sha("c7")]).toMatchObject({ status: "counted", meaningful_lines: 0 }); // the template's own file

    const skills = await sql`select skill_id, level, active_days, lines, hits from public.user_skills
                             where user_id = ${userId} order by skill_id`;
    expect(skills).toEqual([
      { skill_id: "docker", level: 1, active_days: 1, lines: 0, hits: 1 },
      { skill_id: "fastapi", level: 2, active_days: 3, lines: 0, hits: 3 },
      { skill_id: "python", level: 2, active_days: 3, lines: 182, hits: 0 },
      // Present through the bulk import and the repository's languages, never authored.
      { skill_id: "typescript", level: 1, active_days: 0, lines: 0, hits: 0 },
    ]);
    const [found] = await sql`select commits_analysed, skills_found from public.sync_jobs where user_id = ${userId} order by id desc limit 1`;
    expect(found).toEqual({ commits_analysed: 5, skills_found: 4 }); // the merge is excluded without a call
    // No source code is stored: the evidence is paths and counts.
    const [evidence] = await sql`select paths from public.skill_evidence where user_id = ${userId} and sha = ${sha("c2")} and skill_id = 'python'`;
    expect(evidence.paths).toEqual(["app/api.py"]);
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
    expect(result.deferred).toBe(3);
    expect(result.failed).toBe(0);
    const [waiting] = await sql`select count(*)::int as n from pgmq.q_github_jobs
                                where message ->> 'stage' = 'classify' and vt > now() + interval '1 minute'`;
    expect(waiting.n).toBe(3);
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
    expect(failed.error).toMatch(/^classify: GET \/repositories\/80[123] returned 500$/);
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

  async function push(payload: Record<string, unknown>) {
    const delivery = randomUUID();
    const body = JSON.stringify({ installation: { id: INSTALLATION }, repository: { id: 801 }, ref: "refs/heads/main", ...payload });
    for (let i = 0; i < 2; i++) {
      // Delivered twice: the replay is a no-op.
      await sql`select private.record_github_webhook(${delivery}, 'push', null, ${INSTALLATION}, ${body}::text::jsonb)`;
    }
    return delivery;
  }

  it("a push queues its commits, counted once; one authored long before the push is held", async () => {
    const gh = fakeGithub();
    const recent = new Date(Date.now() - 86_400_000).toISOString();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    EXTRA.push(
      { sha: sha("p1"), author: STUDENT_GITHUB_ID, date: recent, parents: 1, files: [file("app/push.py", lines(40))] },
      { sha: sha("p2"), author: STUDENT_GITHUB_ID, date: old, parents: 1, files: [file("app/old.py", lines(20))] },
      { sha: sha("p3"), author: 4242, date: recent, parents: 1, files: [file("app/theirs.py", lines(20))] },
    );
    const shas = [sha("p1"), sha("p2"), sha("p3")];
    await push({ commits: shas });
    await push({ commits: shas }); // the same commits in a second delivery
    await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });

    const rows = await sql`select sha, status::text, seen_via from public.github_commits where user_id = ${userId} and sha = any(${shas}) order by sha`;
    expect(Object.fromEntries(rows.map((r) => [r.sha, [r.status, r.seen_via]]))).toEqual({
      [sha("p1")]: ["counted", "push"],
      [sha("p2")]: ["held", "push"],
    });
    expect(gh.calls.filter((c) => c.endsWith(sha("p1")))).toHaveLength(2); // fetched per delivery, recorded once
    const flags = await sql`select kind::text, status::text from public.review_flags where user_id = ${userId}`;
    expect(flags).toEqual([{ kind: "backdating", status: "open" }]);
  });

  it("a force-push that removes commits drops their evidence", async () => {
    const gh = fakeGithub();
    gh.state.hidden.add(sha("c3"));
    await push({ forced: true, commits: [] });
    await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0 });
    const [c3] = await sql`select status::text, exclusion from public.github_commits where user_id = ${userId} and sha = ${sha("c3")}`;
    expect(c3).toEqual({ status: "excluded", exclusion: "rewritten" });
    const skills = await sql`select skill_id, level from public.user_skills where user_id = ${userId} and skill_id in ('python', 'fastapi') order by skill_id`;
    // FastAPI is down to two days; Python keeps three (the pushed commit) and 161 lines.
    expect(skills).toEqual([
      { skill_id: "fastapi", level: 1 },
      { skill_id: "python", level: 2 },
    ]);
  });

  it("excluding a repository removes its evidence from the levels at once", async () => {
    await asStudent("update public.github_user_repos set excluded = true where repo_id = 801 returning repo_id");
    const skills = await sql`select skill_id from public.user_skills where user_id = ${userId} order by skill_id`;
    expect(skills.map((s) => s.skill_id)).toEqual(["typescript"]);
    await asStudent("update public.github_user_repos set excluded = false where repo_id = 801 returning repo_id");
    const [python] = await sql`select level from public.user_skills where user_id = ${userId} and skill_id = 'python'`;
    expect(python.level).toBe(2);
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
    // Repository and commit data go with it, and the levels built on them.
    const [left2] = await sql`select (select count(*) from public.github_commits where user_id = ${userId})::int as commits,
                                     (select count(*) from public.user_skills where user_id = ${userId})::int as skills`;
    expect(left2).toEqual({ commits: 0, skills: 0 });
  });
});
