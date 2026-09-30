/** Feedback centre constants (PRD 5.27). Client-safe. */
export const FEEDBACK_BUCKET = "feedback";
export const FEEDBACK_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_TYPES = ["bug", "idea", "confusing", "praise"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export const FEEDBACK_STATUSES = ["received", "reviewing", "planned", "shipped", "wont_do"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Something is broken",
  idea: "I have an idea",
  confusing: "Something is confusing",
  praise: "Something works well",
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  received: "Received",
  reviewing: "Reviewing",
  planned: "Planned",
  shipped: "Shipped",
  wont_do: "Won't do",
};

/** The order a submission moves through; "won't do" is a branch, not a step. */
export const STATUS_STEPS: FeedbackStatus[] = ["received", "reviewing", "planned", "shipped"];
