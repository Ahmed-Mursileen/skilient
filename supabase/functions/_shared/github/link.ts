import { exchangeCode, GitHub } from "./client.ts";
import type { Db, Fetch, GithubConfig, Log } from "./types.ts";
import { isUuid } from "./types.ts";

export type LinkStatus = "linked" | "clash" | "other_account" | "expired" | "failed";

interface GithubUser {
  id: number;
  login: string;
}

interface Installation {
  id: number;
  app_id: number;
  account: { id: number; login: string; type: string } | null;
  repository_selection: "all" | "selected";
}

/**
 * Binds the ticket's student to the GitHub account behind the ticket's OAuth code
 * (PRD 5.5 P0). The student is whoever wrote the ticket under their own session; the
 * GitHub account is whoever GitHub says the code belongs to. Nothing else is trusted.
 */
export async function linkGithub(
  ticket: string,
  deps: { db: Db; cfg: GithubConfig; fetch?: Fetch; log: Log; now?: () => number },
): Promise<LinkStatus> {
  if (!isUuid(ticket)) return "expired";
  const { db, cfg, log } = deps;
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  const [claim] = await db.query<{ user_id: string; code: string; installation_id: string | null }>(
    "select user_id, code, installation_id from private.claim_github_link_ticket($1)",
    [ticket],
  );
  if (!claim) return "expired";

  try {
    const tokens = await exchangeCode(cfg, fetchImpl, claim.code, now());
    const github = new GitHub(cfg, fetchImpl, now);
    const { data: user } = await github.request<GithubUser>(tokens.accessToken, "/user");
    const installations = await github.paginate<{ installations: Installation[] }, Installation>(
      tokens.accessToken,
      "/user/installations?per_page=100",
      (page) => page.installations,
    );
    const ours = installations
      .filter((i) => String(i.app_id) === cfg.appId && i.account)
      .map((i) => ({
        id: i.id,
        account_id: i.account!.id,
        account_login: i.account!.login,
        account_type: i.account!.type === "Organization" ? "Organization" : "User",
        repository_selection: i.repository_selection === "all" ? "all" : "selected",
      }));

    const [{ status }] = await db.query<{ status: LinkStatus }>(
      "select private.complete_github_link($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb) as status",
      [
        ticket,
        user.id,
        user.login,
        tokens.accessToken,
        tokens.accessExpiresAt,
        tokens.refreshToken,
        tokens.refreshExpiresAt,
        JSON.stringify(ours),
      ],
    );
    log("github.link", { outcome: status, user_id: claim.user_id, installations: ours.length });
    return status;
  } catch (error) {
    await db.query("select private.fail_github_link($1)", [ticket]);
    log("github.link", {
      outcome: "failed",
      user_id: claim.user_id,
      error_code: error instanceof Error ? error.message : "unknown",
    });
    return "failed";
  }
}
