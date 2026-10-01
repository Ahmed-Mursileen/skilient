"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const WORK = [
  { href: "/recruit", label: "Home", exact: true },
  { href: "/recruit/search", label: "Talent" },
  { href: "/recruit/shortlists", label: "Shortlists" },
  { href: "/recruit/contacts", label: "Requests" },
  { href: "/recruit/jobs", label: "Jobs" },
  { href: "/recruit/competitions", label: "Competitions" },
  { href: "/recruit/analytics", label: "Analytics" },
  { href: "/chat", label: "Messages" },
] as const;

const ORG = [
  { href: "/org/members", label: "Team" },
  { href: "/org/settings", label: "Company page", exact: true },
  { href: "/org/settings/api", label: "API" },
  { href: "/org/plan", label: "Plan" },
  { href: "/org/billing", label: "Billing" },
] as const;

type Item = { href: string; label: string; exact?: boolean };

/** The recruiter portal's sections (PRD 5.20, 5.24); billing seats see the plan and billing only. */
export function RecruitNav({ role }: { role: "admin" | "recruiter" | "billing" }) {
  const pathname = usePathname();
  const items: readonly Item[] = role === "billing" ? [ORG[3], ORG[4]] : role === "admin" ? [...WORK, ...ORG] : [...WORK, ORG[3]];
  return (
    <nav aria-label="Recruiter portal" className="border-b border-border-default">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((i) => {
          const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
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
