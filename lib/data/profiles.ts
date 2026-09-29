import "server-only";

import { cache } from "react";
import type { LookingFor, Visibility } from "@/lib/profile/options";
import { rateLimit } from "@/lib/security/rate-limit";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export interface ProfileView {
  userId: string;
  username: string;
  fullName: string;
  universityName: string | null;
  department: string | null;
  programme: string | null;
  graduationYear: number | null;
  campus: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  visibility: Visibility;
  lookingFor: LookingFor[];
  isOwner: boolean;
}

export interface ProfileCard {
  userId: string;
  username: string;
  fullName: string;
  department: string | null;
  graduationYear: number | null;
}

export type ProfileLookup =
  | { kind: "full"; profile: ProfileView }
  | { kind: "card"; card: ProfileCard }
  | { kind: "not-found" }
  | { kind: "rate-limited" };

/** PRD 10 anti-scraping: a student may open 300 other profiles a day. */
const DAILY_PROFILE_VIEWS = 300;

/**
 * PRD 5.4 read path: select from `profiles` under RLS (profiles_select_visible decides);
 * if no row comes back but the restricted card exists, return only the card. Exact
 * username lookups only. Cached per request so the layout and tabs share one read.
 */
export const getProfile = cache(async (rawUsername: string): Promise<ProfileLookup> => {
  const username = rawUsername.toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return { kind: "not-found" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-found" };

  const { data: row } = await supabase
    .from("profiles")
    .select(
      "user_id, username, full_name, department, programme, graduation_year, campus, bio, avatar_path, cover_path, visibility, looking_for, universities(name)",
    )
    .eq("username", username)
    .maybeSingle();

  const isOwner = row?.user_id === user.id;
  if (!isOwner && !(await rateLimit(supabase, "profile_view", user.id, DAILY_PROFILE_VIEWS, 86_400))) {
    return { kind: "rate-limited" };
  }

  if (row?.username) {
    return {
      kind: "full",
      profile: {
        userId: row.user_id,
        username: row.username,
        fullName: row.full_name,
        universityName: row.universities?.name ?? null,
        department: row.department,
        programme: row.programme,
        graduationYear: row.graduation_year,
        campus: row.campus,
        bio: row.bio,
        avatarUrl: publicImageUrl("avatars", row.avatar_path),
        coverUrl: publicImageUrl("covers", row.cover_path),
        visibility: row.visibility,
        lookingFor: row.looking_for,
        isOwner,
      },
    };
  }

  const { data: cards } = await supabase.rpc("get_profile_card", { p_username: username });
  const card = cards?.[0];
  if (card?.username) {
    return {
      kind: "card",
      card: {
        userId: card.user_id,
        username: card.username,
        fullName: card.full_name,
        department: card.department,
        graduationYear: card.graduation_year,
      },
    };
  }
  return { kind: "not-found" };
});

export interface Classmate {
  username: string;
  fullName: string;
  department: string | null;
  graduationYear: number | null;
  avatarUrl: string | null;
}

/** Onboarding step 6: people at your university in your department and batch (RLS-visible only). */
export async function getClassmates(limit = 12): Promise<Classmate[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase
    .from("profiles")
    .select("university_id, department, graduation_year")
    .eq("user_id", user.id)
    .single();
  if (!me?.university_id || !me.department) return [];
  let query = supabase
    .from("profiles")
    .select("username, full_name, department, graduation_year, avatar_path")
    .eq("university_id", me.university_id)
    .eq("department", me.department)
    .eq("onboarding_complete", true)
    .neq("user_id", user.id)
    .not("username", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (me.graduation_year) query = query.eq("graduation_year", me.graduation_year);
  const { data } = await query;
  return (data ?? []).map((p) => ({
    username: p.username as string,
    fullName: p.full_name,
    department: p.department,
    graduationYear: p.graduation_year,
    avatarUrl: publicImageUrl("avatars", p.avatar_path),
  }));
}
