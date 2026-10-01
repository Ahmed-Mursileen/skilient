import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalHeader } from "@/components/recruit/portal-header";
import { getMyOrg } from "@/lib/data/recruit";

export const metadata: Metadata = { title: { template: "%s · Recruiter portal", default: "Recruiter portal" }, robots: { index: false, follow: false } };

/**
 * The recruiter portal (PRD 5.20): an active member of an organisation with the admin or recruiter
 * role. Recruiters without an organisation go to /org/join; billing seats to the plan page. Every
 * SQL function behind these pages re-checks the role, two-factor session and verification itself.
 */
export default async function RecruitLayout({ children }: LayoutProps<"/recruit">) {
  const org = await getMyOrg();
  if (!org || org.member_status !== "active") redirect("/org/join");
  if (org.role === "billing") redirect("/org/plan");
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6">
      <PortalHeader org={org} />
      {children}
    </div>
  );
}
