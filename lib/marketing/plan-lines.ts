/**
 * What a plan includes, in marketing sentences, read from the plan's `grants` (the same values
 * billing enforces), so /pricing and the organisation pages can't drift from what a plan does.
 * Keys without a sentence are left out; a grant that is off is never listed.
 */

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n.toLocaleString("en-PK")} ${many}`);
const UNLIMITED = 100000;

type Line = (value: unknown) => string | null;

const LINES: Record<string, Line> = {
  // Students
  "cv.refresh_on_demand": (v) => (v ? "Refresh your CV any time" : null),
  "cv.pdf_export": (v) => (v ? "ATS-ready PDF export" : null),
  "cv.templates": (v) => (typeof v === "number" && v > 1 ? `${v} CV layouts, all ATS-safe` : null),
  "cv.insights": (v) => (v ? "CV insights: what would strengthen it" : null),
  "cv.viewer_names": (v) => (v ? "Which companies viewed your CV, and when" : null),
  "privacy.record_viewers": (v) => (v ? "Who at your university viewed your record" : null),
  "insights.post_survey": (v) => (v ? "The full survey breakdown on your posts" : null),
  // Recruiters
  "talent.full_profile": (v) => (v ? "Full profiles, CVs and evidence" : null),
  "contact.credits": (v) => (typeof v === "number" && v > 0 ? `${count(v, "contact request", "contact requests")} a month` : null),
  "org.seats": (v) => (typeof v === "number" && v > 0 ? count(v, "seat", "seats") : null),
  "recruit.shortlists": (v) => (v ? "Shortlists and private notes" : null),
  "recruit.saved_searches": (v) => (v ? "Saved searches with email alerts" : null),
  "jobs.active_posts": (v) => (typeof v === "number" && v > 0 ? (v >= UNLIMITED ? "Unlimited job posts" : count(v, "live job post", "live job posts")) : null),
  "competitions.run": (v) => (typeof v === "number" && v > 0 ? `${count(v, "skill competition", "skill competitions")} a quarter` : null),
  "recruit.analytics": (v) => (v ? "Hiring analytics" : null),
  "api.access": (v) => (v ? "API and ATS export" : null),
  "hire_fee.waived": (v) => (v ? "No hiring fee" : null),
  "org.sso": (v) => (v ? "Single sign-on and annual invoicing" : null),
  // Universities
  "uni.dashboard": (v) =>
    v === "summary" ? "Summary dashboard" : v === "full" ? "Full dashboard" : v === "accreditation" ? "Full dashboard with accreditation reports" : null,
  "uni.exports": (v) => (v ? "CSV and PDF exports" : null),
  "uni.student_records": (v) => (v ? "Individual student records, every view logged" : null),
  "uni.skills_gap": (v) => (v ? "Skills-gap reports" : null),
  "uni.outcomes": (v) => (v ? "Graduate outcomes" : null),
  "uni.faculty_panel": (v) => (v ? "Faculty engagement panel" : null),
  "uni.sponsored_pro": (v) => (v === "final_year" ? "Student Pro for final-year students" : v === "all" ? "Student Pro for every student" : null),
  "uni.job_fairs": (v) => (typeof v === "number" && v > 0 ? `${count(v, "digital job fair", "digital job fairs")} a year` : null),
  "uni.hackathons": (v) => (typeof v === "number" && v > 0 ? `${count(v, "hackathon", "hackathons")} a year` : null),
  "uni.admin_seats": (v) => (typeof v === "number" && v > 0 ? count(v, "admin seat", "admin seats") : null),
};

/** Order follows the registry above, not the jsonb key order. */
export function planLines(grants: Record<string, unknown>): string[] {
  return Object.entries(LINES)
    .map(([key, line]) => (key in grants ? line(grants[key]) : null))
    .filter((l): l is string => l !== null);
}

export const pkr = (n: number) => `PKR ${n.toLocaleString("en-PK")}`;
