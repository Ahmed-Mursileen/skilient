import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactResponse } from "@/components/recruit/student-controls";
import { Badge } from "@/components/ui";
import { getMyContactRequests } from "@/lib/data/opportunities";
import { futureTime, ageLabel } from "@/lib/format/time";
import { CONTACT_STATUS_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Request from a recruiter" };

/**
 * /opportunities/contact-requests/[id] (PRD 5.20): a company asks to talk. You see who they are
 * (their company page), the role and the message before you answer; they see your name only if you
 * accept. A decline tells them you declined, not who you are, and they can't ask again for 90 days.
 */
export default async function ContactRequestPage({ params }: PageProps<"/opportunities/contact-requests/[id]">) {
  const { id } = await params;
  const request = (await getMyContactRequests()).find((r) => r.id === id);
  if (!request) notFound();
  const pending = request.status === "pending";
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <header className="flex flex-col gap-1">
        <p><Link href={"/opportunities/contact_requests" as Route} className="text-body-sm font-semibold underline underline-offset-4">All requests</Link></p>
        <h1 className="font-display text-h1">{request.role_title}</h1>
        <p className="text-body">
          From <Link href={`/companies/${request.org.slug}` as Route} className="font-semibold underline underline-offset-4">{request.org.name}</Link>{" "}
          <span className="text-text-secondary">({request.org.industry}, {request.org.size} people, {request.org.city})</span>
          {request.org.verified ? <Badge tone="verified" className="ml-2">Verified company</Badge> : null}
        </p>
        <p><Badge tone={request.status === "accepted" ? "success" : pending ? "info" : "neutral"} data-testid="contact-status">{CONTACT_STATUS_LABELS[request.status]}</Badge></p>
      </header>
      <blockquote className="rounded-lg border border-border-default bg-bg-surface p-4 text-body whitespace-pre-line" data-testid="contact-message">{request.message}</blockquote>
      <p className="text-body-sm text-text-secondary">
        Sent {ageLabel(request.created_at)}. {pending ? `Answer by ${futureTime(request.expires_at)}; after that it expires on its own.` : null}
      </p>
      {pending ? <ContactResponse id={request.id} closed={false} accepted={false} /> : null}
      {request.status === "accepted" ? (
        <div className="flex flex-wrap items-center gap-3">
          {request.thread_id ? <Link href={`/chat/${request.thread_id}` as Route} className="font-semibold underline underline-offset-4">Open the conversation</Link> : <span className="text-body-sm text-text-secondary">You closed this conversation.</span>}
          <ContactResponse id={request.id} closed={request.closed} accepted />
        </div>
      ) : null}
    </main>
  );
}
