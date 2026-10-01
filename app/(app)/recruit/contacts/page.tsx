import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { getMyOrg, getOrgContacts, getOrgPlan } from "@/lib/data/recruit";
import { ageLabel } from "@/lib/format/time";
import { CONTACT_STATUS_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Contact requests" };

/** /recruit/contacts (PRD 5.20): every request your team sent and where it stands. */
export default async function ContactsPage() {
  const org = await getMyOrg();
  if (org?.status !== "verified") {
    return <EmptyState title="Contact requests open when you're verified" description="Once a Skilient reviewer verifies your organisation you can ask students to talk about a role." />;
  }
  const [contacts, plan] = await Promise.all([getOrgContacts(), getOrgPlan()]);
  const left = plan.contact_credits_limit === null ? null : Math.max(plan.contact_credits_limit - plan.contact_credits_used, 0);
  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-h1">Contact requests</h1>
        <p className="text-body-sm text-text-secondary" data-testid="credits">{left === null ? "No contact credits on your plan" : `${left} contact credits left this month`}</p>
      </div>
      {contacts.length === 0 ? (
        <EmptyState icon={<EnvelopeSimple aria-hidden className="size-8" />} title="No requests yet" description="Open a candidate from Talent and ask to talk. A student answers within 14 days or the request expires; a decline blocks a new request for 90 days." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full min-w-[640px] text-left text-body-sm" data-testid="contacts">
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Role</th>
                <th scope="col" className="px-3 py-2 font-semibold">Student</th>
                <th scope="col" className="px-3 py-2 font-semibold">Sent by</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-semibold">{c.role_title}</td>
                  <td className="px-3 py-2">{c.student_id ? <Link href={`/recruit/candidates/${c.student_id}` as Route} className="underline underline-offset-4">{c.student_name}</Link> : "A student"}</td>
                  <td className="px-3 py-2">{c.by_name ?? "A former member"} · {ageLabel(c.created_at)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={c.status === "accepted" ? "success" : c.status === "pending" ? "info" : "neutral"}>{CONTACT_STATUS_LABELS[c.status]}</Badge>
                    {c.thread_id ? <Link href={`/chat/${c.thread_id}` as Route} className="ml-2 font-semibold underline underline-offset-4">Chat</Link> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
