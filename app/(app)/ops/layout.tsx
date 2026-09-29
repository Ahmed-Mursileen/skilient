import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isModerator } from "@/lib/data/ops";

export const metadata: Metadata = { title: { template: "%s · Ops", default: "Ops" }, robots: { index: false, follow: false } };

/**
 * /ops (PRD 5.26, screen spec 3.11): Skilient staff only. proxy.ts already requires a
 * two-factor session here; everyone who isn't a moderator gets a plain 404.
 */
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  if (!(await isModerator())) notFound();
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-[var(--page-gutter)] py-6">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border-strong bg-bg-subtle px-4 py-2" data-testid="staff-marker">
        <span className="flex items-center gap-2 text-body-sm font-semibold">
          <ShieldCheck aria-hidden weight="bold" className="size-4" /> Staff
        </span>
        <Link href="/ops" className="text-body-sm underline underline-offset-4">
          Queues
        </Link>
      </div>
      {children}
    </div>
  );
}
