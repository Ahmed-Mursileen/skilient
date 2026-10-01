import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/uni/settings/ecosphere", label: "Ecosphere" },
  { href: "/uni/settings/branding", label: "Branding" },
  { href: "/uni/settings/calendar", label: "Calendar" },
  { href: "/uni/settings/domains", label: "Domains" },
  { href: "/uni/settings/admins", label: "Admins" },
];

export function SettingsTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Settings" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href as Route} aria-current={t.href === current ? "page" : undefined}
          className={cn("rounded-md border px-3 py-1.5 text-body-sm font-semibold", t.href === current ? "border-primary bg-primary-subtle" : "border-border-default")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
