"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/teach", label: "Home", exact: true },
  { href: "/teach/ideas", label: "Ideas" },
  { href: "/teach/reviews", label: "Reviews" },
  { href: "/teach/code-checks", label: "Code checks" },
  { href: "/teach/judging", label: "Judging" },
  { href: "/teach/settings", label: "Settings" },
] as const;

/** The teacher portal's sections (PRD 5.21). */
export function TeachNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Teacher portal" className="border-b border-border-default">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ITEMS.map((i) => {
          const active = "exact" in i ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link
                href={i.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap transition-colors duration-[120ms]",
                  active ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
