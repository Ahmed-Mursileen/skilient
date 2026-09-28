import { GithubLogo, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Button } from "@/components/ui";

/** Cover + identity header for /profile/[username] (screen spec 3.3). */
export function ProfileHeader({
  fullName,
  username,
  universityName,
  department,
  graduationYear,
  avatarUrl,
  coverUrl,
  isOwner,
  githubLogin,
  actions,
  note,
}: {
  fullName: string;
  username: string;
  universityName?: string | null;
  department: string | null;
  graduationYear: number | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  isOwner?: boolean;
  /** The linked GitHub account (readable wherever the full profile is). */
  githubLogin?: string | null;
  /** Friend and block controls on someone else's profile. */
  actions?: ReactNode;
  note?: ReactNode;
}) {
  const meta = [department, graduationYear ? `Class of ${graduationYear}` : null].filter(Boolean).join(" · ");
  return (
    <header>
      <div className="aspect-[3/1] w-full overflow-hidden rounded-lg border border-border-default bg-bg-subtle sm:aspect-[4/1]">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user image from our public bucket, already sized
          <img src={coverUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="-mt-10 flex flex-wrap items-end justify-between gap-4 px-2 sm:-mt-12 sm:px-4">
        <Avatar name={fullName} src={avatarUrl} size="lg" className="size-20 border-4 border-bg-page text-h3 sm:size-24" />
        {isOwner ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings/profile">
              <PencilSimple aria-hidden weight="bold" className="size-4" />
              Edit profile
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="mt-3 px-2 sm:px-4">
        <h1 className="font-display text-h1 break-words">{fullName}</h1>
        <p className="text-body text-text-secondary">@{username}</p>
        {universityName ? <p className="mt-2 text-body font-semibold">{universityName}</p> : null}
        {meta ? <p className="text-body text-text-secondary">{meta}</p> : null}
        {githubLogin ? (
          <a
            href={`https://github.com/${githubLogin}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            <GithubLogo aria-hidden weight="bold" className="size-4" />
            <span className="font-mono">{githubLogin}</span>
            <span className="sr-only">{" on GitHub (opens GitHub)"}</span>
          </a>
        ) : null}
        {actions ? <div className="mt-4">{actions}</div> : null}
        {note ? <div className="mt-4">{note}</div> : null}
      </div>
    </header>
  );
}
