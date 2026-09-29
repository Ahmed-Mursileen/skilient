/**
 * The code-check Edge Function's logic (PRD 5.5): shows a snippet of the student's own code,
 * read from GitHub at that commit each time and never stored, only to the student during
 * their 10-minute attempt or to the trust reviewer who claimed it (two-factor). Shared with
 * the Node tests; web APIs only.
 */
import { GitHub, GitHubError, RateLimited } from "../github/client.ts";
import { isUuid, type Db, type Fetch, type GithubConfig, type Log } from "../github/types.ts";
import { decodeBase64, sliceLines } from "./snippet.ts";

export interface Caller {
  id: string;
  aal: string;
}

export interface ServeDeps {
  db: Db;
  cfg: GithubConfig | null;
  fetch: Fetch;
  log: Log;
  /** Checks the caller's access token with Supabase Auth; null when it isn't valid. */
  verify: (token: string) => Promise<Caller | null>;
}

export interface ServeResult {
  status: number;
  body: Record<string, unknown>;
}

interface Access {
  role: "student" | "grader";
  installation_id: string | null;
  repo_id: string;
  sha: string;
  path: string;
  start_line: number;
  end_line: number;
}

/** The token is checked by Auth; aal (two-factor) is then read from its claims. */
export function tokenAal(token: string): string {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return typeof json.aal === "string" ? json.aal : "aal1";
  } catch {
    return "aal1";
  }
}

/** Supabase Auth's own check of an access token (`GET /auth/v1/user`), like getUser(). */
export function authVerifier(opts: { url: string; key: string; fetch: Fetch }) {
  return async (token: string): Promise<Caller | null> => {
    const res = await opts.fetch(`${opts.url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: opts.key },
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const user = (await res.json()) as { id?: string };
    return user.id ? { id: user.id, aal: tokenAal(token) } : null;
  };
}

export async function serveSnippet(deps: ServeDeps, checkId: unknown, authorization: string | null): Promise<ServeResult> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { status: 401, body: { error: "unauthorized" } };
  const caller = await deps.verify(token);
  if (!caller) return { status: 401, body: { error: "unauthorized" } };
  if (typeof checkId !== "string" || !isUuid(checkId)) return { status: 400, body: { error: "invalid_input" } };

  const [access] = await deps.db.query<Access>("select * from private.code_check_snippet_access($1, $2, $3)", [
    checkId,
    caller.id,
    caller.aal,
  ]);
  if (!access) return { status: 404, body: { error: "not_available" } };
  if (!deps.cfg) return { status: 503, body: { error: "not_configured" } };

  const gone = async (reason: string): Promise<ServeResult> => {
    // Before the student has seen any code, this isn't an attempt: the check becomes unavailable.
    if (access.role === "student") await deps.db.query("select private.code_check_unavailable($1, $2)", [checkId, reason]);
    deps.log("code_check.snippet", { outcome: "gone", check_id: checkId, role: access.role });
    return { status: 410, body: { error: "gone" } };
  };
  if (!access.installation_id) return gone("the repository is no longer shared");

  const github = new GitHub(deps.cfg, deps.fetch);
  let content: string;
  try {
    const token = await github.installationToken(Number(access.installation_id));
    const { data } = await github.request<{ content?: string; encoding?: string }>(
      token,
      `/repositories/${access.repo_id}/contents/${access.path.split("/").map(encodeURIComponent).join("/")}?ref=${access.sha}`,
    );
    if (!data?.content || data.encoding !== "base64") return gone("GitHub didn't send the file");
    content = decodeBase64(data.content);
  } catch (error) {
    if (error instanceof GitHubError && [403, 404, 409].includes(error.status)) return gone("GitHub no longer shows this code");
    if (error instanceof RateLimited) return { status: 503, body: { error: "busy", retry_after: error.seconds } };
    throw error;
  }
  const lines = sliceLines(content, access.start_line, access.end_line);
  if (access.role === "student") await deps.db.query("select private.code_check_served($1)", [checkId]);
  deps.log("code_check.snippet", { outcome: "ok", check_id: checkId, role: access.role, lines: lines.length });
  return { status: 200, body: { path: access.path, start_line: access.start_line, lines } };
}
