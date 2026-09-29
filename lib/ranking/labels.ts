/**
 * Ranking wording shared by /leaderboard, /me/score and Settings (PRD 5.13, 5.17). Client-safe:
 * no server code here.
 */

export const COMPONENT_INFO = {
  work: { label: "Work", layer: "Proof", max: 1125, hint: "Completed ventures and merged pull requests to other people's repositories." },
  skills: { label: "Verified skills", layer: "Proof", max: 500, hint: "Skills at L2 and above, with a bonus for spanning 3 or more categories." },
  endorsements: { label: "Endorsements", layer: "Proof", max: 375, hint: "Teammates vouching for your skills, weighted by their tier." },
  credentials: { label: "Credentials", layer: "Proof", max: 125, hint: "Certificates approved by Skilient, more for recognised issuers." },
  momentum: { label: "Momentum", layer: "Momentum", max: 375, hint: "Post quality, active weeks and helping your teams. It fades when you're inactive." },
} as const;

export type ComponentKey = keyof typeof COMPONENT_INFO;
export const COMPONENT_KEYS = Object.keys(COMPONENT_INFO) as ComponentKey[];

/** What the next tier still needs, one line each. */
export const REQUIREMENT_LABELS: Record<string, (have: number, need: number) => string> = {
  points: (have, need) => {
    const more = Math.ceil(need - have);
    return `${more} more ${more === 1 ? "point" : "points"} (${have} of ${need})`;
  },
  peer_verified_entries: () => "A contribution a teammate has confirmed",
  active_ventures: (have, need) => `A confirmed contribution in ${need} in-progress or completed ventures (you have ${have})`,
  counting_endorsements: (have, need) => `${need} endorsements that count (you have ${have})`,
  completed_ventures: () => "A completed venture",
  max_level: (_have, need) => `A skill at L${need} or above`,
  top_share: (have, need) => `Be in the top ${need}% of ranked students (you're in the top ${have}%)`,
  teacher_or_hire: () => "A teacher's endorsement or a completed hire (from teachers and recruiters, coming later)",
};

export const SCOPE_LABELS = { university: "My university", global: "Global" } as const;
export type Scope = keyof typeof SCOPE_LABELS;

/** "▲ 3", "▼ 1", "–", or "New" for someone who wasn't on the board a week ago. */
export function weeklyChangeLabel(change: number | null): { text: string; sr: string } {
  if (change === null) return { text: "New", sr: "new this week" };
  if (change === 0) return { text: "–", sr: "no change this week" };
  if (change > 0) return { text: `▲ ${change}`, sr: `up ${change} this week` };
  return { text: `▼ ${-change}`, sr: `down ${-change} this week` };
}

export function points(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
