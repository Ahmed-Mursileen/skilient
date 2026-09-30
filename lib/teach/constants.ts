/** Client-safe teacher-portal constants (lib/data/* is server-only). PRD 5.21. */

export const REVIEW_RUBRIC = [
  { key: "scope", label: "Problem and scope", hint: "Was the problem clear and the scope realistic?" },
  { key: "technical", label: "Technical quality", hint: "Is the work sound, tested and maintainable?" },
  { key: "collaboration", label: "Collaboration", hint: "Did the team share the work and communicate?" },
  { key: "documentation", label: "Documentation", hint: "Could someone else understand and run it?" },
  { key: "outcome", label: "Outcome", hint: "Did it deliver what it set out to?" },
] as const;
export type ReviewKey = (typeof REVIEW_RUBRIC)[number]["key"];

export const SCORE_LABELS: Record<number, string> = { 1: "Weak", 2: "Fair", 3: "Good", 4: "Strong", 5: "Excellent" };

export const DIFFICULTIES = ["intro", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { intro: "Intro", intermediate: "Intermediate", advanced: "Advanced" };

export const AUDIENCES = ["university", "global"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Record<Audience, string> = { university: "My university", global: "Every university" };

export type TeacherStatus = "pending" | "approved" | "revoked";
export type SupervisionStatus = "invited" | "active" | "ended";
export type ReviewRequestStatus = "open" | "submitted" | "declined" | "expired" | "cancelled";

export const REVIEW_STATUS_LABELS: Record<ReviewRequestStatus, string> = {
  open: "Waiting for the review",
  submitted: "Reviewed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Withdrawn",
};

/** Launch values mirrored from platform_config `teacher.limits` for copy (the database enforces them). */
export const TEACHER_LIMITS = { supervisions: 15, endorsementsPerMonth: 40, reviewDays: 14, gradingHours: 72, teacherHours: 48 } as const;
