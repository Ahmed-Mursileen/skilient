/**
 * Code checks (PRD 5.5, 5.21), shared by server pages and client components: the three fixed
 * questions and the four rubric parts. The database re-checks every limit.
 */
export const ANSWER_MAX = 2000;

export type AnswerKey = "what" | "why" | "change";
export const QUESTIONS: { key: AnswerKey; label: string }[] = [
  { key: "what", label: "What does this code do?" },
  { key: "why", label: "Why is it written this way? Point to one choice and what the alternative was." },
  { key: "change", label: "How would you change it for the requirement above?" },
];

export type RubricKey = "behaviour" | "design" | "change" | "accuracy";
export const RUBRIC: { key: RubricKey; label: string; hint: string }[] = [
  { key: "behaviour", label: "Explains the behaviour", hint: "Says correctly what the code does." },
  { key: "design", label: "Justifies the design", hint: "Gives a real reason for how it's written." },
  { key: "change", label: "Handles the change", hint: "The change would work and fits the code." },
  { key: "accuracy", label: "Accuracy", hint: "No wrong claims about the code or the language." },
];

export type CodeCheckStatus = "preparing" | "ready" | "in_progress" | "submitted" | "passed" | "failed" | "unavailable" | "expired";

export const STATUS_LABELS: Record<CodeCheckStatus, string> = {
  preparing: "Picking your code",
  ready: "Ready to start",
  in_progress: "In progress",
  submitted: "Waiting for a grade",
  passed: "Passed",
  failed: "Not passed",
  unavailable: "Couldn't be prepared",
  expired: "Expired",
};
