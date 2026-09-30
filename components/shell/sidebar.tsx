"use client";

import { Gear } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { BadgePill } from "@/components/shell/badge-pill";
import { useNavBadges } from "@/components/shell/nav-badges";
import { Avatar, ThemeToggle, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isActive, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/lib/nav";

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const badges = useNavBadges();
  const count = item.badge ? badges[item.badge] : 0;
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <li>
      <Tooltip label={item.label} description={item.description} placement="right" className="block">
        <Link
          href={item.href as Route}
          aria-current={active ? "page" : undefined}
          aria-label={count > 0 ? `${item.label}, ${count} ${item.badge === "notifications" || item.badge === "chat" ? "unread" : "waiting"}` : undefined}
          data-tour={`nav-${item.key}`}
          data-testid={`nav-${item.key}`}
          className={cn(
            "relative flex h-11 items-center gap-3 rounded-md px-3 text-body font-semibold md:justify-center lg:justify-start",
            active ? "bg-primary-subtle text-text-primary" : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary",
          )}
        >
          <Icon aria-hidden weight={active ? "fill" : "bold"} className="size-6 shrink-0" />
          <span className="hidden truncate lg:inline">{item.label}</span>
          <BadgePill count={count} className="ml-auto hidden lg:inline" testId={item.key === "notifications" ? "notification-count" : `${item.key}-badge`} />
          {count > 0 ? <span aria-hidden className="absolute top-1.5 right-2 size-2 rounded-full bg-primary lg:hidden" /> : null}
        </Link>
      </Tooltip>
    </li>
  );
}

/** Desktop sidebar (240 px) and the tablet icon rail (72 px). Hidden on phones, which get the tab bar. */
export function Sidebar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col gap-4 border-r border-border-default bg-bg-surface px-3 py-4 md:flex lg:w-60">
      <Link href="/feed" aria-label="Skilient home" className="flex h-10 items-center gap-2 rounded-md px-2 md:justify-center lg:justify-start">
        <Image src="/brand/skilient-icon.svg" alt="" width={28} height={28} className="size-7 dark:hidden" />
        <Image src="/brand/skilient-icon-white.svg" alt="" width={28} height={28} className="hidden size-7 dark:block" />
        <span className="hidden font-display text-h3 lg:inline">Skilient</span>
      </Link>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.key} item={item} pathname={pathname} />
          ))}
        </ul>
        <hr className="border-border-muted" />
        <ul className="flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.key} item={item} pathname={pathname} />
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-2 border-t border-border-muted pt-3">
        {user ? (
          <Link
            href={(user.username ? `/profile/${user.username}` : "/me") as Route}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-bg-subtle md:justify-center lg:justify-start"
            aria-label={`${user.fullName}, your profile`}
          >
            <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
            <span className="hidden max-w-[14ch] truncate text-body-sm font-semibold lg:inline" data-testid="current-user-name">
              {user.fullName}
            </span>
          </Link>
        ) : null}
        <div className="flex items-center gap-1 md:flex-col lg:flex-row lg:justify-between">
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
          >
            <Gear aria-hidden weight="bold" className="size-5" />
          </Link>
          <SignOutButton variant="ghost" size="sm" icon />
        </div>
        <ThemeToggle className="hidden lg:inline-flex" />
      </div>
    </aside>
  );
}
