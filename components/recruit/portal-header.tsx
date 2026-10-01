import Link from "next/link";
import { Badge } from "@/components/ui";
import { RecruitNav } from "@/components/recruit/recruit-nav";
import type { MyOrg } from "@/lib/data/recruit";
import { ORG_STATUS_LABELS } from "@/lib/recruit/constants";

/** Organisation name, verification state and the section nav, shared by /recruit and /org. */
export function PortalHeader({ org }: { org: MyOrg }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption font-semibold text-text-secondary uppercase">Recruiter portal · {org.name}</p>
        <Badge tone={org.status === "verified" ? "verified" : org.status === "pending" ? "info" : "warning"} data-testid="org-status">
          {ORG_STATUS_LABELS[org.status]}
        </Badge>
      </div>
      {org.status !== "verified" ? (
        <p className="rounded-md border border-border-default bg-bg-subtle px-3 py-2 text-body-sm" data-testid="org-banner">
          {org.status === "pending" ? (
            <>A Skilient reviewer checks new companies within 2 working days. You can build your <Link href="/org/settings" className="font-semibold underline underline-offset-4">company page</Link> meanwhile; talent search, contact requests and jobs open once you&apos;re verified.</>
          ) : org.status === "suspended" ? (
            <>Your organisation is suspended{org.status_reason ? `: ${org.status_reason}` : ""}. Talent search and contact requests are off. Reply to the email from Skilient to appeal.</>
          ) : (
            <>Skilient couldn&apos;t verify this organisation{org.status_reason ? `: ${org.status_reason}` : ""}.</>
          )}
        </p>
      ) : null}
      <RecruitNav role={org.role} />
    </header>
  );
}
