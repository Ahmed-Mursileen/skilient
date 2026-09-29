/**
 * Credential limits the browser needs too (PRD 5.19, decisions.md 2026-09-30). The database
 * re-checks each one (`credentials.limits` in platform_config, the bucket's own limits).
 */
export const CREDENTIAL_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const CREDENTIAL_BUCKET = "credentials";
export const CREDENTIAL_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export type CredentialStatus = "pending" | "approved" | "rejected" | "expired";

export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
  expired: "Expired",
};
