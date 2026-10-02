"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { OPS_AREAS, OPS_GROUPS, canOpen, isCurrent, type StaffRole } from "@/lib/ops/nav";

/** The ops shell's sidebar (screen spec 3.11): the areas this staff member's roles open, grouped. */
export function OpsSidebar({ roles }: { roles: StaffRole[] }) {
  const pathname = usePathname();
  const areas = OPS_AREAS.filter((a) => canOpen(a, roles));
  return (
    <nav aria-label="Ops areas" className="flex flex-col gap-5" data-testid="ops-sidebar">
      {OPS_GROUPS.map((group) => {
        const items = areas.filter((a) => a.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <p className="px-3 text-caption font-semibold tracking-wide text-text-secondary uppercase">{group}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map((a) => {
                const current = isCurrent(a, pathname);
                const Icon = a.icon;
                return (
                  <li key={a.key}>
                    <Link
                      href={a.href as Route}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm transition-colors duration-[120ms]",
                        current ? "bg-bg-subtle font-semibold text-text-primary" : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary",
                      )}
                    >
                      <Icon aria-hidden weight={current ? "fill" : "regular"} className="size-4 shrink-0" />
                      {a.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
