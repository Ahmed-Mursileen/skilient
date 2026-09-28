import "server-only";

import { cache } from "react";
import { CATEGORY_ORDER, type SkillCategory, type SkillStats } from "@/lib/skills/levels";
import { createClient } from "@/lib/supabase/server";

export interface ProfileSkill {
  id: string;
  name: string;
  category: SkillCategory;
  level: 1 | 2 | 3 | 4;
  lastUsedAt: string | null;
  /** The owner's own counts; absent for everyone else (PRD 6: others see the level). */
  stats?: SkillStats & { repos: number };
}

const byStrength = (a: ProfileSkill, b: ProfileSkill) =>
  b.level - a.level || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.name.localeCompare(b.name);

/**
 * A profile's skills at L1+, strongest first. RLS decides who reads them (the same rule
 * as the full profile); the owner also gets the counts behind each level via my_skills().
 */
export const getProfileSkills = cache(async (userId: string, isOwner: boolean): Promise<ProfileSkill[]> => {
  const supabase = await createClient();
  if (isOwner) {
    const { data, error } = await supabase.rpc("my_skills");
    if (error) throw new Error(`my skills: ${error.code}`);
    if (!data?.length) return [];
    const { data: names, error: namesError } = await supabase
      .from("skills")
      .select("id, name, category")
      .in("id", data.map((s) => s.skill_id));
    if (namesError) throw new Error(`skill names: ${namesError.code}`);
    const meta = new Map((names ?? []).map((n) => [n.id, n]));
    return data
      .filter((s) => meta.has(s.skill_id))
      .map((s) => ({
        id: s.skill_id,
        name: meta.get(s.skill_id)!.name,
        category: meta.get(s.skill_id)!.category,
        level: s.level as ProfileSkill["level"],
        lastUsedAt: s.last_used_at,
        stats: { activeDays: s.active_days, lines: s.lines, hits: s.hits, repos: s.repos },
      }))
      .sort(byStrength);
  }

  const { data, error } = await supabase
    .from("user_skills")
    .select("skill_id, level, last_used_at, skills!inner(name, category)")
    .eq("user_id", userId)
    .gte("level", 1);
  if (error) throw new Error(`profile skills: ${error.code}`);
  return (data ?? [])
    .map((s) => ({
      id: s.skill_id,
      name: s.skills.name,
      category: s.skills.category,
      level: s.level as ProfileSkill["level"],
      lastUsedAt: s.last_used_at,
    }))
    .sort(byStrength);
});

export function groupByCategory(skills: ProfileSkill[]): { category: SkillCategory; skills: ProfileSkill[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, skills: skills.filter((s) => s.category === category) })).filter(
    (g) => g.skills.length,
  );
}

/** The owner's commits waiting for a trust reviewer ("some activity is being reviewed"). */
export async function getHeldCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("github_commits")
    .select("sha", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "held");
  if (error) throw new Error(`held commits: ${error.code}`);
  return count ?? 0;
}

/** The GitHub login shown on a profile (readable wherever the full profile is). */
export const getGithubLogin = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("github_accounts").select("login").eq("user_id", userId).maybeSingle();
  return data?.login ?? null;
});

/** The live taxonomy, for skill pickers (venture skills and roles). */
export const listTaxonomy = cache(async (): Promise<{ id: string; name: string; category: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("skills").select("id, name, category").is("retired_at", null).order("name");
  if (error) throw new Error(`taxonomy: ${error.code}`);
  return data ?? [];
});
