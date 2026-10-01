import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/uni/page-parts";
import { sha256Hex } from "@/lib/data/recruit-public";
import { getUniInvitePreview } from "@/lib/data/uni";

export const metadata: Metadata = { title: "Join your university's portal", robots: { index: false, follow: false } };

/** /uni/join?invite= (the emailed link): shows who invited whom, then the claim page lists the invite to accept. */
export default async function JoinPage({ searchParams }: PageProps<"/uni/join">) {
  const sp = await searchParams;
  const token = typeof sp.invite === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(sp.invite) ? sp.invite : null;
  const preview = token ? await getUniInvitePreview(sha256Hex(token)) : null;
  if (preview) redirect("/uni/claim");
  return (
    <main className="mx-auto flex w-full max-w-prose flex-col gap-4 px-[var(--page-gutter)] py-8">
      <PageTitle title="This invite isn't open">It may have expired (invites last 7 days), been used, or been sent to another email. Ask your university&apos;s portal owner for a new one.</PageTitle>
    </main>
  );
}
