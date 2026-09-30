/**
 * The verify page's status (PRD 5.18; decisions.md 2026-10-01), checked in this order:
 * Not found, Revoked, Altered, Superseded, Outdated, Valid. Pure, client-safe.
 */
export type VerifyStatus = "not_found" | "revoked" | "altered" | "superseded" | "outdated" | "valid";

export interface VerifyFacts {
  found: boolean;
  revoked: boolean;
  /** The stored record re-checked against its own signature and hash. */
  signatureValid: boolean;
  /** A PDF's hash was given and it matches no export of this code. */
  pdfMismatch: boolean;
  superseded: boolean;
  expired: boolean;
}

export function verifyStatus(f: VerifyFacts): VerifyStatus {
  if (!f.found) return "not_found";
  if (f.revoked) return "revoked";
  if (!f.signatureValid || f.pdfMismatch) return "altered";
  if (f.superseded) return "superseded";
  if (f.expired) return "outdated";
  return "valid";
}

export const STATUS_TEXT: Record<VerifyStatus, { title: string; body: string }> = {
  valid: { title: "Valid", body: "This CV was issued by Skilient and hasn't changed since. Every item comes from checked evidence." },
  superseded: {
    title: "Superseded",
    body: "This CV is genuine, but the student has a newer version. Ask them for their latest link.",
  },
  outdated: {
    title: "Outdated",
    body: "This CV is genuine but was issued more than 12 months ago. Ask the student for a current one.",
  },
  revoked: { title: "Revoked", body: "This CV has been withdrawn and is no longer valid." },
  altered: {
    title: "Altered",
    body: "The file you checked doesn't match the CV issued under this code. The genuine CV is shown below so you can compare.",
  },
  not_found: { title: "Not found", body: "No CV has this code. Check the code and try again." },
};
