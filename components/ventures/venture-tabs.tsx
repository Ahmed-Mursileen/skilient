"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Venture page tabs (PRD 5.28): About, Team, Updates, Deliverables. Contributions, Reviews
 * and Chat join with the contribution log (slice 6), teachers (phase 7) and chat (phase 3).
 * Manage is the owner's.
 */
export function VentureTabs({ id, isOwner }: { id: string; isOwner: boolean }) {
  const pathname = usePathname();
  const base = `/ventures/${id}`;
  const tabs = [
    { href: base, label: "About" },
    { href: `${base}/team`, label: "Team" },
    { href: `${base}/updates`, label: "Updates" },
    { href: `${base}/deliverables`, label: "Deliverables" },
    ...(isOwner ? [{ href: `${base}/manage`, label: "Manage" }] : []),
  ];
  return (
    <nav aria-label="Venture sections" className="border-b border-border-default">
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
