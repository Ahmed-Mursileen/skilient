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
    rule: "A pull request using it was merged or approved by someone else in a repository they don't own, or a teammate confirmed a contribution tagged with it.",
  },
  4: {
    name: "Demonstrated",
    own: "Vouched for",
    other: "Vouched for",
    rule: "Two different teammates vouched for it, each tied to a contribution that shows it.",
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
    return "To reach L3, get a pull request that uses it merged or approved by someone else in a repository you don't own, or tag a venture contribution with it and have a teammate confirm it.";
  }
  if (level === 3) {
    return "To reach L4, have two different teammates endorse it, each tying the endorsement to one of your contributions that shows it.";
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

/**
 * AI-assisted work (decisions 2026-10-03): commits an AI coding agent wrote in a pull request the
 * student opened and merged count like their own, and a skill mostly written that way carries this
 * label until a passed code check removes it.
 */
export const AI_ASSISTED = {
  label: "AI-assisted",
  own: "Most of the code behind this skill was written with an AI coding agent in pull requests you opened and merged. Pass a code check to remove this label.",
  other:
    "Most of the code behind this skill was written with an AI coding agent in pull requests they opened and merged. A passed code check would remove this label.",
};

/** The agent's name for an identity stored on a commit (display only; the list lives in platform_config). */
export function agentName(identity: string | null | undefined): string {
  const id = (identity ?? "").toLowerCase();
  if (id.includes("anthropic") || id.startsWith("claude")) return "Claude";
  if (id.includes("copilot")) return "GitHub Copilot";
  if (id.includes("devin")) return "Devin";
  if (id.includes("cursor")) return "Cursor";
  if (id.includes("codex") || id.includes("openai")) return "Codex";
  return "an AI agent";
}
