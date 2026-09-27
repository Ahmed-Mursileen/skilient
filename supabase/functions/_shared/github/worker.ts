import { GitHub, GitHubError, RateLimited, refreshUserToken, revokeGrant } from "./client.ts";
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
}

type Message =
  | { stage: "discover"; user_id: string; job_id: number }
  | { stage: "classify"; user_id: string; job_id: number; repo_id: number }
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

const STAGES: { [S in Message["stage"]]: (ctx: Ctx, msg: Extract<Message, { stage: S }>) => Promise<void> } = {
  /** List what the student shared through each installation; queue classification. */
  async discover(ctx, msg) {
    const { db, github } = ctx;
    const token = await userToken(ctx, msg.user_id);
    github.ensureBudget(token);
    await db.query("select private.update_sync_job($1, 'discover')", [msg.job_id]);

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

    if (!toClassify.length) {
      await db.query("select private.update_sync_job($1, 'done', 0, 0, 'done')", [msg.job_id]);
      return;
    }
    await db.query("select private.update_sync_job($1, 'classify', $2)", [msg.job_id, toClassify.length]);
    for (const repoId of toClassify) {
      await db.query("select private.enqueue_github($1::text::jsonb)", [
        JSON.stringify({ stage: "classify", user_id: msg.user_id, job_id: msg.job_id, repo_id: repoId }),
      ]);
    }
  },

  /** Owned, collaborator, fork or template, from the repository's own metadata. */
  async classify(ctx, msg) {
    const { db, github } = ctx;
    const [repo] = await db.query<{ installation_id: string }>(
      "select installation_id from public.github_user_repos where user_id = $1 and repo_id = $2",
      [msg.user_id, msg.repo_id],
    );
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
      } catch (error) {
        // Deleted or no longer shared: nothing to classify, the next discovery drops it.
        if (!(error instanceof GitHubError && error.status === 404)) throw error;
      }
    }
    const [job] = await db.query<{ repos_done: number; repos_total: number }>(
      "select repos_done, repos_total from private.update_sync_job($1, null, null, 1)",
      [msg.job_id],
    );
    // Harvest, extract and levels arrive in phase 2 slice 3; until then a sync ends here.
    if (job && job.repos_done >= job.repos_total) {
      await db.query("select private.update_sync_job($1, 'done', null, 0, 'done')", [msg.job_id]);
    }
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
