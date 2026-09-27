import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { LookingFor, Visibility } from "@/lib/profile/options";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { ProfileSettingsForm } from "./profile-settings-form";

export const metadata: Metadata = { title: "Edit profile" };

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("profiles")
    .select("full_name, username, bio, department, programme, graduation_year, campus, visibility, recruiter_visible, looking_for, avatar_path, cover_path")
    .eq("user_id", user.id)
    .single();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <Link href="/settings" className="text-body-sm text-text-secondary underline underline-offset-4">
          Settings
        </Link>
        <h1 className="mt-1 font-display text-h1">Edit profile</h1>
      </div>
      {error || !p ? (
        <p role="alert" className="text-body text-text-error">
          We couldn&apos;t load your profile. Refresh to try again.
        </p>
      ) : (
        <ProfileSettingsForm
          universityName={user.universityName}
          avatarUrl={publicImageUrl("avatars", p.avatar_path)}
          coverUrl={publicImageUrl("covers", p.cover_path)}
          values={{
            fullName: p.full_name,
            username: p.username,
            bio: p.bio,
            department: p.department,
            programme: p.programme,
            graduationYear: p.graduation_year,
            campus: p.campus,
            visibility: p.visibility as Visibility,
            recruiterVisible: p.recruiter_visible,
            lookingFor: p.looking_for as LookingFor[],
          }}
        />
      )}
    </main>
  );
}
