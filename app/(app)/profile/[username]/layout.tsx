import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileFriendActions } from "@/components/friends/profile-friend-actions";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { EmptyState } from "@/components/ui";
import { getFriendshipState } from "@/lib/data/friends";
import { getProfile } from "@/lib/data/profiles";
import { getGithubLogin } from "@/lib/data/skills";

export async function generateMetadata({ params }: LayoutProps<"/profile/[username]">): Promise<Metadata> {
  const { username } = await params;
  const lookup = await getProfile(username);
  const name = lookup.kind === "full" ? lookup.profile.fullName : lookup.kind === "card" ? lookup.card.fullName : "Profile";
  return { title: name, robots: { index: false, follow: false } };
}

/**
 * Signed-in only (proxy.ts). What you see is decided by RLS alone (PRD 5.4): the full
 * profile, or the restricted card (name, department, batch) when its visibility excludes you.
 */
export default async function ProfileLayout({ params, children }: LayoutProps<"/profile/[username]">) {
  const { username } = await params;
  const lookup = await getProfile(username);

  if (lookup.kind === "not-found") notFound();
  if (lookup.kind === "rate-limited") {
    return (
      <main className="mx-auto max-w-[680px] px-[var(--page-gutter)] py-10">
        <EmptyState
          title="That's a lot of profiles for one day"
          description="To protect students from scraping, you can open 300 profiles a day. Try again tomorrow."
        />
      </main>
    );
  }
  if (lookup.kind === "card") {
    const { card } = lookup;
    const relation = await getFriendshipState(card.username);
    return (
      <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
        <ProfileHeader
          fullName={card.fullName}
          username={card.username}
          department={card.department}
          graduationYear={card.graduationYear}
          actions={relationActions(card.username, card.fullName, relation)}
          note={
            <p className="flex items-start gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-body-sm text-text-secondary" data-testid="restricted-card">
              <LockSimple aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
              {card.fullName} shares their full profile with their university or friends only.
            </p>
          }
        />
      </main>
    );
  }

  const { profile } = lookup;
  const [githubLogin, relation] = await Promise.all([
    getGithubLogin(profile.userId),
    profile.isOwner ? null : getFriendshipState(profile.username),
  ]);
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <ProfileHeader
        fullName={profile.fullName}
        username={profile.username}
        universityName={profile.universityName}
        department={profile.department}
        graduationYear={profile.graduationYear}
        avatarUrl={profile.avatarUrl}
        coverUrl={profile.coverUrl}
        isOwner={profile.isOwner}
        githubLogin={githubLogin}
        actions={relationActions(profile.username, profile.fullName, relation)}
      />
      <ProfileTabs username={profile.username} />
      <div>{children}</div>
    </main>
  );
}

function relationActions(
  username: string,
  fullName: string,
  relation: Awaited<ReturnType<typeof getFriendshipState>>,
) {
  if (!relation || relation.state === "self") return null;
  return <ProfileFriendActions username={username} fullName={fullName} state={relation.state} requestId={relation.requestId} />;
}
