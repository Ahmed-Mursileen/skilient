"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgePill } from "@/components/shell/badge-pill";
import { useNavBadges } from "@/components/shell/nav-badges";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isActive, PRIMARY_NAV } from "@/lib/nav";

/** The phone's five tabs (PRD 5.25). Long-press shows the same tooltip as hover on desktop. */
export function BottomTabs() {
  const pathname = usePathname();
  const badges = useNavBadges();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item, pathname);
          const count = item.badge ? badges[item.badge] : 0;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Tooltip label={item.label} description={item.description} placement="top" longPress className="block">
                <Link
                  href={item.href as Route}
                  aria-current={active ? "page" : undefined}
                  aria-label={count > 0 ? `${item.label}, ${count} ${item.badge === "chat" ? "unread" : "waiting"}` : undefined}
                  data-tour={`nav-${item.key}`}
                  data-testid={`tab-${item.key}`}
                  className={cn(
                    "relative flex h-14 flex-col items-center justify-center gap-0.5 text-caption font-semibold",
                    active ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  <span className="relative">
                    <Icon aria-hidden weight={active ? "fill" : "bold"} className={cn("size-6", active && "text-primary")} />
                    <BadgePill count={count} className="absolute -top-1.5 left-3.5" />
                  </span>
                  {item.label}
                </Link>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
