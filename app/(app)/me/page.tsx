import { CaretRight, ChartLineUp, Certificate, ChatCircleDots, FileText, Gear, IdentificationCard, Medal, Sparkle, Stack, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Avatar } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Me" };

/** /me (PRD 5.25): the Me area's home, and on a phone the menu for everything that isn't a tab. */
export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/me");
  const links: { href: string; title: string; description: string; icon: typeof Gear }[] = [
    { href: user.username ? `/profile/${user.username}` : "/settings/profile", title: "Profile", description: "How others see you. Edit your bio, photo and looking-for line.", icon: IdentificationCard },
    { href: "/me/skills", title: "Skills", description: "Every skill with its level, the evidence and how to reach the next level.", icon: Sparkle },
    { href: "/me/work", title: "My work", description: "Ventures, contributions, reviews, endorsements and credentials.", icon: Stack },
    { href: "/me/cv", title: "CV", description: "Your signed, verifiable CV.", icon: FileText },
    { href: "/me/score", title: "Score", description: "Exactly how your rank is calculated.", icon: ChartLineUp },
    { href: "/me/credentials", title: "Credentials", description: "Certificates you have added and their review status.", icon: Certificate },
    { href: "/leaderboard", title: "Leaderboard", description: "Where you stand at your university and overall.", icon: Medal },
    { href: "/friends", title: "Friends", description: "Your friends and their requests.", icon: UsersThree },
    { href: "/feedback", title: "Feedback", description: "Tell us what is confusing or broken.", icon: ChatCircleDots },
    { href: "/settings", title: "Settings", description: "Account, notifications, privacy, GitHub and deleting your account.", icon: Gear },
  ];
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div className="flex items-center gap-4">
        <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="font-display text-h1 break-words">{user.fullName}</h1>
          <p className="text-body-sm text-text-secondary">{[user.username ? `@${user.username}` : null, user.universityName].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        {links.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href as Route} className="flex items-center gap-4 px-5 py-4 hover:bg-bg-subtle">
              <Icon aria-hidden weight="bold" className="size-6 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-h4">{title}</span>
                <span className="block text-body-sm text-text-secondary">{description}</span>
              </span>
              <CaretRight aria-hidden weight="bold" className="size-4 shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="md:hidden">
        <SignOutButton variant="secondary" className="w-full" />
      </div>
    </main>
  );
}
