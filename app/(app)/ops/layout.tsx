import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpsNav } from "@/components/ops/ops-nav";
import { getStorageUsage, staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: { template: "%s · Ops", default: "Ops" }, robots: { index: false, follow: false } };

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/**
 * /ops (PRD 5.26, screen spec 3.11): Skilient staff only. proxy.ts already requires a
 * two-factor session here; anyone without a staff role gets a plain 404. Each area checks
 * its own role (moderators: reports; trust reviewers: evidence; accounts: exam periods).
 */
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  const roles = await staffRoles();
  if (!roles.size) notFound();
  const usage = await getStorageUsage();
  const share = usage ? usage.total / usage.quota : 0;
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-[var(--page-gutter)] py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-strong bg-bg-subtle px-4 py-2" data-testid="staff-marker">
        <span className="flex items-center gap-2 text-body-sm font-semibold">
          <ShieldCheck aria-hidden weight="bold" className="size-4" /> Staff
        </span>
        <OpsNav moderator={roles.has("moderator")} trust={roles.has("trust_reviewer")} accounts={roles.has("accounts")} />
        {usage ? (
          <p className="text-caption text-text-secondary" data-testid="storage-use">
            Storage {(usage.total / MB).toFixed(1)} MB of {(usage.quota / GB).toFixed(0)} GB ({Math.round(share * 100)}%)
            {share >= 0.8 ? <strong className="ml-1 text-text-error">Nearly full</strong> : null}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
