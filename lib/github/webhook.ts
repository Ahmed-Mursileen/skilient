import { createHmac, timingSafeEqual } from "node:crypto";

/** Events the worker acts on (PRD 5.5); anything else is acknowledged and dropped. */
export const HANDLED_EVENTS = new Set([
  "installation",
  "installation_repositories",
  "github_app_authorization",
  "push",
  "pull_request",
  "pull_request_review",
]);

/** GitHub's `X-Hub-Signature-256`: sha256=HMAC(secret, raw body), compared in constant time. */
export function verifySignature(body: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const id = (v: unknown) => (typeof obj(v).id === "number" ? { id: obj(v).id } : null);

function repository(v: unknown) {
  const r = obj(v);
  return { id: r.id, full_name: r.full_name, private: r.private, owner: id(r.owner), pushed_at: r.pushed_at ?? null };
}

/**
 * Keeps only what the worker needs, so stored deliveries hold no commit messages, diffs,
 * emails or other people's details (PRD 5.5: private source is never stored).
 */
export function summariseWebhook(event: string, payload: unknown): Json {
  const p = obj(payload);
  const base: Json = { action: typeof p.action === "string" ? p.action : null, installation: id(p.installation), sender: id(p.sender) };
  switch (event) {
    case "installation": {
      const i = obj(p.installation);
      const account = obj(i.account);
      return {
        ...base,
        installation: {
          id: i.id,
          account: { id: account.id, login: account.login, type: account.type },
          repository_selection: i.repository_selection,
        },
      };
    }
    case "installation_repositories":
      return {
        ...base,
        repository_selection: p.repository_selection ?? null,
        repositories_added: list(p.repositories_added).map((r) => ({ id: r.id, full_name: r.full_name, private: r.private })),
        repositories_removed: list(p.repositories_removed).map((r) => ({ id: r.id })),
      };
    case "push":
      return {
        ...base,
        repository: repository(p.repository),
        ref: p.ref,
        before: p.before,
        after: p.after,
        forced: p.forced === true,
        created: p.created === true,
        deleted: p.deleted === true,
        commits: list(p.commits).map((c) => c.id),
      };
    case "pull_request": {
      const pr = obj(p.pull_request);
      return {
        ...base,
        repository: repository(p.repository),
        pull_request: {
          id: pr.id,
          number: pr.number,
          merged: pr.merged === true,
          merged_at: pr.merged_at ?? null,
          merged_by: id(pr.merged_by),
          user: id(pr.user),
          base_repo: id(obj(pr.base).repo),
        },
      };
    }
    case "pull_request_review": {
      const review = obj(p.review);
      const pr = obj(p.pull_request);
      return {
        ...base,
        repository: repository(p.repository),
        review: { id: review.id, state: review.state, user: id(review.user) },
        pull_request: { number: pr.number, user: id(pr.user) },
      };
    }
    default:
      return base;
  }
}
