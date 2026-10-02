/**
 * Client-safe billing wording and helpers (no server code). Prices and entitlements always come from
 * the database; these only label what it returns.
 */
export type SubjectKind = "user" | "org" | "university";

export const PLAN_STATUS_LABELS: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  expired: "Ended",
  cancelled: "Cancelled",
};

export const METHOD_LABELS: Record<string, string> = {
  card: "Card (renews automatically)",
  wallet: "Wallet (prepaid, no automatic renewal)",
  bank_transfer: "Bank transfer",
  none: "No payment method",
};

export const INVOICE_KIND_LABELS: Record<string, string> = { invoice: "Invoice", receipt: "Receipt", credit_note: "Credit note" };

export const DRAFT_REASON_LABELS: Record<string, string> = {
  test_mode: "Test mode: no real money was charged.",
  company_details_missing: "Skilient's company details aren't set yet, so this isn't a final tax invoice.",
  tax_rate_missing: "The sales tax rate for this province isn't set yet.",
};

export const PROVINCES = ["Punjab", "Sindh", "KP", "Balochistan", "ICT", "AJK", "GB"] as const;

export const ENTITLEMENT_LABELS: Record<string, string> = {
  "cv.pdf_export": "ATS PDF export",
  "cv.refresh_on_demand": "Refresh your CV any time",
  "cv.templates": "CV layouts",
  "cv.insights": "CV insights",
  "cv.viewer_names": "Company names on CV views",
  "privacy.record_viewers": "Who at your university viewed your record",
  "insights.post_survey": "Full survey breakdown on your posts",
  "talent.full_profile": "Full profiles, CVs and evidence",
  "contact.credits": "Contact requests per billing month",
  "org.seats": "Seats",
  "recruit.shortlists": "Shortlists and private notes",
  "recruit.saved_searches": "Saved searches",
  "recruit.analytics": "Hiring analytics",
  "jobs.active_posts": "Live job posts",
  "competitions.run": "Skill competitions per quarter",
  "api.access": "API and ATS export",
  "hire_fee.waived": "Hiring fee waived",
  "org.sso": "Single sign-on",
  "uni.dashboard": "Analytics dashboard",
  "uni.exports": "CSV and PDF exports",
  "uni.student_records": "Individual student records",
  "uni.sponsored_pro": "Student Pro sponsored",
  "uni.job_fairs": "Digital job fairs per year",
  "uni.hackathons": "Hackathons per year",
  "uni.admin_seats": "Admin seats",
};

export function money(amount: number | string | null | undefined, currency: string): string {
  const n = Number(amount ?? 0);
  const digits = currency === "USD" ? 2 : Number.isInteger(n) ? 0 : 2;
  return `${currency} ${n.toLocaleString("en-PK", { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
}

export function grantValue(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false || value === null || value === undefined) return "No";
  if (typeof value === "number") return value >= 100000 ? "Unlimited" : value.toLocaleString("en-PK");
  return String(value).replace(/_/g, " ");
}

/** Where each kind of account manages billing. */
export const BILLING_HOME: Record<SubjectKind, string> = { user: "/settings/billing", org: "/org/billing", university: "/uni/billing" };
