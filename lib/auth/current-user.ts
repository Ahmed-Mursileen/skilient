import "server-only";

import { cache } from "react";
import type { CurrentUser } from "@/lib/auth/current-user-types";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user for this request, verified with the Auth server (getUser(), never
 * getSession()), plus the profile fields the chrome needs. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_path, onboarding_complete, university_id, role, status, universities(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? user.email ?? "",
    username: profile?.username ?? null,
    avatarUrl: publicImageUrl("avatars", profile?.avatar_path),
    universityId: profile?.university_id ?? null,
    universityName: profile?.universities?.name ?? null,
    onboardingComplete: profile?.onboarding_complete ?? false,
    role: profile?.role ?? "student",
    status: profile?.status ?? "active",
  };
});
