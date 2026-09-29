import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LeaderboardToggle } from "@/components/ranking/leaderboard-toggle";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Privacy" };

/** /settings/privacy (PRD 5.17): leaderboards opt-out. Profile visibility lives in Profile. */
export default async function PrivacySettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/settings/privacy");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("leaderboard_opt_out").eq("user_id", user.id).maybeSingle();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">Privacy</h1>
      <div className="rounded-lg border border-border-default bg-bg-surface">
        <LeaderboardToggle initialOptOut={data?.leaderboard_opt_out ?? false} />
      </div>
      <p className="text-body-sm text-text-secondary">
        Who can see your profile is in{" "}
        <Link href="/settings/profile" className="underline underline-offset-4">
          Profile settings
        </Link>
        .
      </p>
    </main>
  );
}
