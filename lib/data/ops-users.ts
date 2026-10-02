import "server-only";

import { dayLabel, eventTime } from "@/lib/format/time";
import { isRefusal, rpcJson } from "@/lib/data/rpc-json";

/**
 * /ops/users reads (PRD 5.26): search, the read-only record and view-as pages. Every read is one
 * SQL function that checks a staff role on a two-factor session; view-as pages also need a view
 * session the same staff member started, with a reason, in the last hour. None reads a chat.
 */

export interface UserHit {
  userId: string;
  name: string;
  username: string | null;
  email: string;
  role: string;
  university: string | null;
  status: string;
  githubLogin: string | null;
  restriction: string | null;
  joined: string;
}

export async function searchUsers(query: string): Promise<UserHit[]> {
  const raw = await rpcJson<
    { user_id: string; name: string; username: string | null; email: string; role: string; university: string | null; status: string; github_login: string | null; restriction: string | null; created_at: string }[]
  >("ops_user_search", { p_query: query });
  return raw.map((u) => ({
    userId: u.user_id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    university: u.university,
    status: u.status,
    githubLogin: u.github_login,
    restriction: u.restriction,
    joined: dayLabel(u.created_at),
  }));
}

export interface UserRecord {
  userId: string;
  isMe: boolean;
  account: {
    email: string;
    name: string;
    username: string | null;
    role: string;
    status: string;
    university: string | null;
    department: string | null;
    graduationYear: number | null;
    visibility: string;
    joined: string;
    lastSignIn: string | null;
    emailConfirmed: boolean;
    bannedUntil: string | null;
    deleteAfter: string | null;
    twoFactor: boolean;
    backupCodes: number;
    staffRoles: string[];
  };
  github: { login: string; githubId: number; connected: string; revoked: boolean; lastSync: { status: string; trigger: string; at: string; error: string | null } | null } | null;
  score: { total: number; tier: string | null; ranked: boolean; percentile: number | null; held: boolean; proof: number; momentum: number; adjustments: number; computed: string; formulaVersion: number } | null;
  skills: { skill: string; level: number; repos: number }[];
  credentials: Record<string, number>;
  codeChecks: { id: string; skill: string; status: string; requested: string }[];
  cvs: { id: string; code: string; version: number; issued: string; revoked: string | null; revokedReason: string | null }[];
  sanctions: { id: string; kind: string; until: string | null; reason: string; created: string; lifted: boolean; staffName: string | null }[];
  restriction: { id: string; kind: string } | null;
  appeals: { id: string; type: string; status: string; created: string }[];
  hints: { userId: string; name: string | null; why: string; restriction: string | null }[];
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function getUserRecord(id: string): Promise<UserRecord | null> {
  let r: Raw;
  try {
    r = await rpcJson<Raw>("ops_user_record", { p_user: id });
  } catch (err) {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  }
  const a = r.account as Raw;
  const g = r.github as Raw | null;
  const s = r.score as Raw | null;
  const last = g?.last_sync as Raw | null | undefined;
  return {
    userId: String(r.user_id),
    isMe: r.is_me === true,
    account: {
      email: String(a.email),
      name: String(a.name),
      username: str(a.username),
      role: String(a.role),
      status: String(a.status),
      university: str(a.university),
      department: str(a.department),
      graduationYear: typeof a.graduation_year === "number" ? a.graduation_year : null,
      visibility: String(a.visibility),
      joined: dayLabel(String(a.created_at)),
      lastSignIn: str(a.last_sign_in_at) ? eventTime(String(a.last_sign_in_at)) : null,
      emailConfirmed: a.email_confirmed === true,
      bannedUntil: str(a.banned_until) ? dayLabel(String(a.banned_until)) : null,
      deleteAfter: str(a.delete_after) ? dayLabel(String(a.delete_after)) : null,
      twoFactor: a.two_factor === true,
      backupCodes: Number(a.backup_codes ?? 0),
      staffRoles: (a.staff_roles as string[]) ?? [],
    },
    github: g
      ? {
          login: String(g.login),
          githubId: Number(g.github_id),
          connected: dayLabel(String(g.connected_at)),
          revoked: g.revoked_at != null,
          lastSync: last ? { status: String(last.status), trigger: String(last.trigger), at: eventTime(String(last.created_at)), error: str(last.error) } : null,
        }
      : null,
    score: s
      ? {
          total: Number(s.total),
          tier: str(s.tier),
          ranked: s.ranked === true,
          percentile: typeof s.percentile === "number" ? s.percentile : null,
          held: s.held === true,
          proof: Number(s.proof),
          momentum: Number(s.momentum),
          adjustments: Number(s.adjustments),
          computed: eventTime(String(s.computed_at)),
          formulaVersion: Number(s.formula_version),
        }
      : null,
    skills: ((r.skills as Raw[]) ?? []).map((k) => ({ skill: String(k.skill), level: Number(k.level), repos: Number(k.repos) })),
    credentials: (r.credentials as Record<string, number>) ?? {},
    codeChecks: ((r.code_checks as Raw[]) ?? []).map((c) => ({ id: String(c.id), skill: String(c.skill), status: String(c.status), requested: dayLabel(String(c.requested_at)) })),
    cvs: ((r.cvs as Raw[]) ?? []).map((c) => ({
      id: String(c.id),
      code: String(c.code),
      version: Number(c.version),
      issued: dayLabel(String(c.issued_at)),
      revoked: str(c.revoked_at) ? dayLabel(String(c.revoked_at)) : null,
      revokedReason: str(c.revoked_reason),
    })),
    sanctions: ((r.sanctions as Raw[]) ?? []).map((x) => ({
      id: String(x.id),
      kind: String(x.kind),
      until: str(x.until) ? eventTime(String(x.until)) : null,
      reason: String(x.reason),
      created: dayLabel(String(x.created_at)),
      lifted: x.lifted_at != null,
      staffName: str(x.staff_name),
    })),
    restriction: r.restriction ? { id: String((r.restriction as Raw).id), kind: String((r.restriction as Raw).kind) } : null,
    appeals: ((r.appeals as Raw[]) ?? []).map((x) => ({ id: String(x.id), type: String(x.type), status: String(x.status), created: dayLabel(String(x.created_at)) })),
    hints: ((r.hints as Raw[]) ?? []).map((h) => ({ userId: String(h.user_id), name: str(h.name), why: String(h.why), restriction: str(h.restriction) })),
  };
}

export const VIEW_PAGES = ["profile", "me", "cv", "opportunities", "privacy", "notifications"] as const;
export type ViewPage = (typeof VIEW_PAGES)[number];

/** One view-as page, or null when there is no view session (start one first). */
export async function getViewAsPage(userId: string, page: ViewPage): Promise<{ name: string; doc: Raw } | null> {
  try {
    const r = await rpcJson<{ name: string; doc: Raw }>("ops_view_as_page", { p_user: userId, p_page: page });
    return { name: r.name, doc: r.doc };
  } catch (err) {
    if (isRefusal(err, "42501")) return null;
    throw err;
  }
}
