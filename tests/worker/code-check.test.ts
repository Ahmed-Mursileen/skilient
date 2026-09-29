import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveSnippet, type Caller } from "../../supabase/functions/_shared/codecheck/serve.ts";
import { dbFrom, type GithubConfig } from "../../supabase/functions/_shared/github/types.ts";
import { runWorker } from "../../supabase/functions/_shared/github/worker.ts";

/**
 * Code checks against the local database with GitHub faked in its real response shapes: the
 * worker picks a run of the student's own added lines from a commit (only where it is gets
 * recorded), and the code-check function shows those lines, read from GitHub's contents API
 * at that commit, only to the student during the attempt or to the reviewer who claimed it.
 */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);
const log = () => undefined;
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const cfg: GithubConfig = { appId: "4242", clientId: "Iv1.t", clientSecret: "s", privateKey, apiUrl: "https://api.github.test", webUrl: "https://github.test" };

const student = randomUUID();
const reviewer = randomUUID();
const stranger = randomUUID();
const GH_ID = 931_900 + Math.floor(Math.random() * 90);
const REPO = 931_001;
const INSTALLATION = 931_002;
const sha = (s: string) => createHash("sha1").update(s).digest("hex");
const FILE = Array.from({ length: 60 }, (_, i) => (i < 5 ? `# header ${i + 1}` : `value_${i + 1} = compute(${i + 1})`)).join("\n");

/** GitHub: an installation token, a commit whose patch adds lines 6-40 of app/m1.py, and the file at that commit. */
function fakeGithub(state = { contentsStatus: 200 }) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": "9999999999" } });
    if (url.pathname === `/app/installations/${INSTALLATION}/access_tokens`) {
      return json({ token: "ghs_test", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
    }
    const commit = new RegExp(`^/repositories/${REPO}/commits/([0-9a-f]{40})$`).exec(url.pathname);
    if (commit) {
      const added = FILE.split("\n").slice(5, 40).map((l) => `+${l}`);
      return json({
        sha: commit[1],
        author: { id: GH_ID },
        parents: [{ sha: sha("parent") }],
        commit: { author: { date: "2026-08-01T10:00:00Z" }, committer: { date: "2026-08-01T10:00:00Z" } },
        files: [
          { filename: "app/m1.py", status: "modified", additions: 35, deletions: 0, changes: 35, patch: `@@ -5,0 +6,35 @@\n${added.join("\n")}`, sha: sha("blob") },
          { filename: "README.md", status: "modified", additions: 1, deletions: 0, changes: 1, patch: "@@ -1 +1,2 @@\n x\n+y", sha: sha("readme") },
        ],
      });
    }
    if (url.pathname === `/repositories/${REPO}/contents/app/m1.py`) {
      if (state.contentsStatus !== 200) return json({ message: "Not Found" }, state.contentsStatus);
      return json({
        type: "file",
        encoding: "base64",
        size: FILE.length,
        name: "m1.py",
        path: "app/m1.py",
        content: Buffer.from(FILE).toString("base64").replace(/(.{60})/g, "$1\n"),
        sha: sha("blob"),
      });
    }
    return json({ message: `unexpected ${url.pathname}` }, 500);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, state };
}

async function as<T>(user: string, aal: string, query: string, params: unknown[] = []): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated", aal })]);
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(query, params as never[]);
    return rows[0] as T;
  }) as Promise<T>;
}

const callers = new Map<string, Caller>();
const verify = async (token: string) => callers.get(token) ?? null;

async function newCheck(): Promise<string> {
  const { id } = await as<{ id: string }>(student, "aal1", "select public.request_code_check('python') as id");
  return id;
}

beforeAll(async () => {
  await sql`insert into auth.users (id, email) values
    (${student}, ${`cc-s-${student.slice(0, 8)}@nutech.edu.pk`}),
    (${reviewer}, ${`cc-r-${reviewer.slice(0, 8)}@nutech.edu.pk`}),
    (${stranger}, ${`cc-x-${stranger.slice(0, 8)}@nutech.edu.pk`})`;
  await sql`update public.profiles set onboarding_complete = true, username = 'cc_' || substr(replace(user_id::text, '-', ''), 1, 12)
            where user_id in (${student}, ${reviewer}, ${stranger})`;
  await sql`insert into public.staff_roles (user_id, role) values (${reviewer}, 'trust_reviewer')`;
  await sql`insert into public.github_accounts (user_id, github_id, login) values (${student}, ${GH_ID}, 'codecheck-student')`;
  await sql`insert into public.github_installations (installation_id, account_id, account_login, account_type) values (${INSTALLATION}, ${GH_ID}, 'codecheck-student', 'User')`;
  await sql`insert into public.github_repos (repo_id, full_name, owner_id, private, default_branch, languages) values (${REPO}, 'codecheck-student/robot', ${GH_ID}, true, 'main', '{Python}')`;
  await sql`insert into public.github_user_repos (user_id, repo_id, installation_id, kind) values (${student}, ${REPO}, ${INSTALLATION}, 'owned')`;
  for (const day of [1, 2, 3]) {
    await sql`select private.record_commit(${student}, ${REPO}, ${sql.json({
      sha: sha(`cc${day}`), committed_at: `2026-08-0${day}T10:00:00Z`, seen_via: "harvest", meaningful_lines: 60,
      detections: [{ skill: "python", kind: "lines", path: "app/m1.py", lines: 60 }],
    })})`;
  }
  await sql`select private.recompute_user_skills(${student})`;
  callers.set("student-token", { id: student, aal: "aal1" });
  callers.set("reviewer-token", { id: reviewer, aal: "aal2" });
  callers.set("reviewer-aal1", { id: reviewer, aal: "aal1" });
  callers.set("stranger-token", { id: stranger, aal: "aal2" });
});

afterAll(async () => {
  await sql`delete from public.code_checks where user_id = ${student}`;
  await sql`delete from public.ops_audit_log where staff_id = ${reviewer}`.catch(() => undefined);
  await sql`delete from auth.users where id in (${student}, ${reviewer}, ${stranger})`.catch(() => undefined);
  await sql`delete from public.github_repos where repo_id = ${REPO}`;
  await sql`delete from public.github_installations where installation_id = ${INSTALLATION}`;
  await sql.end();
});

describe("code checks", () => {
  let checkId = "";

  it("the worker picks a run of the student's own added lines and records only where it is", async () => {
    checkId = await newCheck();
    const gh = fakeGithub();
    const result = await runWorker({ db, cfg, fetch: gh.fetch, log, visibilitySeconds: 0, random: () => 0 });
    expect(result.failed).toBe(0);
    const [row] = await sql`select status::text, path, start_line, end_line from public.code_checks where id = ${checkId}`;
    expect(row).toEqual({ status: "ready", path: "app/m1.py", start_line: 6, end_line: 40 });
    expect(gh.calls.some((c) => c.includes("/contents/"))).toBe(false); // no code is read yet
    const cols = await sql`select column_name from information_schema.columns where table_name = 'code_checks' and column_name ilike '%code%'`;
    expect(cols).toEqual([]); // nowhere to keep code
  });

  it("shows the snippet only to the student during the attempt, read from GitHub each time", async () => {
    const gh = fakeGithub();
    const deps = { db, cfg, fetch: gh.fetch, log, verify };
    expect((await serveSnippet(deps, checkId, "Bearer student-token")).status).toBe(404); // not started
    await as(student, "aal1", "select public.start_code_check($1)", [checkId]);
    expect((await serveSnippet(deps, checkId, null)).status).toBe(401);
    expect((await serveSnippet(deps, checkId, "Bearer forged")).status).toBe(401);
    expect((await serveSnippet(deps, checkId, "Bearer stranger-token")).status).toBe(404);
    const shown = await serveSnippet(deps, checkId, "Bearer student-token");
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({ path: "app/m1.py", start_line: 6 });
    expect((shown.body.lines as string[])[0]).toBe("value_6 = compute(6)");
    expect(shown.body.lines).toHaveLength(35);
    expect(gh.calls).toContain(`GET /repositories/${REPO}/contents/app/m1.py?ref=${(await sql`select sha from public.code_checks where id = ${checkId}`)[0].sha}`);
    const [served] = await sql`select snippet_served_at is not null as served from public.code_checks where id = ${checkId}`;
    expect(served.served).toBe(true);
  });

  it("shows it to the reviewer who claimed it on two-factor, and no one else", async () => {
    await as(student, "aal1", "select public.save_code_check($1, $2::text::jsonb, true)", [checkId, JSON.stringify({ what: "Computes values", why: "Simple loop", change: "Stream" })]);
    const gh = fakeGithub();
    const deps = { db, cfg, fetch: gh.fetch, log, verify };
    expect((await serveSnippet(deps, checkId, "Bearer student-token")).status).toBe(404); // the attempt is over
    expect((await serveSnippet(deps, checkId, "Bearer reviewer-token")).status).toBe(404); // not claimed yet
    await as(reviewer, "aal2", "select public.claim_code_check($1, true)", [checkId]);
    expect((await serveSnippet(deps, checkId, "Bearer reviewer-aal1")).status).toBe(404);
    const graded = await serveSnippet(deps, checkId, "Bearer reviewer-token");
    expect(graded.status).toBe(200);
    expect(graded.body.lines).toHaveLength(35);
  });

  it("marks a check unavailable, not an attempt, when GitHub no longer shows the code before it was seen", async () => {
    await sql`update public.code_checks set status = 'failed' where id = ${checkId}`;
    await sql`update public.code_checks set snippet_served_at = null, deadline_at = null where id = ${checkId}`; // let a new one be requested
    const second = await newCheck();
    await runWorker({ db, cfg, fetch: fakeGithub().fetch, log, visibilitySeconds: 0, random: () => 0 });
    await as(student, "aal1", "select public.start_code_check($1)", [second]);
    const gh = fakeGithub({ contentsStatus: 404 });
    const res = await serveSnippet({ db, cfg, fetch: gh.fetch, log, verify }, second, "Bearer student-token");
    expect(res.status).toBe(410);
    const [row] = await sql`select status::text, snippet_served_at from public.code_checks where id = ${second}`;
    expect(row).toEqual({ status: "unavailable", snippet_served_at: null });
    const [state] = await sql`select private.code_check_blocker(${student}, 'python') as blocker`;
    expect(state.blocker).toBeNull(); // it didn't count
  });

  it("is unavailable when no commit has a long enough run", async () => {
    await sql`update public.skill_evidence set lines = 5 where user_id = ${student}`;
    const third = await newCheck();
    await runWorker({ db, cfg, fetch: fakeGithub().fetch, log, visibilitySeconds: 0, random: () => 0 });
    const [row] = await sql`select status::text, unavailable_reason from public.code_checks where id = ${third}`;
    expect(row.status).toBe("unavailable");
    expect(row.unavailable_reason).toMatch(/long enough/);
  });
});
