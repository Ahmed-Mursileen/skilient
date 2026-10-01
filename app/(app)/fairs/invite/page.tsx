import type { Metadata } from "next";
import { ActionButton } from "@/components/teach/action-button";
import { Card, PageTitle } from "@/components/uni/page-parts";
import { acceptFairInvite } from "@/lib/actions/uni";
import { getCurrentUser } from "@/lib/auth/current-user";
import { sha256Hex } from "@/lib/data/recruit-public";
import { getFairInvitePreview } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Job fair invite", robots: { index: false, follow: false } };

/** /fairs/invite?token= : a company's organisation admin accepts and its booth is created. */
export default async function FairInvitePage({ searchParams }: PageProps<"/fairs/invite">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(sp.token) ? sp.token : null;
  const [me, preview] = await Promise.all([getCurrentUser(), token ? getFairInvitePreview(sha256Hex(token)) : Promise.resolve(null)]);
  return (
    <main className="mx-auto flex w-full max-w-prose flex-col gap-4 px-[var(--page-gutter)] py-8">
      {!preview || !token ? (
        <PageTitle title="This invite isn't open">It may have been used or the fair may be over.</PageTitle>
      ) : (
        <>
          <PageTitle title={`${preview.university} invites you to ${preview.fair}`}>{eventTime(preview.starts_at)} to {eventTime(preview.ends_at)}. Fair access is free.</PageTitle>
          {me?.role === "recruiter" ? (
            <Card className="flex flex-col gap-2">
              <p className="text-body">Accept as your organisation&apos;s admin. Your booth opens to students once Skilient has verified your organisation.</p>
              <ActionButton variant="primary" testId="accept-fair" action={acceptFairInvite.bind(null, token)}>Accept and open our booth</ActionButton>
            </Card>
          ) : (
            <p className="text-body">Sign in with a recruiter account at {preview.email.split("@")[1]} to accept.</p>
          )}
        </>
      )}
    </main>
  );
}
