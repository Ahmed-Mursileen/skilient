"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Avatar } from "@/components/ui";

/** Minimal top bar until the five-area shell (phase 6): home, who you are, settings, sign out. */
export function AppHeader() {
  const user = useCurrentUser();
  // During onboarding and the agreement screen the only way out is signing out.
  const pathname = usePathname();
  const focused = pathname.startsWith("/onboarding") && pathname !== "/onboarding/done" || pathname === "/agreement";
  return (
    <header className="border-b border-border-default bg-bg-surface">
      <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-4 px-[var(--page-gutter)]">
        <Link href="/feed" aria-label="Skilient home" className="rounded-sm">
          <Image src="/brand/skilient-icon.svg" alt="" width={28} height={28} className="size-7 dark:hidden" />
          <Image src="/brand/skilient-icon-white.svg" alt="" width={28} height={28} className="hidden size-7 dark:block" />
        </Link>
        {user && focused ? <SignOutButton variant="ghost" size="sm" icon /> : null}
        {user && !focused ? (
          <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
            <Link
              href={(user.username && user.onboardingComplete ? `/profile/${user.username}` : "/feed") as Route}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-bg-subtle"
            >
              <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
              <span className="hidden max-w-[16ch] truncate text-body-sm font-semibold sm:inline" data-testid="current-user-name">
                {user.fullName}
              </span>
            </Link>
            <Link href="/ventures" className="rounded-md px-2 py-1 text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary">
              Ventures
            </Link>
            <Link href="/requests" className="rounded-md px-2 py-1 text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary">
              Requests
            </Link>
            <Link href="/settings" className="rounded-md px-2 py-1 text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary">
              Settings
            </Link>
            <SignOutButton variant="ghost" size="sm" icon />
          </nav>
        ) : null}
      </div>
    </header>
  );
}
