/**
 * University-portal wording and option lists (PRD 5.23). Client-safe.
 */
export type UniRole = "owner" | "admin" | "career" | "coordinator" | "comms";

export const ADMIN_ROLE_LABELS: Record<UniRole, string> = {
  owner: "Owner",
  admin: "Admin",
  career: "Career office",
  coordinator: "Department coordinator",
  comms: "Communications",
};

export const PLAN_LABELS: Record<string, string> = { free: "Free", basic: "Basic", growth: "Growth", campus: "Campus" };

export const MODULES = [
  { key: "feed", label: "University Feed", help: "Off: your students post to Global only." },
  { key: "events", label: "Events", help: "Off: no university events are listed or created." },
  { key: "ideas", label: "Project ideas", help: "Off: university-only ideas are hidden from your students." },
  { key: "teachers", label: "Teachers directory", help: "Off: the directory leaves your ecosphere page." },
  { key: "leaderboard", label: "University leaderboard", help: "Off: your students see the Global board only. Ranking doesn't change." },
  { key: "job_board", label: "Job board", help: "Off: the job list leaves your ecosphere page." },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];

export const BADGE_ICONS = ["trophy", "medal", "star", "certificate", "lightbulb", "rocket", "code", "users", "flask", "globe"] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

export const EVENT_TYPES = ["talk", "workshop", "hackathon", "competition", "other"] as const;
export const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  talk: "Talk",
  workshop: "Workshop",
  hackathon: "Hackathon",
  competition: "Competition",
  other: "Event",
};

export const DASHBOARD_AREAS = [
  { key: "adoption", label: "Adoption" },
  { key: "activity", label: "Activity" },
  { key: "skills", label: "Skills" },
  { key: "skills_gap", label: "Skills gap" },
  { key: "tiers", label: "Tiers" },
  { key: "outcomes", label: "Outcomes" },
  { key: "faculty", label: "Faculty" },
  { key: "benchmark", label: "Benchmark" },
] as const;
export type DashboardArea = (typeof DASHBOARD_AREAS)[number]["key"];

/** Same topics as private.sensitive_topic: religion, ethnicity, health, politics, income. */
const SENSITIVE =
  /\b(religio|faith|islam|muslim|christian|hindu|sikh|ahmadi|qadiani|shia|sunni|sect|caste|ethnic|race|racial|tribe|tribal|baloch|pashtun|pathan|punjabi|sindhi|muhajir|health|medical|disab|illness|disease|mental|pregnan|politic|party|parties|vote|voting|election|income|salary|salaries|wealth|earning|poverty|zakat)/i;
export function sensitiveTopic(text: string): boolean {
  return SENSITIVE.test(text);
}

/** "fewer than 5" for a suppressed count. */
export function countLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? "fewer than 5" : n.toLocaleString("en-PK");
}
