import type { Database } from "@/types/database";

/** Venture wording shared by server pages and client forms (PRD 5.15, 5.28). */

type Enums = Database["public"]["Enums"];

export const STATUS_LABELS: Record<Enums["venture_status"], string> = {
  recruiting: "Recruiting",
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Abandoned",
};

export const TYPE_LABELS: Record<Enums["venture_type"], { one: string; many: string }> = {
  project: { one: "Project", many: "Projects" },
  startup: { one: "Startup", many: "Startups" },
};

export const VISIBILITY_OPTIONS: { value: Enums["venture_visibility"]; label: string; description: string }[] = [
  { value: "public", label: "Public", description: "Students at every university can see it and apply." },
  { value: "university", label: "My university only", description: "Only students at your university can see it and apply." },
  { value: "unlisted", label: "Unlisted", description: "Only people with the link can see it. They join by your invite." },
];

export const STAGE_OPTIONS: { value: Enums["venture_stage"]; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "prototype", label: "Prototype" },
  { value: "launched", label: "Launched" },
  { value: "revenue", label: "Earning revenue" },
];

export const TEAM_ROLE_LABELS: Record<Enums["venture_team_role"], string> = {
  lead: "Lead",
  developer: "Developer",
  designer: "Designer",
  researcher: "Researcher",
  other: "Member",
};

export const MAX_MEMBERS = 6;
