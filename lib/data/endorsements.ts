import "server-only";

import { dayLabel } from "@/lib/format/time";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Endorsement reads (PRD 5.16). endorsements_for() decides who sees a profile's
 * endorsements and which endorser details show; endorse_options() builds the endorse sheet.
 */

export interface Endorsement {
  id: string;
  endorser: { id: string; name: string; username: string | null; avatarUrl: string | null };
  venture: { id: string; title: string } | null;
  note: string | null;
  hasEvidence: boolean;
  hidden: boolean;
  dateLabel: string;
  /** A teacher's endorsement (weight 1.5, PRD 5.21); formerFaculty once their role was removed. */
  faculty: boolean;
  formerFaculty: boolean;
}

export interface SkillEndorsements {
  skillId: string;
  skillName: string;
  /** Different teammates whose endorsement shows (hidden ones don't count). */
  endorsers: number;
  /** A teacher endorsed this skill: it counts as peer-verified on its own. */
  faculty: boolean;
  items: Endorsement[];
}

export async function getEndorsements(userId: string): Promise<SkillEndorsements[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("endorsements_for", { p_user: userId });
  if (error) throw new Error(`endorsements: ${error.code}`);
  const bySkill = new Map<string, SkillEndorsements>();
  for (const e of data ?? []) {
    const group = bySkill.get(e.skill_id) ?? { skillId: e.skill_id, skillName: e.skill_name, endorsers: 0, faculty: false, items: [] };
    group.items.push({
      id: e.id,
      endorser: {
        id: e.endorser_id,
        name: e.endorser_name,
        username: e.endorser_username,
        avatarUrl: publicImageUrl("avatars", e.endorser_avatar_path),
      },
      venture: e.venture_id && e.venture_title ? { id: e.venture_id, title: e.venture_title } : null,
      note: e.note,
      hasEvidence: e.has_evidence,
      hidden: e.hidden,
      dateLabel: dayLabel(e.created_at),
      faculty: e.endorser_kind === "teacher",
      formerFaculty: e.former_faculty,
    });
    bySkill.set(e.skill_id, group);
  }
  for (const group of bySkill.values()) {
    group.endorsers = new Set(group.items.filter((i) => !i.hidden).map((i) => i.endorser.id)).size;
    group.faculty = group.items.some((i) => i.faculty && !i.hidden);
  }
  return [...bySkill.values()].sort((a, b) => b.endorsers - a.endorsers || a.skillName.localeCompare(b.skillName));
}

type Kind = Database["public"]["Enums"]["contribution_kind"];

export interface EndorseTeammate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  skills: { id: string; name: string; fromVenture: boolean }[];
  given: string[];
  /** Their entries in this venture, each with the skills it shows (evidence must match the skill). */
  evidence: { id: string; description: string; kind: Kind; github: boolean; peerVerified: boolean; skills: string[] }[];
}

export interface EndorseOptions {
  teammates: EndorseTeammate[];
  monthLeft: number;
}

export async function getEndorseOptions(ventureId: string): Promise<EndorseOptions> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("endorse_options", { p_venture: ventureId });
  if (error) throw new Error(`endorse options: ${error.code}`);
  const rows = data ?? [];
  return {
    monthLeft: rows[0]?.month_left ?? 0,
    teammates: rows.map((r) => ({
      userId: r.user_id,
      name: r.full_name,
      avatarUrl: publicImageUrl("avatars", r.avatar_path),
      skills: ((r.skills ?? []) as { id: string; name: string; from_venture: boolean }[]).map((s) => ({
        id: s.id,
        name: s.name,
        fromVenture: s.from_venture,
      })),
      given: r.given ?? [],
      evidence: (
        (r.evidence ?? []) as { id: string; description: string; kind: Kind; source: string; peer_verified: boolean; skills: string[] | null }[]
      ).map((e) => ({
        id: e.id,
        description: e.description,
        kind: e.kind,
        github: e.source === "github",
        peerVerified: e.peer_verified,
        skills: e.skills ?? [],
      })),
    })),
  };
}
