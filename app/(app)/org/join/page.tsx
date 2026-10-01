import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AcceptInviteButton, OrgJoinForm } from "@/components/recruit/org-forms";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMyOrg, getMyOrgInvites } from "@/lib/data/recruit";
import { futureTime } from "@/lib/format/time";
import { ORG_ROLE_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Set up your organisation", robots: { index: false, follow: false } };

/**
 * /org/join (PRD 5.20): the stepper after a recruiter signs up with two-factor on. Either accept an
 * invite from a teammate, or tell us about the company; a Skilient reviewer verifies it within two
 * working days and meanwhile the company page can be built.
 */
export default async function OrgJoinPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "recruiter") notFound();
  const org = await getMyOrg();
  if (org && org.member_status === "active") redirect("/recruit");
  const invites = await getMyOrgInvites();
  const domain = user.email.split("@")[1] ?? "";
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-10">
      <div>
        <h1 className="font-display text-h1">Set up your organisation</h1>
        <p className="mt-1 text-body text-text-secondary">
          Two-factor sign-in is on. Next, tell us about your company. We check the website, your work email and, if you add them, the LinkedIn page and registration number.
        </p>
      </div>
      {invites.length > 0 ? (
        <section aria-labelledby="inv-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5" data-testid="org-invites">
          <h2 id="inv-h" className="text-h3">You&apos;ve been invited</h2>
          <ul className="flex flex-col gap-3">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <strong className="font-semibold">{i.org_name}</strong> invited you as {ORG_ROLE_LABELS[i.role].toLowerCase()}.{" "}
                  <span className="text-body-sm text-text-secondary">Expires {futureTime(i.expires_at)}.</span>
                </span>
                <AcceptInviteButton id={i.id} />
              </li>
            ))}
          </ul>
          <p className="text-body-sm text-text-muted">Or set up a different company below.</p>
        </section>
      ) : null}
      <OrgJoinForm domain={domain} />
    </main>
  );
}
