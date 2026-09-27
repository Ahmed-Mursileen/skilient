import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type SyncStatus = Database["public"]["Enums"]["sync_status"];
type RepoKind = Database["public"]["Enums"]["github_repo_kind"];

export interface GithubSync {
  status: SyncStatus;
  stage: string | null;
  reposTotal: number;
  reposDone: number;
  commitsAnalysed: number;
  skillsFound: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface GithubRepoRow {
  repoId: number;
  fullName: string;
  private: boolean;
  kind: RepoKind | null;
  excluded: boolean;
}

export interface GithubOverview {
  account: { login: string; connectedAt: string; revoked: boolean } | null;
  sync: GithubSync | null;
  repos: GithubRepoRow[];
}

/** The signed-in student's own GitHub connection, sync and repositories (RLS: owner only). */
export async function getGithubOverview(userId: string, withRepos = true): Promise<GithubOverview> {
  const supabase = await createClient();
  const [account, sync, repos] = await Promise.all([
    supabase.from("github_accounts").select("login, connected_at, revoked_at").eq("user_id", userId).maybeSingle(),
    supabase
      .from("sync_jobs")
      .select("status, stage, repos_total, repos_done, commits_analysed, skills_found, created_at, finished_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    withRepos
      ? supabase
          .from("github_user_repos")
          .select("repo_id, kind, excluded, github_repos!inner(full_name, private)")
          .eq("user_id", userId)
          .order("repo_id")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = account.error ?? sync.error ?? repos.error;
  if (failed) throw new Error(`github overview: ${failed.code}`);

  return {
    account: account.data
      ? { login: account.data.login, connectedAt: account.data.connected_at, revoked: account.data.revoked_at !== null }
      : null,
    sync: sync.data
      ? {
          status: sync.data.status,
          stage: sync.data.stage,
          reposTotal: sync.data.repos_total,
          reposDone: sync.data.repos_done,
          commitsAnalysed: sync.data.commits_analysed,
          skillsFound: sync.data.skills_found,
          createdAt: sync.data.created_at,
          finishedAt: sync.data.finished_at,
        }
      : null,
    repos: (repos.data ?? [])
      .map((r) => ({
        repoId: r.repo_id,
        fullName: r.github_repos.full_name,
        private: r.github_repos.private,
        kind: r.kind,
        excluded: r.excluded,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

/** Messages for the `?github=` outcome the callback redirects with. */
export const GITHUB_OUTCOMES: Record<string, { tone: "success" | "error"; message: string }> = {
  linked: { tone: "success", message: "GitHub connected. We're reading your repositories now." },
  clash: {
    tone: "error",
    message:
      "That GitHub account is already linked to another Skilient account. We've flagged it for our trust team; if it's yours, contact support.",
  },
  other_account: {
    tone: "error",
    message: "You signed in to a different GitHub account. Disconnect the current one first, then connect the other.",
  },
  denied: { tone: "error", message: "GitHub wasn't connected: the request was cancelled on GitHub." },
  state: { tone: "error", message: "That GitHub link expired or was opened in another account. Start again below." },
  expired: { tone: "error", message: "That GitHub link expired. Start again below." },
  rate_limited: { tone: "error", message: "Too many attempts. Try again in an hour." },
  failed: { tone: "error", message: "Couldn't connect GitHub. Try again in a minute." },
};
