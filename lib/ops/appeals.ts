/**
 * Client-safe wording for sanctions and appeals (PRD 5.26). Staff names never reach the person
 * a decision is about.
 */
export type AppealType = "sanction" | "report_case" | "cv_revocation" | "credential" | "code_check";
export type AppealStatus = "pending" | "upheld" | "overturned";
export type SanctionKind = "warn" | "suspend" | "ban" | "throttle";

export const APPEAL_TYPES = ["sanction", "report_case", "cv_revocation", "credential", "code_check"] as const satisfies readonly AppealType[];

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  pending: "Waiting for a decision",
  upheld: "Decision stands",
  overturned: "Decision reversed",
};

export const SANCTION_LABELS: Record<SanctionKind, string> = { warn: "Warning", suspend: "Suspension", ban: "Ban", throttle: "Throttle" };

const TARGET_NOUNS: Record<string, string> = { post: "post", comment: "comment", message: "message", profile: "profile", venture: "venture" };

type Summary = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** One line naming the decision, for the person it is about and for staff. */
export function decisionTitle(type: AppealType, summary: Summary): string {
  switch (type) {
    case "sanction": {
      const kind = SANCTION_LABELS[summary.kind as SanctionKind] ?? "Restriction";
      const org = s(summary.org_name);
      return org ? `${kind} of ${org}` : `${kind} on your account`;
    }
    case "report_case": {
      const noun = TARGET_NOUNS[String(summary.target_type)] ?? "content";
      return summary.status === "warned" ? `Warning about your ${noun}` : `Your ${noun} was removed`;
    }
    case "cv_revocation":
      return `Verified CV ${s(summary.code) ?? ""} revoked`.replace(/\s+/g, " ").trim();
    case "credential":
      return `Credential not approved: ${s(summary.title) ?? "credential"}`;
    case "code_check":
      return `Code check not passed: ${s(summary.skill) ?? "skill"}`;
  }
}

/** The reason recorded with the decision, when there is one. */
export function decisionReason(summary: Summary): string | null {
  return s(summary.reason) ?? s(summary.feedback);
}
