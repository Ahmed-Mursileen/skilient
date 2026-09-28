import type { Database } from "@/types/database";

/**
 * Evidence levels as students see them (PRD 5.5 "Evidence levels"). Shared by server
 * pages and the skill drawer, so it holds data only: no icons, no server imports.
 */

export type SkillCategory = Database["public"]["Enums"]["skill_category"];
export type ShownLevel = 1 | 2 | 3 | 4;

export const CATEGORY_ORDER: SkillCategory[] = ["language", "framework", "library", "tool", "platform", "practice"];

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
  language: "Languages",
  framework: "Frameworks",
  library: "Libraries",
  tool: "Tools",
  platform: "Platforms",
  practice: "Practices",
};

/** One skill's category, in a sentence ("Framework · L2"). */
export const CATEGORY_NAMES: Record<SkillCategory, string> = {
  language: "Language",
  framework: "Framework",
  library: "Library",
  tool: "Tool",
  platform: "Platform",
  practice: "Practice",
};

export const LEVELS: Record<ShownLevel, { name: string; own: string; other: string; rule: string }> = {
  1: {
    name: "Present",
    own: "Found in your repos",
    other: "Found in their repos",
    rule: "Detected in a repository they own or have committed to.",
  },
  2: {
    name: "Authored",
    own: "You've written this",
    other: "Written by them",
    rule: "Their own commits on 3 or more separate days, with 150+ lines of code (languages) or 3+ imports (frameworks, libraries, tools).",
  },
  3: {
    name: "Corroborated",
    own: "Accepted by others",
    other: "Accepted by others",
    rule: "A pull request using it was merged by someone else, or a teammate confirmed the contribution.",
  },
  4: {
    name: "Demonstrated",
    own: "Vouched for",
    other: "Vouched for",
    rule: "A teammate or teacher vouched for specific work, or they passed a code check.",
  },
};

/** L2 thresholds (mirrors private.recompute_user_skills). */
export const L2_DAYS = 3;
export const L2_LINES = 150;
export const L2_HITS = 3;

export interface SkillStats {
  activeDays: number;
  lines: number;
  hits: number;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "How to reach the next level" for the owner, from their own counts. Null at the top. */
export function nextStep(level: number, category: SkillCategory, stats: SkillStats): string | null {
  if (level <= 1) {
    const needs: string[] = [];
    const days = Math.max(0, L2_DAYS - stats.activeDays);
    if (days) needs.push(`commit it on ${plural(days, "more day")} (${stats.activeDays} of ${L2_DAYS})`);
    if (category === "language") {
      const lines = Math.max(0, L2_LINES - stats.lines);
      if (lines) needs.push(`write ${plural(lines, "more line")} of code (${stats.lines} of ${L2_LINES})`);
    } else {
      const hits = Math.max(0, L2_HITS - stats.hits);
      const what = category === "framework" || category === "library" ? "import or add it" : "use it";
      if (hits) needs.push(`${what} in ${plural(hits, "more commit")} (${stats.hits} of ${L2_HITS})`);
    }
    return needs.length
      ? `To reach L2, ${needs.join(" and ")}. Held commits count once they're reviewed.`
      : "You've met L2's rules; it updates at your next sync.";
  }
  if (level === 2) {
    return "To reach L3, get a pull request that uses it merged in someone else's repository, or have a teammate confirm a Skilient contribution.";
  }
  if (level === 3) {
    return "To reach L4, have a teammate or teacher vouch for a specific piece of your work, or pass a code check.";
  }
  return null;
}

/** Why a commit doesn't count, in the student's words. */
export const EXCLUSION_LABELS: Record<string, string> = {
  merge: "Merge commit",
  too_many_files: "Touches more than 100 files",
  rename_only: "Only renames files",
  formatting_only: "Only reformats code",
  bulk_import: "First commit importing a whole project (counts as present only)",
  rewritten: "Removed from the history",
  review: "Not counted after review",
};

export const DETECTOR_LABELS: Record<string, string> = {
  lines: "code",
  file: "file",
  path: "config",
  manifest: "added as a dependency",
  import: "imported",
};
