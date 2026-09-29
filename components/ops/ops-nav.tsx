"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** The /ops areas this staff member's roles open. */
export function OpsNav({ moderator, trust, accounts }: { moderator: boolean; trust: boolean; accounts: boolean }) {
  const pathname = usePathname();
  const items = [
    moderator && { href: "/ops", label: "Reports", active: pathname === "/ops" || pathname.startsWith("/ops/reports") },
    trust && { href: "/ops/evidence", label: "Evidence", active: pathname.startsWith("/ops/evidence") },
    accounts && { href: "/ops/exam-periods", label: "Exam periods", active: pathname.startsWith("/ops/exam-periods") },
  ].filter((i): i is { href: string; label: string; active: boolean } => Boolean(i));
  return (
    <nav aria-label="Ops areas">
      <ul className="flex gap-1">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href as Route}
              aria-current={i.active ? "page" : undefined}
              className={cn("rounded-md px-2 py-1 text-body-sm underline-offset-4 hover:underline", i.active ? "font-semibold text-text-primary" : "text-text-secondary")}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
