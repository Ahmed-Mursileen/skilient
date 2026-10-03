import { GitHub, GitHubError, RateLimited, refreshUserToken, revokeGrant } from "./client.ts";
import {
  analyseCommit,
  compileTaxonomy,
  duplicateCandidates,
  globToRegExp,
  isBulkImport,
  linguistGlobPatterns,
  type ChangedFile,
  type CompiledTaxonomy,
  type TaxonomySkill,
} from "./detectors.ts";
import { addedRuns, pickWindow } from "../codecheck/snippet.ts";
import { agentAuthor, parseAgents, type AgentIdentity } from "./agents.ts";
import type { Db, Fetch, GithubConfig, Log } from "./types.ts";

/**
 * github-worker (PRD 5.5 "Import pipeline"): drains the `github_jobs` pgmq queue in small
 * batches. Each stage is idempotent; a failing message is retried when its visibility
 * timeout lapses and dead-lettered after 5 reads (the sync is marked failed with the
 * error, which only staff can read). Rate-limited work is re-queued with a delay instead.
 */

export const MAX_ATTEMPTS = 5;

export interface WorkerDeps {
  db: Db;
  cfg: GithubConfig;
  fetch?: Fetch;
  log: Log;
  now?: () => number;
  /** Stop picking up new messages after this long (the platform's wall clock is longer). */
  budgetMs?: number;
  /** pgmq visibility timeout; tests use 0 to re-read failures at once. */
  visibilitySeconds?: number;
  batchSize?: number;
  /** Picks code-check snippets (tests pass a fixed sequence). */
  random?: () => number;
}

/** PRD 5.5: the latest 500 of the student's commits per repository. */
export const MAX_COMMITS = 500;
/** Commits per extract message: each is one API call, and a message should finish in ~30 s. */
export const EXTRACT_BATCH = 10;
/** The student's newest merged pull requests checked per sync (one search page). */
export const MAX_PRS = 100;
/** PRD 5.5 anti-gaming (decisions.md 2026-09-30): whoever corroborates a pull request must
 * have had their GitHub account for at least this long when it was merged. */
export const APPROVER_MIN_AGE_DAYS = 90;
/** Merged pull requests checked for agent commits per sync (one page). */
export const MAX_AGENT_PRS = 100;

type Message =
  | { stage: "discover"; user_id: string; job_id: number }
  | { stage: "classify"; user_id: string; job_id: number; repo_id: number }
  | { stage: "harvest"; user_id: string; job_id?: number; repo_id: number }
  | { stage: "extract"; user_id: string; job_id?: number; repo_id: number; shas: string[]; pushed_at?: string }
  | { stage: "code_check"; check_id: string }
  | { stage: "prs"; user_id: string }
  | { stage: "pr"; user_id: string; repo: string; number: number }
  | { stage: "webhook"; delivery_id: string }
  | { stage: "revoke"; revocation_id: number };

interface QueueRow {
  msg_id: string;
  read_ct: number;
  message: Message;
}

export interface WorkerResult {
  processed: number;
  deferred: number;
  failed: number;
}

/** The student's token was revoked or can't be refreshed: stop, don't retry. */
class NoToken extends Error {}

export async function runWorker(deps: WorkerDeps): Promise<WorkerResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? 50_000;
  const ctx: Ctx = { ...deps, now, github: new GitHub(deps.cfg, deps.fetch ?? fetch, now), fetchImpl: deps.fetch ?? fetch };
  const result: WorkerResult = { processed: 0, deferred: 0, failed: 0 };

  while (now() - started < budget) {
    const batch = await deps.db.query<QueueRow>(
      "select msg_id, read_ct, message from pgmq.read('github_jobs', $1, $2)",
      [deps.visibilitySeconds ?? 120, deps.batchSize ?? 10],
    );
    if (!batch.length) break;
    for (const row of batch) {
      if (now() - started >= budget) return result; // unread ones reappear after the timeout
      await handle(ctx, row, result);
    }
  }
  return result;
}

interface Ctx extends WorkerDeps {
  now: () => number;
  github: GitHub;
  fetchImpl: Fetch;
  taxonomy?: { skills: TaxonomySkill[]; compiled: CompiledTaxonomy };
}

async function handle(ctx: Ctx, row: QueueRow, result: WorkerResult) {
  const { db, log } = ctx;
  const msg = row.message;
  const began = ctx.now();
  try {
    await STAGES[msg.stage](ctx, msg as never);
    await db.query("select pgmq.archive('github_jobs', $1::bigint)", [row.msg_id]);
    result.processed++;
    log("github.job", { stage: msg.stage, outcome: "ok", ms: ctx.now() - began, ...ids(msg) });
  } catch (error) {
    if (error instanceof RateLimited) {
      // A fresh copy with a delay, so waiting doesn't count as a failed attempt.
      await db.query("select private.enqueue_github($1::text::jsonb, $2)", [JSON.stringify(msg), error.seconds]);
      await db.query("select pgmq.archive('github_jobs', $1::bigint)", [row.msg_id]);
      result.deferred++;
      log("github.job", { stage: msg.stage, outcome: "deferred", seconds: error.seconds, ...ids(msg) });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof NoToken || row.read_ct >= MAX_ATTEMPTS) {
      await db.query("select pgmq.archive('github_jobs', $1::bigint)", [row.msg_id]);
      if ("job_id" in msg) {
        await db.query("select private.update_sync_job($1, null, null, 0, $2, $3)", [
          msg.job_id,
          error instanceof NoToken ? "cancelled" : "failed",
          `${msg.stage}: ${message}`,
        ]);
      }
      result.failed++;
      log("github.job", { stage: msg.stage, outcome: "dead_letter", error_code: message, attempts: row.read_ct, ...ids(msg) });
      return;
    }
    result.failed++;
    log("github.job", { stage: msg.stage, outcome: "retry", error_code: message, attempts: row.read_ct, ...ids(msg) });
  }
}

function ids(msg: Message): Record<string, unknown> {
  const { stage: _stage, ...rest } = msg;
  return rest;
}

// --- Tokens -------------------------------------------------------------------------

async function userToken(ctx: Ctx, userId: string): Promise<string> {
  const [row] = await ctx.db.query<{
    access: string;
    access_expires_at: Date | null;
    refresh: string | null;
    refresh_expires_at: Date | null;
  }>(
    `select a.decrypted_secret as access, t.access_expires_at, r.decrypted_secret as refresh, t.refresh_expires_at
       from private.github_tokens t
       join vault.decrypted_secrets a on a.id = t.access_secret_id
       left join vault.decrypted_secrets r on r.id = t.refresh_secret_id
      where t.user_id = $1`,
    [userId],
  );
  if (!row) throw new NoToken("no token");
  const soon = ctx.now() + 5 * 60_000;
  if (!row.access_expires_at || new Date(row.access_expires_at).getTime() > soon) return row.access;

  if (!row.refresh || (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < ctx.now())) {
    await markRevoked(ctx, userId);
    throw new NoToken("token expired");
  }
  try {
    const fresh = await refreshUserToken(ctx.cfg, ctx.fetchImpl, row.refresh, ctx.now());
    await ctx.db.query("select private.store_github_tokens($1, $2, $3, $4, $5)", [
      userId,
      fresh.accessToken,
      fresh.accessExpiresAt,
      fresh.refreshToken,
      fresh.refreshExpiresAt,
    ]);
    return fresh.accessToken;
  } catch (error) {
    if (error instanceof GitHubError && error.status < 500) {
      await markRevoked(ctx, userId);
      throw new NoToken("refresh refused");
    }
    throw error;
  }
}

async function markRevoked(ctx: Ctx, userId: string) {
  await ctx.db.query("select private.mark_github_revoked($1)", [userId]);
}

// --- Stages -------------------------------------------------------------------------

interface ListedRepo {
  id: number;
  full_name: string;
  owner: { id: number };
  private: boolean;
  fork: boolean;
  default_branch: string | null;
  pushed_at: string | null;
}

interface RepoDetail {
  id: number;
  owner: { id: number };
  fork: boolean;
  parent?: { full_name: string };
  template_repository?: { full_name: string } | null;
}

interface Installation {
  id: number;
  app_id: number;
  account: { id: number; login: string; type: string } | null;
  repository_selection: string;
  suspended_at: string | null;
}

interface ListedCommit {
  sha: string;
  author: { id: number; login?: string; type?: string } | null;
  parents: { sha: string }[];
  commit: {
    author: { date: string; email?: string | null; name?: string | null } | null;
    committer: { date: string } | null;
    verification?: { verified: boolean };
  };
}

/** A changed file as GitHub's commit API sends it: `filename`, never `path`. */
interface GitHubFile {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string | null;
  sha?: string | null;
}

interface CommitDetail extends ListedCommit {
  files?: GitHubFile[];
}

/** GitHub's file entries in the detectors' shape; entries without a name are dropped. */
export function changedFiles(files: GitHubFile[] | undefined): ChangedFile[] {
  return (files ?? []).flatMap((f) =>
    typeof f.filename === "string" && f.filename
      ? [{ path: f.filename, status: f.status ?? "modified", additions: f.additions, deletions: f.deletions, patch: f.patch ?? null, sha: f.sha ?? null }]
      : [],
  );
}

interface GitHubUser {
  id: number;
  login: string;
  type?: string;
}

interface SearchIssues {
  items: { number: number; user: GitHubUser | null; repository_url: string; pull_request?: { merged_at?: string | null } }[];
}

interface PullDetail {
  id: number;
  number: number;
  user: GitHubUser | null;
  merged_at: string | null;
  merge_commit_sha?: string | null;
  merged_by: GitHubUser | null;
  base: { repo: { id: number; full_name: string; private: boolean; owner: GitHubUser } };
}

interface Review {
  user: GitHubUser | null;
  state: string;
}

/** A person, not an App or bot account. */
const isHuman = (u: GitHubUser | null | undefined): u is GitHubUser =>
  !!u && (u.type ?? "User") === "User" && !u.login.toLowerCase().endsWith("[bot]");

/** "owner/repo" with GitHub's name characters, never "." or ".." as a segment. */
export function isRepoName(name: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name) && !name.split("/").some((part) => /^\.+$/.test(part));
}

/** "owner/repo" from a search result's `repository_url`. */
export function repoFromUrl(url: string): string | null {
  const m = /\/repos\/([^/]+\/[^/]+)$/.exec(url);
  return m && isRepoName(m[1]) ? m[1] : null;
}

interface RepoRow {
  installation_id: string;
  kind: string | null;
  excluded: boolean;
  default_branch: string | null;
  linguist_excludes: string[];
  github_id: string;
  login: string;
}

const REPO_QUERY = `
  select ur.installation_id, ur.kind::text, ur.excluded, g.default_branch, g.linguist_excludes, a.github_id, a.login
    from public.github_user_repos ur
    join public.github_repos g on g.repo_id = ur.repo_id
    join public.github_accounts a on a.user_id = ur.user_id and a.revoked_at is null
   where ur.user_id = $1 and ur.repo_id = $2`;

async function loadAgents(ctx: Ctx): Promise<AgentIdentity[]> {
  const [{ agents }] = await ctx.db.query<{ agents: unknown }>("select private.ai_agents() as agents");
  return parseAgents(agents);
}

/**
 * AI-assisted work (decisions 2026-10-03): the commits an AI agent wrote in one merged pull
 * request the student opened, in a repository they shared. Only pull requests merged with a merge
 * commit: a squash or rebase puts new commits on the default branch (a squash is the student's
 * own). Stored with the agent and the pull request; extract analyses them. Returns how many.
 */
async function recordAgentPr(
  ctx: Ctx,
  token: string,
  userId: string,
  repoId: number,
  pr: { number: number; merge_commit_sha?: string | null },
  agents: AgentIdentity[],
): Promise<number> {
  const { db, github } = ctx;
  if (!agents.length || !pr.merge_commit_sha || !/^[0-9a-f]{40}$/.test(pr.merge_commit_sha)) return 0;
  try {
    const { data: merge } = await github.request<ListedCommit>(token, `/repositories/${repoId}/commits/${pr.merge_commit_sha}`);
    if ((merge.parents?.length ?? 0) < 2) return 0;
  } catch (error) {
    if (error instanceof GitHubError && [404, 409, 422].includes(error.status)) return 0;
    throw error;
  }
  const commits = await github.paginate<ListedCommit[], ListedCommit>(
    token,
    `/repositories/${repoId}/pulls/${pr.number}/commits?per_page=100`,
    (page) => page,
    3,
  );
  const mine = commits.flatMap((c) => {
    const agent = agentAuthor(c, agents);
    return agent
      ? [{
          sha: c.sha,
          authored_at: c.commit.author?.date ?? null,
          committed_at: c.commit.committer?.date ?? null,
          parents: c.parents.length,
          signed: c.commit.verification?.verified === true,
          ai_agent: agent,
          via_pr: pr.number,
        }]
      : [];
  });
  if (!mine.length) return 0;
  await db.query("select private.harvest_commits($1, $2, $3::text::jsonb, false)", [userId, repoId, JSON.stringify(mine)]);
  return mine.length;
}

/** One handled message of a sync: queue what follows, count commits, close the sync when done. */
async function advance(ctx: Ctx, jobId: number | undefined, next: Message[], commits = 0, stage: string | null = null) {
  await ctx.db.query("select private.github_job_advance($1, $2::text::jsonb, $3, $4)", [
    jobId ?? null,
    JSON.stringify(next),
    commits,
    stage,
  ]);
}

async function loadTaxonomy(ctx: Ctx) {
  if (!ctx.taxonomy) {
    const skills = await ctx.db.query<TaxonomySkill>(
      "select id, category::text as category, detectors from public.skills where retired_at is null",
    );
    ctx.taxonomy = { skills, compiled: compileTaxonomy(skills) };
  }
  return ctx.taxonomy;
}

/** Globs the repository's .gitattributes marks linguist-generated or linguist-vendored. */
async function linguistExcludes(ctx: Ctx, token: string, repoId: number): Promise<string[]> {
  try {
    const { data } = await ctx.github.request<{ content?: string; encoding?: string }>(token, `/repositories/${repoId}/contents/.gitattributes`);
    if (!data?.content || data.encoding !== "base64") return [];
    return linguistGlobPatterns(atob(data.content.replace(/\s/g, ""))).slice(0, 200);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return [];
    throw error;
  }
}

/** Blob hashes of the original project's default branch (one call; truncated trees are partial). */
async function upstreamBlobs(ctx: Ctx, token: string, fullName: string): Promise<string[] | null> {
  try {
    const { data } = await ctx.github.request<{ tree: { type: string; sha: string }[] }>(
      token,
      `/repos/${fullName}/git/trees/HEAD?recursive=1`,
    );
    return data.tree.filter((t) => t.type === "blob").map((t) => t.sha).slice(0, 50_000);
  } catch (error) {
    // A private or deleted original: nothing to compare against.
    if (error instanceof GitHubError && (error.status === 404 || error.status === 403 || error.status === 409)) return null;
    throw error;
  }
}

const STAGES: { [S in Message["stage"]]: (ctx: Ctx, msg: Extract<Message, { stage: S }>) => Promise<void> } = {
  /** List what the student shared through each installation; queue classification. */
  async discover(ctx, msg) {
    const { db, github } = ctx;
    const token = await userToken(ctx, msg.user_id);
    github.ensureBudget(token);
    await db.query("select private.update_sync_job($1, 'discover')", [msg.job_id]);

    // Logins can change on GitHub; the numeric id is what binds the account.
    const { data: me } = await github.request<{ id: number; login: string }>(token, "/user");
    await db.query("select private.refresh_github_login($1, $2, $3)", [msg.user_id, me.id, me.login]);

    // New installations (another organisation) show up here without a webhook.
    const installations = await github.paginate<{ installations: Installation[] }, Installation>(
      token,
      "/user/installations?per_page=100",
      (page) => page.installations,
    );
    const ours = installations.filter((i) => String(i.app_id) === ctx.cfg.appId && i.account);
    await db.query("select private.sync_user_installations($1, $2::text::jsonb)", [
      msg.user_id,
      JSON.stringify(
        ours.map((i) => ({
          id: i.id,
          account_id: i.account!.id,
          account_login: i.account!.login,
          account_type: i.account!.type === "Organization" ? "Organization" : "User",
          repository_selection: i.repository_selection === "all" ? "all" : "selected",
          suspended: Boolean(i.suspended_at),
        })),
      ),
    ]);

    const toClassify: number[] = [];
    for (const installation of ours.filter((i) => !i.suspended_at)) {
      const repos = await github.paginate<{ repositories: ListedRepo[] }, ListedRepo>(
        token,
        `/user/installations/${installation.id}/repositories?per_page=100`,
        (page) => page.repositories,
      );
      const [{ ids }] = await db.query<{ ids: string[] }>(
        "select private.upsert_discovered_repos($1, $2, $3::text::jsonb) as ids",
        [
          msg.user_id,
          installation.id,
          JSON.stringify(
            repos.map((r) => ({
              id: r.id,
              full_name: r.full_name,
              owner_id: r.owner.id,
              private: r.private,
              fork: r.fork,
              default_branch: r.default_branch,
              pushed_at: r.pushed_at,
            })),
          ),
        ],
      );
      toClassify.push(...ids.map(Number));
    }

    await db.query("select private.update_sync_job($1, 'classify', $2)", [msg.job_id, toClassify.length]);
    await advance(
      ctx,
      msg.job_id,
      toClassify.map((repoId) => ({ stage: "classify", user_id: msg.user_id, job_id: msg.job_id, repo_id: repoId })),
    );
    // Merged pull requests (L3) are checked alongside; the sync's progress doesn't wait for them.
    await advance(ctx, undefined, [{ stage: "prs", user_id: msg.user_id }]);
  },

  /** Owned, collaborator, fork or template, from the repository's own metadata. */
  async classify(ctx, msg) {
    const { db, github } = ctx;
    const [repo] = await db.query<{ installation_id: string }>(
      "select installation_id from public.github_user_repos where user_id = $1 and repo_id = $2",
      [msg.user_id, msg.repo_id],
    );
    const next: Message[] = [];
    if (repo) {
      const token = await github.installationToken(Number(repo.installation_id));
      github.ensureBudget(token);
      try {
        const { data } = await github.request<RepoDetail>(token, `/repositories/${msg.repo_id}`);
        await db.query("select private.classify_repo($1, $2, $3, $4, $5, $6)", [
          msg.user_id,
          msg.repo_id,
          data.owner.id,
          data.fork,
          data.parent?.full_name ?? null,
          data.template_repository?.full_name ?? null,
        ]);
        // Language stats (L1), and the original project's files for a fork or template:
        // those files are someone else's work, however they reached the student's commits.
        const { data: languages } = await github.request<Record<string, number>>(token, `/repositories/${msg.repo_id}/languages`);
        const upstream = data.parent?.full_name ?? data.template_repository?.full_name ?? null;
        const blobs = upstream ? await upstreamBlobs(ctx, token, upstream) : null;
        await db.query("select private.set_repo_details($1, $2, $3)", [msg.repo_id, Object.keys(languages ?? {}), blobs]);
        next.push({ stage: "harvest", user_id: msg.user_id, job_id: msg.job_id, repo_id: msg.repo_id });
      } catch (error) {
        // Deleted or no longer shared: nothing to classify, the next discovery drops it.
        if (!(error instanceof GitHubError && error.status === 404)) throw error;
      }
    }
    await db.query("select private.update_sync_job($1, null, null, 1)", [msg.job_id]);
    await advance(ctx, msg.job_id, next);
  },

  /**
   * The student's own commits on the default branch (PRD 5.5 "harvest"): newest 500,
   * kept only where GitHub's author.id is the student's account, which a spoofed
   * `git config user.email` can't produce.
   */
  async harvest(ctx, msg) {
    const { db, github } = ctx;
    const [repo] = await db.query<RepoRow>(REPO_QUERY, [msg.user_id, msg.repo_id]);
    if (!repo || repo.excluded || !repo.kind) {
      await advance(ctx, msg.job_id, []);
      return;
    }
    const token = await github.installationToken(Number(repo.installation_id));
    github.ensureBudget(token);
    const branch = repo.default_branch ? `&sha=${encodeURIComponent(repo.default_branch)}` : "";
    let listed: ListedCommit[] = [];
    try {
      listed = await github.paginate<ListedCommit[], ListedCommit>(
        token,
        `/repositories/${msg.repo_id}/commits?author=${encodeURIComponent(repo.login)}${branch}&per_page=100`,
        (page) => page,
        MAX_COMMITS / 100,
      );
    } catch (error) {
      // 409: an empty repository. 404: gone meanwhile.
      if (!(error instanceof GitHubError && (error.status === 409 || error.status === 404))) throw error;
    }
    const own = listed.filter((c) => c.author?.id === Number(repo.github_id));

    // Agent commits from the student's merged pull requests here, newest first, down to the last check.
    const agents = await loadAgents(ctx);
    if (agents.length) {
      const [{ checked }] = await db.query<{ checked: string | null }>("select private.agent_prs_checked($1, $2, false) as checked", [
        msg.user_id,
        msg.repo_id,
      ]);
      const since = checked ? Date.parse(checked) : 0;
      let pulls: PullDetail[] = [];
      try {
        ({ data: pulls } = await github.request<PullDetail[]>(
          token,
          `/repositories/${msg.repo_id}/pulls?state=closed&sort=updated&direction=desc&per_page=${MAX_AGENT_PRS}`,
        ));
      } catch (error) {
        if (!(error instanceof GitHubError && (error.status === 404 || error.status === 409))) throw error;
      }
      for (const pr of pulls) {
        if (pr.user?.id !== Number(repo.github_id) || !pr.merged_at || Date.parse(pr.merged_at) < since) continue;
        await recordAgentPr(ctx, token, msg.user_id, msg.repo_id, pr, agents);
      }
      // Only once every pull request is stored, so a retry after a failure checks them again.
      await db.query("select private.agent_prs_checked($1, $2, true)", [msg.user_id, msg.repo_id]);
    }

    await db.query("select private.set_repo_linguist_excludes($1, $2)", [msg.repo_id, await linguistExcludes(ctx, token, msg.repo_id)]);
    const [{ shas }] = await db.query<{ shas: string[] }>("select private.harvest_commits($1, $2, $3::text::jsonb, $4) as shas", [
      msg.user_id,
      msg.repo_id,
      JSON.stringify(
        own.map((c) => ({
          sha: c.sha,
          authored_at: c.commit.author?.date ?? null,
          committed_at: c.commit.committer?.date ?? null,
          parents: c.parents.length,
          signed: c.commit.verification?.verified === true,
        })),
      ),
      listed.length < MAX_COMMITS,
    ]);
    await db.query("select private.recompute_user_skills($1)", [msg.user_id]);
    const batches: Message[] = [];
    for (let i = 0; i < shas.length; i += EXTRACT_BATCH) {
      batches.push({ stage: "extract", user_id: msg.user_id, job_id: msg.job_id, repo_id: msg.repo_id, shas: shas.slice(i, i + EXTRACT_BATCH) });
    }
    await advance(ctx, msg.job_id, batches, 0, "extract");
  },

  /**
   * Each commit's files through the taxonomy's detectors (PRD 5.5 "extract"), then the
   * levels. Commits pushed after connecting arrive here straight from the push webhook,
   * with the push time; their author is checked the same way.
   */
  async extract(ctx, msg) {
    const { db, github } = ctx;
    const [repo] = await db.query<RepoRow>(REPO_QUERY, [msg.user_id, msg.repo_id]);
    if (!repo || repo.excluded) {
      await advance(ctx, msg.job_id, []);
      return;
    }
    const token = await github.installationToken(Number(repo.installation_id));
    github.ensureBudget(token);
    const taxonomy = await loadTaxonomy(ctx);
    const excludeGlobs = repo.linguist_excludes.map(globToRegExp);
    const upstream = new Set(
      (await db.query<{ blob_sha: string }>("select blob_sha from private.github_upstream_blobs where repo_id = $1", [msg.repo_id])).map(
        (r) => r.blob_sha,
      ),
    );

    const agents = await loadAgents(ctx);
    const agentShas = new Map(
      (await db.query<{ sha: string; ai_agent: string; via_pr: number }>("select * from private.agent_commit_shas($1, $2)", [
        msg.user_id,
        msg.repo_id,
      ])).map((r) => [r.sha, r]),
    );

    let recorded = 0;
    for (const sha of msg.shas) {
      if (!/^[0-9a-f]{40}$/.test(sha)) continue;
      let commit: CommitDetail;
      try {
        ({ data: commit } = await github.request<CommitDetail>(token, `/repositories/${msg.repo_id}/commits/${sha}`));
      } catch (error) {
        if (error instanceof GitHubError && (error.status === 404 || error.status === 422)) continue; // rewritten away
        throw error;
      }
      // Only commits GitHub attributes to the student's account (never the email alone), or an AI
      // agent's commits that arrived through the student's own merged pull request.
      const viaAgent = agentShas.get(sha);
      const isAgent = !!viaAgent && agentAuthor(commit, agents) === viaAgent.ai_agent;
      if (commit.author?.id !== Number(repo.github_id) && !isAgent) continue;

      const allFiles = changedFiles(commit.files);
      const files = allFiles.filter((f) => !(f.sha && upstream.has(f.sha)));
      const parents = commit.parents?.length ?? 1;
      const analysis = analyseCommit(files, taxonomy.compiled, { excludeGlobs });
      const excluded =
        parents > 1 ? "merge" : isBulkImport(parents, allFiles) ? "bulk_import" : analysis.excluded;
      const [{ recorded: isNew }] = await db.query<{ recorded: boolean }>(
        "select private.record_commit($1, $2, $3::text::jsonb) as recorded",
        [
          msg.user_id,
          msg.repo_id,
          JSON.stringify({
            sha,
            authored_at: commit.commit.author?.date ?? null,
            committed_at: commit.commit.committer?.date ?? null,
            pushed_at: msg.pushed_at ?? null,
            seen_via: msg.pushed_at ? "push" : "harvest",
            signed: commit.commit.verification?.verified === true,
            ai_agent: isAgent ? viaAgent!.ai_agent : null,
            via_pr: isAgent ? viaAgent!.via_pr : null,
            files: allFiles.length,
            meaningful_lines: excluded ? 0 : analysis.meaningfulLines,
            excluded,
            detections: excluded === "merge" ? [] : analysis.detections.map((d) => ({ skill: d.skillId, kind: d.kind, path: d.path, lines: d.lines })),
            blobs: excluded ? [] : duplicateCandidates(files, { excludeGlobs }),
          }),
        ],
      );
      if (isNew) recorded++;
    }
    await db.query("select private.recompute_user_skills($1)", [msg.user_id]);
    await advance(ctx, msg.job_id, [], recorded);
  },

  /**
   * A code check's snippet (PRD 5.5): a run of 20-40 lines the student added in one of their
   * counted commits for the skill. Only where it is gets recorded, never the code.
   */
  async code_check(ctx, msg) {
    const { db, github } = ctx;
    const random = ctx.random ?? Math.random;
    const [limits] = await db.query<{ min: number; max: number }>(
      "select private.code_check_limit('min_lines') as min, private.code_check_limit('max_lines') as max",
    );
    const candidates = await db.query<{ repo_id: string; sha: string; installation_id: string; paths: string[] }>(
      "select * from private.code_check_candidates($1)",
      [msg.check_id],
    );
    for (const c of candidates) {
      const token = await github.installationToken(Number(c.installation_id));
      github.ensureBudget(token);
      let commit: CommitDetail;
      try {
        ({ data: commit } = await github.request<CommitDetail>(token, `/repositories/${c.repo_id}/commits/${c.sha}`));
      } catch (error) {
        if (error instanceof GitHubError && [403, 404, 409, 422].includes(error.status)) continue;
        throw error;
      }
      const files = changedFiles(commit.files).filter((f) => c.paths.includes(f.path) && f.patch);
      for (const file of files.sort(() => random() - 0.5)) {
        const window = pickWindow(addedRuns(file.patch), limits.min, limits.max, random);
        if (!window) continue;
        await db.query("select private.code_check_prepared($1, $2, $3, $4, $5, $6)", [
          msg.check_id,
          c.repo_id,
          c.sha,
          file.path,
          window.start,
          window.end,
        ]);
        return;
      }
    }
    await db.query("select private.code_check_unavailable($1, $2)", [
      msg.check_id,
      "none of your commits for this skill has a long enough run of your own code yet",
    ]);
  },

  /**
   * The student's merged pull requests (PRD 5.5 "prs", for L3): one search for their newest,
   * then one message per pull request not seen before. Runs after each discovery.
   */
  async prs(ctx, msg) {
    const { db, github } = ctx;
    const [account] = await db.query<{ github_id: string; login: string }>(
      "select github_id, login from public.github_accounts where user_id = $1 and revoked_at is null",
      [msg.user_id],
    );
    if (!account) return;
    const token = await userToken(ctx, msg.user_id);
    github.ensureBudget(token);
    const q = encodeURIComponent(`type:pr is:merged author:${account.login}`);
    const { data } = await github.request<SearchIssues>(token, `/search/issues?q=${q}&sort=updated&order=desc&per_page=${MAX_PRS}`);
    const known = new Set(
      (await db.query<{ repo_full_name: string; number: number }>("select * from private.known_pull_requests($1)", [msg.user_id])).map(
        (r) => `${r.repo_full_name}#${r.number}`,
      ),
    );
    const next: Message[] = [];
    for (const item of data.items ?? []) {
      const repo = repoFromUrl(item.repository_url);
      if (!repo || !item.pull_request || item.user?.id !== Number(account.github_id)) continue;
      if (known.has(`${repo.toLowerCase()}#${item.number}`)) continue;
      next.push({ stage: "pr", user_id: msg.user_id, repo, number: item.number });
    }
    await advance(ctx, undefined, next);
  },

  /**
   * One merged pull request: in someone else's repository, and merged or approved by another
   * person whose account was at least 90 days old then. Its files go through the detectors.
   */
  async pr(ctx, msg) {
    const { db, github } = ctx;
    if (!isRepoName(msg.repo) || !Number.isInteger(msg.number) || msg.number < 1) return;
    const [account] = await db.query<{ github_id: string }>(
      "select github_id from public.github_accounts where user_id = $1 and revoked_at is null",
      [msg.user_id],
    );
    if (!account) return;
    const me = Number(account.github_id);
    const token = await userToken(ctx, msg.user_id);
    github.ensureBudget(token);
    let pr: PullDetail;
    try {
      ({ data: pr } = await github.request<PullDetail>(token, `/repos/${msg.repo}/pulls/${msg.number}`));
    } catch (error) {
      // Gone, or a private repository the student's token can't read.
      if (error instanceof GitHubError && (error.status === 404 || error.status === 403)) return;
      throw error;
    }
    if (pr.user?.id !== me || !pr.merged_at) return;
    const repo = pr.base.repo;

    // In a repository the student shared: the AI agent's commits in it are their AI-assisted work.
    const [shared] = await db.query<{ repo_id: string | null }>("select private.shared_repo_id($1, $2) as repo_id", [msg.user_id, repo.id]);
    if (shared?.repo_id) {
      const [row] = await db.query<RepoRow>(REPO_QUERY, [msg.user_id, Number(shared.repo_id)]);
      if (row && !row.excluded) {
        const installation = await github.installationToken(Number(row.installation_id));
        github.ensureBudget(installation);
        const found = await recordAgentPr(ctx, installation, msg.user_id, repo.id, pr, await loadAgents(ctx));
        if (found) {
          const pending = await db.query<{ sha: string }>(
            "select sha from public.github_commits where user_id = $1 and repo_id = $2 and extracted_at is null and via_pr = $3",
            [msg.user_id, repo.id, pr.number],
          );
          const shas = pending.map((p) => p.sha);
          const batches: Message[] = [];
          for (let i = 0; i < shas.length; i += EXTRACT_BATCH) {
            batches.push({ stage: "extract", user_id: msg.user_id, repo_id: repo.id, shas: shas.slice(i, i + EXTRACT_BATCH) });
          }
          await advance(ctx, undefined, batches);
        }
      }
    }
    const record = {
      repo_github_id: repo.id,
      number: pr.number,
      pr_github_id: pr.id,
      repo_full_name: repo.full_name,
      repo_private: repo.private,
      merged_at: pr.merged_at,
      approver_github_id: null as number | null,
      exclusion: null as string | null,
      files: 0,
      skills: [] as { skill_id: string; path: string }[],
    };

    if (repo.owner.id === me) {
      record.exclusion = "own_repo";
    } else {
      // The merger first, then approving reviewers: other people, never bots.
      const candidates: GitHubUser[] = [];
      if (isHuman(pr.merged_by) && pr.merged_by.id !== me) candidates.push(pr.merged_by);
      const reviews = await github.paginate<Review[], Review>(token, `/repos/${msg.repo}/pulls/${msg.number}/reviews?per_page=100`, (p) => p, 3);
      for (const r of reviews) {
        if (r.state === "APPROVED" && isHuman(r.user) && r.user.id !== me && !candidates.some((c) => c.id === r.user!.id)) {
          candidates.push(r.user);
        }
      }
      const cutoff = Date.parse(pr.merged_at) - APPROVER_MIN_AGE_DAYS * 86_400_000;
      for (const c of candidates) {
        const { data: user } = await github.request<{ id: number; created_at: string }>(token, `/users/${encodeURIComponent(c.login)}`);
        if (user.id === c.id && Date.parse(user.created_at) <= cutoff) {
          record.approver_github_id = c.id;
          break;
        }
      }
      if (!record.approver_github_id) record.exclusion = candidates.length ? "young_account" : "no_other_human";
    }

    if (!record.exclusion) {
      const files = await github.paginate<GitHubFile[], GitHubFile>(token, `/repos/${msg.repo}/pulls/${msg.number}/files?per_page=100`, (p) => p, 2);
      const taxonomy = await loadTaxonomy(ctx);
      const changed = changedFiles(files);
      record.files = changed.length;
      const analysis = analyseCommit(changed, taxonomy.compiled);
      record.skills = analysis.detections.map((d) => ({ skill_id: d.skillId, path: d.path }));
    }
    await db.query("select private.record_pull_request($1, $2::text::jsonb)", [msg.user_id, JSON.stringify(record)]);
  },

  /** Installation changes are applied in SQL; affected students get a fresh discovery. */
  async webhook(ctx, msg) {
    const [{ follow_up }] = await ctx.db.query<{ follow_up: { discover?: string[] } }>(
      "select private.process_github_webhook($1) as follow_up",
      [msg.delivery_id],
    );
    for (const userId of follow_up.discover ?? []) {
      await ctx.db.query("select private.start_github_sync($1, 'webhook')", [userId]);
    }
    // A merged pull request, or an approval on one, rechecks it for its author (L3).
    const [{ prs }] = await ctx.db.query<{ prs: Message[] }>("select private.github_webhook_pr($1) as prs", [msg.delivery_id]);
    await advance(ctx, undefined, prs);
  },

  /** Revoke at GitHub, then forget the secrets. */
  async revoke(ctx, msg) {
    const [row] = await ctx.db.query<{ access: string | null; refresh: string | null }>(
      `select a.decrypted_secret as access, r.decrypted_secret as refresh
         from private.github_revocations v
         left join vault.decrypted_secrets a on a.id = v.access_secret_id
         left join vault.decrypted_secrets r on r.id = v.refresh_secret_id
        where v.id = $1`,
      [msg.revocation_id],
    );
    if (row?.access) {
      const revoked = await revokeGrant(ctx.cfg, ctx.fetchImpl, row.access);
      if (!revoked && row.refresh) {
        // The access token had expired: a refreshed one can still revoke the grant.
        const fresh = await refreshUserToken(ctx.cfg, ctx.fetchImpl, row.refresh, ctx.now()).catch(() => null);
        if (fresh) await revokeGrant(ctx.cfg, ctx.fetchImpl, fresh.accessToken);
      }
    }
    await ctx.db.query("select private.finish_github_revocation($1)", [msg.revocation_id]);
  },
};
