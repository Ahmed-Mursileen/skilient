import "server-only";

import { cache } from "react";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { skillNames, type VentureRow, type VentureType } from "@/lib/data/ventures";

/**
 * Explore (PRD 5.10). Both searches run in SQL: blocks, visibility, the 2-character
 * minimum and the rate limit are applied there; 20 results a page.
 */

export const EXPLORE_PAGE = 20;

export type Friendship = "friends" | "request_sent" | "request_received" | "none";

export interface PersonResult {
  userId: string;
  username: string;
  name: string;
  department: string | null;
  batch: number | null;
  university: string | null;
  avatarUrl: string | null;
  skills: string[];
  friendship: Friendship;
}

export interface ExploreFilters {
  q: string;
  department: string | null;
  skill: string | null;
  university: string | null;
  from: number;
}

export type SearchOutcome<T> = { ok: true; rows: T[] } | { ok: false; reason: "rate_limited" };

export async function searchPeople(f: ExploreFilters): Promise<SearchOutcome<PersonResult>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_people", {
    p_q: f.q,
    p_department: f.department ?? undefined,
    p_skill: f.skill ?? undefined,
    p_university: f.university ?? undefined,
    p_offset: f.from,
  });
  if (error?.code === "54000") return { ok: false, reason: "rate_limited" };
  if (error) throw new Error(`search_people failed: ${error.code}`);
  return {
    ok: true,
    rows: (data ?? []).map((p) => ({
      userId: p.user_id,
      username: p.username,
      name: p.full_name,
      department: p.department,
      batch: p.graduation_year,
      university: p.university,
      avatarUrl: publicImageUrl("avatars", p.avatar_path),
      skills: p.skills ?? [],
      friendship: p.friendship as Friendship,
    })),
  };
}

export async function searchVentures(type: VentureType, f: ExploreFilters): Promise<SearchOutcome<VentureRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_ventures", {
    p_q: f.q,
    p_type: type,
    p_skill: f.skill ?? undefined,
    p_university: f.university ?? undefined,
    p_offset: f.from,
  });
  if (error?.code === "54000") return { ok: false, reason: "rate_limited" };
  if (error) throw new Error(`search_ventures failed: ${error.code}`);
  const names = await skillNames((data ?? []).flatMap((v) => v.skill_ids));
  return {
    ok: true,
    rows: (data ?? []).map((v) => ({
      id: v.id,
      type: v.type,
      title: v.title,
      summary: v.summary,
      status: v.status,
      visibility: v.visibility,
      stage: v.stage,
      skills: v.skill_ids.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
      universityName: v.university_name,
      owner: { username: v.owner_username, name: v.owner_name },
      members: v.members,
      teamSize: v.team_size,
      openSlots: v.open_slots,
      createdAt: v.created_at,
    })),
  };
}

/** Universities for the filter. */
export const listUniversities = cache(async (): Promise<{ slug: string; name: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("universities").select("slug, name").order("name");
  if (error) throw new Error(`universities: ${error.code}`);
  return data ?? [];
});
