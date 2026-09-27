"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Overview, Ventures, Skills, Activity as nested routes (PRD 5.4). */
export function ProfileTabs({ username }: { username: string }) {
  const pathname = usePathname();
  const base = `/profile/${username}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/ventures`, label: "Ventures" },
    { href: `${base}/skills`, label: "Skills" },
    { href: `${base}/activity`, label: "Activity" },
  ];
  return (
    <nav aria-label="Profile sections" className="border-b border-border-default">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap transition-colors duration-[120ms]",
                  active ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
