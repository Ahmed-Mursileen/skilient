/**
 * competition-freeze (PRD 5.20): when a competition's submissions freeze, record each submitted
 * repository's latest commit where it can be read. Public repositories answer GitHub's commits API
 * without a token; a private or missing one is recorded as "not readable" and the team's own link
 * stays the evidence. Transient failures (network, 5xx, rate limits) are retried on the next tick.
 */
import type { Db, Log } from "../github/types.ts";

interface Candidate {
  team_id: string;
  repo_url: string;
}

const REPO = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export async function runCompetitionFreeze(opts: { db: Db; fetch: typeof fetch; log: Log; token?: string }): Promise<{ recorded: number; unreadable: number; retry: number }> {
  const { db, log } = opts;
  const out = { recorded: 0, unreadable: 0, retry: 0 };
  const rows = await db.query<Candidate>("select team_id, repo_url from private.competition_freeze_candidates()");
  for (const row of rows) {
    const match = REPO.exec(row.repo_url);
    if (!match) {
      await db.query("select private.competition_freeze_record($1::uuid, null, 'not a GitHub repository address')", [row.team_id]);
      out.unreadable++;
      continue;
    }
    try {
      const res = await opts.fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/commits?per_page=1`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "SkilientCompetitionFreeze/1.0",
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
      });
      if (res.status === 200) {
        const body = (await res.json()) as { sha?: string }[];
        const sha = typeof body[0]?.sha === "string" ? body[0].sha : null;
        await db.query("select private.competition_freeze_record($1::uuid, $2, $3)", [row.team_id, sha, sha ? "ok" : "repository has no commits"]);
        if (sha) out.recorded++;
        else out.unreadable++;
      } else if (res.status === 404 || res.status === 403 || res.status === 451 || res.status === 409) {
        // 403 is also GitHub's rate limit: only a body that says so is retried.
        const text = res.status === 403 ? await res.text().catch(() => "") : "";
        if (res.status === 403 && /rate limit/i.test(text)) {
          out.retry++;
        } else {
          await db.query("select private.competition_freeze_record($1::uuid, null, 'repository not readable (private or missing)')", [row.team_id]);
          out.unreadable++;
        }
      } else {
        out.retry++;
      }
    } catch {
      out.retry++;
    }
    log("competitions.freeze", { outcome: "ok" });
  }
  return out;
}
