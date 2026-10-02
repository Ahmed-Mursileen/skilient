import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/ops/config", label: "Settings" },
  { href: "/ops/config/plans", label: "Plan prices" },
  { href: "/ops/config/skills", label: "Skills" },
] as const;

export function ConfigTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Config sections" className="border-b border-border-default">
      <ul className="-mb-px flex gap-1">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href as Route}
              aria-current={t.href === current ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                t.href === current ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
