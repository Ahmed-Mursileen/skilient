import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/marketing/unsubscribe-form";
import { requestUniversity as copy } from "@/content/marketing";

export const metadata: Metadata = { title: copy.unsubscribeTitle, robots: { index: false } };

/** The unsubscribe link in the request email. A button, so link scanners can't unsubscribe anyone. */
export default async function UnsubscribeRequestPage({ searchParams }: PageProps<"/request-university/unsubscribe">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.slice(0, 200) : "";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] pt-12 pb-24 sm:pt-16">
      <h1 className="font-display text-h1">{copy.unsubscribeTitle}</h1>
      <p className="max-w-[56ch] text-body-lg text-text-secondary">{copy.unsubscribeIntro}</p>
      <UnsubscribeForm token={token} />
    </div>
  );
}
