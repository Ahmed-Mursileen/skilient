import { GithubLogo, LockSimple, Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeldNotice } from "@/components/skills/held-notice";
import { SkillList } from "@/components/skills/skill-list";
import { Button, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGithubOverview } from "@/lib/data/github";
import { getClaimedSkills } from "@/lib/data/me";
import { getHeldCount, getProfileSkills } from "@/lib/data/skills";

export const metadata: Metadata = { title: "Your skills" };

/**
 * /me/skills (PRD 5.25, screen spec "My skills"): every skill grouped by category with its
 * level; each opens the drawer with the evidence and how to reach the next level. Skills you
 * named yourself (L0) sit below, private and worth no points until your work proves them.
 */
export default async function MySkillsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/me/skills");
  const [skills, claimed, { account, sync }, held] = await Promise.all([
    getProfileSkills(user.id, true),
    getClaimedSkills(user.id),
    getGithubOverview(user.id, false),
    getHeldCount(user.id),
  ]);
  const syncing = sync?.status === "queued" || sync?.status === "running";
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Your skills</h1>
        <p className="mt-1 text-body text-text-secondary">
          Levels come from your own work, never from what you say. Tap a skill to see its evidence and what the next level needs.
        </p>
      </div>

      {!account ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border-default bg-bg-surface px-4 py-3 text-body-sm" data-testid="github-reminder">
          <GithubLogo aria-hidden weight="bold" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">You haven&apos;t connected GitHub, so no skills can be detected from your code.</span>
          <Link href="/settings/github" className="font-semibold underline underline-offset-4">
            Connect GitHub
          </Link>
        </p>
      ) : null}
      {held ? <HeldNotice count={held} /> : null}

      {skills.length ? (
        <SkillList skills={skills} isOwner ownerName={firstName} />
      ) : (
        <EmptyState
          icon={<Sparkle aria-hidden className="size-8" />}
          title={syncing ? "Reading your repositories" : "No verified skills yet"}
          description={
            syncing
              ? "Your first skills usually appear within a few minutes. You can leave this page."
              : account
                ? "Skills appear once your commits, merged pull requests or a teammate's confirmation show them. Log a contribution on a venture to start."
                : "Connect GitHub and Skilient reads your own commits to find your skills and their levels. Nobody sees your code."
          }
          action={
            <Button asChild variant="secondary">
              <Link href={account ? "/ventures" : "/settings/github"}>{account ? "Find a venture" : "Connect GitHub"}</Link>
            </Button>
          }
        />
      )}

      {claimed.length ? (
        <section aria-labelledby="claimed-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="claimed-skills">
          <h2 id="claimed-h" className="flex items-center gap-2 text-h4">
            <LockSimple aria-hidden weight="bold" className="size-4" /> Claimed, not yet proved
          </h2>
          <p className="text-body-sm text-text-secondary">Only you see these. They earn no points until your work verifies them.</p>
          <ul className="flex flex-wrap gap-2">
            {claimed.map((s) => (
              <li key={s.id} className="rounded-full border border-dashed border-border-strong px-3 py-1 text-body-sm">
                {s.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
