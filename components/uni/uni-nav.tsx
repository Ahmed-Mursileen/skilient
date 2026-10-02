"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { UniRole } from "@/lib/uni/constants";

const ITEMS: { href: string; label: string; roles: UniRole[]; exact?: boolean }[] = [
  { href: "/uni", label: "Home", roles: ["owner", "admin", "career", "coordinator", "comms"], exact: true },
  { href: "/uni/people", label: "People", roles: ["owner", "admin", "coordinator"] },
  { href: "/uni/students", label: "Students", roles: ["owner", "admin", "coordinator"] },
  { href: "/uni/dashboard/adoption", label: "Dashboard", roles: ["owner", "admin", "career", "coordinator"] },
  { href: "/uni/announcements", label: "Announcements", roles: ["owner", "admin", "coordinator", "comms"] },
  { href: "/uni/events", label: "Events", roles: ["owner", "admin", "comms", "career", "coordinator"] },
  { href: "/uni/fairs", label: "Job fairs", roles: ["owner", "admin", "career"] },
  { href: "/uni/hackathons", label: "Hackathons", roles: ["owner", "admin", "career"] },
  { href: "/uni/moderation", label: "Moderation", roles: ["owner", "admin"] },
  { href: "/uni/settings/ecosphere", label: "Settings", roles: ["owner", "admin", "comms"] },
  { href: "/uni/sponsorship", label: "Sponsorship", roles: ["owner", "admin"] },
  { href: "/uni/billing", label: "Billing", roles: ["owner"] },
];

/** The university portal's sections for the admin's role (PRD 5.23 role table). */
export function UniNav({ role }: { role: UniRole }) {
  const pathname = usePathname();
  return (
    <nav aria-label="University portal" className="border-b border-border-default">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ITEMS.filter((i) => i.roles.includes(role)).map((i) => {
          const base = i.href.split("/").slice(0, 3).join("/");
          const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${base}/`) || pathname === base;
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
