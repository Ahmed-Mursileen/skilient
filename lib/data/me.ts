import "server-only";

import { dayLabel } from "@/lib/format/time";
import { skillNames } from "@/lib/data/ventures";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads behind /me/skills and /me/work (PRD 5.25): what the student has claimed but not yet
 * proved, and the work they did and the endorsements they gave. Existing tables only.
 */

export interface ClaimedSkill {
  id: string;
  name: string;
}

/** L0: skills the student named themselves. They carry no points and only the owner sees them. */
export async function getClaimedSkills(userId: string): Promise<ClaimedSkill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_skills").select("skill_id, skills!inner(name)").eq("user_id", userId).eq("level", 0);
  if (error) throw new Error(`claimed skills: ${error.code}`);
  return (data ?? []).map((s) => ({ id: s.skill_id, name: s.skills.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface MyContribution {
  id: string;
  ventureId: string;
  ventureTitle: string;
  kind: string;
  description: string;
  peerVerified: boolean;
  fromGithub: boolean;
  confirmations: number;
  dateLabel: string;
}

export async function getMyContributions(userId: string): Promise<MyContribution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions_with_status")
    .select("id, venture_id, kind, description, peer_verified, source, confirmations, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`my contributions: ${error.code}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.venture_id).filter((v): v is string => !!v))];
  const { data: ventures } = ids.length ? await supabase.from("ventures").select("id, title").in("id", ids) : { data: [] };
  const titles = new Map((ventures ?? []).map((v) => [v.id, v.title]));
  return rows.map((r) => ({
    id: r.id ?? "",
    ventureId: r.venture_id ?? "",
    ventureTitle: titles.get(r.venture_id ?? "") ?? "A venture",
    kind: r.kind ?? "other",
    description: r.description ?? "",
    peerVerified: r.peer_verified === true,
    fromGithub: r.source === "github",
    confirmations: r.confirmations ?? 0,
    dateLabel: r.created_at ? dayLabel(r.created_at) : "",
  }));
}

export interface GivenEndorsement {
  id: string;
  endorseeName: string;
  endorseeUsername: string | null;
  skillName: string;
  ventureTitle: string | null;
  dateLabel: string;
}

export async function getEndorsementsGiven(userId: string): Promise<GivenEndorsement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("endorsements")
    .select("id, endorsee_id, skill_id, venture_id, created_at")
    .eq("endorser_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`endorsements given: ${error.code}`);
  const rows = data ?? [];
  if (!rows.length) return [];
  const people = [...new Set(rows.map((r) => r.endorsee_id))];
  const ventureIds = [...new Set(rows.map((r) => r.venture_id))];
  const [{ data: profiles }, { data: ventures }, skills] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, username").in("user_id", people),
    supabase.from("ventures").select("id, title").in("id", ventureIds),
    skillNames(rows.map((r) => r.skill_id)),
  ]);
  const who = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const titles = new Map((ventures ?? []).map((v) => [v.id, v.title]));
  return rows.map((r) => ({
    id: r.id,
    endorseeName: who.get(r.endorsee_id)?.full_name ?? "A teammate",
    endorseeUsername: who.get(r.endorsee_id)?.username ?? null,
    skillName: skills.get(r.skill_id) ?? r.skill_id,
    ventureTitle: titles.get(r.venture_id) ?? null,
    dateLabel: dayLabel(r.created_at),
  }));
}
