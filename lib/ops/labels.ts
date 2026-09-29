/** Labels for moderation targets, reasons and outcomes (/ops). */
export const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  other: "Other",
};

export const TARGET_LABELS: Record<string, string> = {
  post: "Post",
  comment: "Comment",
  message: "Chat message",
  profile: "Profile",
  venture: "Venture",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  dismissed: "Dismissed",
  removed: "Removed",
  warned: "Owner warned",
};

/** GitHub review flags (PRD 5.5 anti-gaming), as trust reviewers see them. */
export const FLAG_LABELS: Record<string, string> = {
  burst: "Burst of commits",
  backdating: "Backdated commits",
  cross_account_duplicate: "Same files as another student",
};
