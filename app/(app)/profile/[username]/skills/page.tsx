import { GithubLogo, Hourglass, Sparkle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { HeldNotice } from "@/components/skills/held-notice";
import { SkillList } from "@/components/skills/skill-list";
import { Button, EmptyState } from "@/components/ui";
import { getGithubOverview } from "@/lib/data/github";
import { getProfile } from "@/lib/data/profiles";
import { getHeldCount, getProfileSkills } from "@/lib/data/skills";

/**
 * Skills tab (PRD 5.4, 5.5): every skill at L1+ with its level, grouped by category; each
 * opens the skill drawer. Others see name and level only; L0 is never shown here.
 */
export default async function ProfileSkillsPage({ params }: PageProps<"/profile/[username]/skills">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  const p = lookup.profile;
  const firstName = p.fullName.split(/\s+/)[0] ?? p.fullName;
  const skills = await getProfileSkills(p.userId, p.isOwner);

  if (!p.isOwner) {
    return skills.length ? (
      <SkillList skills={skills} isOwner={false} ownerName={firstName} />
    ) : (
      <EmptyState
        icon={<Sparkle aria-hidden className="size-8" />}
        title="No verified skills yet"
        description={`${p.fullName}'s skills will show here once their own work proves them.`}
      />
    );
  }

  const [{ account, sync }, held] = await Promise.all([getGithubOverview(p.userId, false), getHeldCount(p.userId)]);
  const syncing = sync?.status === "queued" || sync?.status === "running";

  if (!skills.length) {
    if (!account) {
      return (
        <EmptyState
          icon={<GithubLogo aria-hidden className="size-8" />}
          title="Show what you can do"
          description="Connect GitHub and Skilient reads your own commits to find your skills and their levels. Nobody sees your code."
          action={
            <Button asChild>
              <Link href="/settings/github">Connect GitHub</Link>
            </Button>
          }
        />
      );
    }
    return syncing ? (
      <EmptyState
        icon={<Hourglass aria-hidden className="size-8" />}
        title="Reading your repositories"
        description="Your first skills usually appear within a few minutes. You can leave this page."
      />
    ) : (
      <div className="flex flex-col gap-4">
        {held ? <HeldNotice count={held} /> : null}
        <EmptyState
          icon={<Sparkle aria-hidden className="size-8" />}
          title="No skills found yet"
          description="Skills appear when your own commits in the repositories you shared show them. Check which repositories you shared in Settings, GitHub."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/github">Open GitHub settings</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body-sm text-text-secondary">
        Only the level shows to others. Open a skill to see the commits behind it and how to reach the next level.
        {syncing ? " Still reading your repositories: more may appear." : null}
      </p>
      {held ? <HeldNotice count={held} /> : null}
      <SkillList skills={skills} isOwner ownerName={firstName} />
    </div>
  );
}
