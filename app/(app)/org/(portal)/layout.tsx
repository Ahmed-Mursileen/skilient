import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalHeader } from "@/components/recruit/portal-header";
import { getMyOrg } from "@/lib/data/recruit";

export const metadata: Metadata = { title: { template: "%s · Organisation", default: "Organisation" }, robots: { index: false, follow: false } };

/** Organisation settings (PRD 5.20): members of an organisation only; /org/join is outside this group. */
export default async function OrgLayout({ children }: LayoutProps<"/org">) {
  const org = await getMyOrg();
  if (!org || org.member_status !== "active") redirect("/org/join");
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6">
      <PortalHeader org={org} />
      {children}
    </div>
  );
}
