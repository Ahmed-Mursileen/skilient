import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { ClaimForm } from "@/components/uni/claim-form";
import { Card, PageTitle, Section } from "@/components/uni/page-parts";
import { Badge } from "@/components/ui";
import { acceptAdminInvite } from "@/lib/actions/uni";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClaimState, getMyUni, getMyUniInvites } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";
import { ADMIN_ROLE_LABELS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Claim your university", robots: { index: false, follow: false } };

/**
 * /uni/claim (PRD 5.23): a university official (signed up with an official email, two-factor on,
 * enforced by proxy.ts and SQL) sends the authorisation letter; Skilient accounts staff verify it.
 * Invites waiting for this email show here too.
 */
export default async function ClaimPage() {
  const [me, uni] = await Promise.all([getCurrentUser(), getMyUni()]);
  if (uni) redirect("/uni");
  if (me?.role !== "university_admin" && me?.role !== "faculty") {
    return (
      <main className="mx-auto flex w-full max-w-prose flex-col gap-4 px-[var(--page-gutter)] py-8">
        <PageTitle title="Claim your university">University officials sign up with their official email first.</PageTitle>
        <Link className="font-semibold underline underline-offset-4" href={"/signup?role=university_admin" as Route}>Create a university official account</Link>
      </main>
    );
  }
  const [invites, state] = await Promise.all([getMyUniInvites(), me.role === "university_admin" ? getClaimState() : Promise.resolve(null)]);
  const pending = state?.claims.find((c) => c.status === "pending");
  return (
    <main className="mx-auto flex w-full max-w-prose flex-col gap-6 px-[var(--page-gutter)] py-8">
      <PageTitle title={state ? `Run ${state.university} on Skilient` : "University portal"}>
        Every university has its ecosphere already. The owner verifies with Skilient once, then invites the rest of the team.
      </PageTitle>
      {invites.length > 0 ? (
        <Section title="Invites for you" id="inv-h">
          <ul className="flex flex-col gap-2" data-testid="uni-invites">
            {invites.map((i) => (
              <li key={i.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <span>{i.university}: {ADMIN_ROLE_LABELS[i.role]}{i.department ? ` (${i.department})` : ""}</span>
                  <ActionButton action={acceptAdminInvite.bind(null, i.id)} variant="primary" testId="accept-uni-invite">Join the portal</ActionButton>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {state ? (
        state.claimed ? (
          <Card><p className="text-body">{state.university} already has an owner. Ask them to invite you from their portal.</p></Card>
        ) : pending ? (
          <Card testId="claim-pending">
            <p className="text-body font-semibold">Your claim is waiting for Skilient.</p>
            <p className="text-body-sm text-text-secondary">Sent {dayLabel(pending.created_at)}. We check the letter against your university&apos;s public pages, usually within two working days.</p>
          </Card>
        ) : state.open_claim_by_other ? (
          <Card><p className="text-body">Someone else at {state.university} has a claim waiting. If that&apos;s a mistake, write to the Skilient team.</p></Card>
        ) : (
          <Section title="Send your claim" id="claim-h">
            <ClaimForm />
          </Section>
        )
      ) : null}
      {state && state.claims.some((c) => c.status === "rejected") ? (
        <Section title="Earlier claims" id="old-h">
          <ul className="flex flex-col gap-2">
            {state.claims.filter((c) => c.status === "rejected").map((c) => (
              <li key={c.id} className="text-body-sm"><Badge tone="warning">Not approved</Badge> {dayLabel(c.created_at)}: {c.review_reason}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </main>
  );
}
