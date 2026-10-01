import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UniNav } from "@/components/uni/uni-nav";
import { Badge } from "@/components/ui";
import { getMyUni } from "@/lib/data/uni";
import { ADMIN_ROLE_LABELS, PLAN_LABELS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: { template: "%s · University", default: "University" }, robots: { index: false, follow: false } };

/**
 * The university portal (PRD 5.23): a university_admins seat on a two-factor session (proxy.ts
 * sends aal1 sessions to Settings → Security; every SQL function checks both again). Officials
 * without a seat go to the claim page.
 */
export default async function UniLayout({ children }: LayoutProps<"/uni">) {
  const uni = await getMyUni();
  if (!uni) redirect("/uni/claim");
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6">
      <header className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2 text-caption font-semibold text-text-secondary uppercase">
          <span>University portal · {uni.name}</span>
          <Badge>{ADMIN_ROLE_LABELS[uni.role]}{uni.department ? ` · ${uni.department}` : ""}</Badge>
          <Badge data-testid="uni-plan">{PLAN_LABELS[uni.plan] ?? uni.plan}</Badge>
        </p>
        <UniNav role={uni.role} />
      </header>
      {children}
    </div>
  );
}
