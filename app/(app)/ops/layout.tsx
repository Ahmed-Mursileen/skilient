import { Desktop, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpsSidebar } from "@/components/ops/ops-sidebar";
import { getStorageUsage, staffRoles } from "@/lib/data/ops-trust";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/ops/nav";

export const metadata: Metadata = { title: { template: "%s · Ops", default: "Ops" }, robots: { index: false, follow: false } };

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/**
 * The ops shell (PRD 5.26, screen spec 3.11): Skilient staff only. proxy.ts already requires a
 * two-factor session here and every SQL function checks the role on aal2 again; anyone without
 * a staff role gets a plain 404. Desk-only by design: below 1024px a notice says so, and the
 * pages still work.
 */
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  const roles = await staffRoles();
  if (!roles.size) notFound();
  const usage = await getStorageUsage();
  const share = usage ? usage.total / usage.quota : 0;
  const held = STAFF_ROLES.filter((r) => roles.has(r));
  const shown = held.includes("super_admin") ? (["super_admin"] as const) : held;
  return (
    <div className="flex w-full flex-col">
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong bg-bg-subtle px-[var(--page-gutter)] py-2"
        data-testid="staff-marker"
      >
        <span className="flex items-center gap-2 text-body-sm font-semibold">
          <ShieldCheck aria-hidden weight="bold" className="size-4" /> Staff
          <span className="font-normal text-text-secondary">{shown.map((r) => ROLE_LABELS[r]).join(", ")}</span>
        </span>
        {usage ? (
          <p className="text-caption text-text-secondary" data-testid="storage-use">
            Storage {(usage.total / MB).toFixed(1)} MB of {(usage.quota / GB).toFixed(0)} GB ({Math.round(share * 100)}%)
            {share >= 0.8 ? <strong className="ml-1 text-text-error">Nearly full</strong> : null}
          </p>
        ) : null}
      </div>
      <p className="flex items-center gap-2 border-b border-border-default px-[var(--page-gutter)] py-2 text-body-sm text-text-secondary lg:hidden">
        <Desktop aria-hidden className="size-4 shrink-0" /> Ops is built for a desk screen (1024px or wider). Everything still works here.
      </p>
      <div className="flex w-full flex-col gap-6 px-[var(--page-gutter)] py-6 lg:flex-row">
        <aside className="lg:sticky lg:top-6 lg:w-52 lg:shrink-0 lg:self-start">
          <OpsSidebar roles={[...roles]} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
