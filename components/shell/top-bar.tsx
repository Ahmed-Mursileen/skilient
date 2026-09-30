"use client";

import { Bell, ChatCircleDots, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { BadgePill } from "@/components/shell/badge-pill";
import { useNavBadges } from "@/components/shell/nav-badges";
import { Tooltip } from "@/components/ui";

const button = "relative inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle hover:text-text-primary";

/** Phone and tablet top bar (screen spec 2): logo, search, feedback and notifications. Desktop has the sidebar. */
export function TopBar() {
  const { notifications } = useNavBadges();
  return (
    <header className="sticky top-0 z-20 border-b border-border-default bg-bg-surface lg:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-[var(--page-gutter)]">
        <Link href="/feed" aria-label="Skilient home" className="shrink-0 rounded-sm">
          <Image src="/brand/skilient-icon.svg" alt="" width={28} height={28} className="size-7 dark:hidden" />
          <Image src="/brand/skilient-icon-white.svg" alt="" width={28} height={28} className="hidden size-7 dark:block" />
        </Link>
        <div className="flex items-center gap-1">
          <Tooltip label="Explore" description="Find people, ventures and skills." placement="bottom">
            <Link href="/explore" aria-label="Explore" data-tour="nav-explore" className={button}>
              <MagnifyingGlass aria-hidden weight="bold" className="size-5" />
            </Link>
          </Tooltip>
          <Tooltip label="Feedback" description="Tell us what is confusing or broken." placement="bottom">
            <Link href="/feedback" aria-label="Feedback" data-tour="nav-feedback" className={button}>
              <ChatCircleDots aria-hidden weight="bold" className="size-5" />
            </Link>
          </Tooltip>
          <Tooltip label="Notifications" description="What happened since you were last here." placement="bottom">
            <Link
              href="/notifications"
              aria-label={notifications > 0 ? `Notifications, ${notifications} unread` : "Notifications"}
              data-tour="nav-notifications"
              data-testid="notification-bell-small"
              className={button}
            >
              <Bell aria-hidden weight="bold" className="size-5" />
              <BadgePill count={notifications} className="absolute top-0 right-0"  />
            </Link>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
