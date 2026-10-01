import { ListStar } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { NewShortlistForm } from "@/components/recruit/shortlist-board";
import { EmptyState } from "@/components/ui";
import { getMyOrg, getOrgActivity, getShortlists } from "@/lib/data/recruit";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Shortlists" };

const KIND_LABEL: Record<string, string> = {
  viewed: "viewed",
  contact_sent: "sent a contact request to",
  shortlisted: "shortlisted",
  noted: "added a note on",
  invited_to_apply: "invited to apply:",
  hired: "hired",
};

/** /recruit/shortlists (PRD 5.20): named lists shared across the organisation's seats, and the team feed. */
export default async function ShortlistsPage() {
  const org = await getMyOrg();
  if (org?.status !== "verified") {
    return <EmptyState title="Shortlists open when you're verified" description="Once a Skilient reviewer verifies your organisation, your team can build shared lists here." />;
  }
  const [lists, activity] = await Promise.all([getShortlists(), getOrgActivity()]);
  return (
    <main className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="lists-h" className="flex flex-col gap-4">
        <h1 id="lists-h" className="font-display text-h1">Shortlists</h1>
        <NewShortlistForm />
        {lists.length === 0 ? (
          <EmptyState icon={<ListStar aria-hidden className="size-8" />} title="No lists yet" description="Make a list, then add candidates from their page. Everyone on your team sees the same lists." />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="shortlists">
            {lists.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
                <Link href={`/recruit/shortlists/${l.id}` as Route} className="text-h4 underline-offset-4 hover:underline">{l.name}</Link>
                <span className="text-body-sm text-text-secondary">{l.count} {l.count === 1 ? "person" : "people"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside aria-labelledby="feed-h" className="flex flex-col gap-3">
        <h2 id="feed-h" className="text-h3">Team activity</h2>
        <p className="text-body-sm text-text-muted">So two recruiters don&apos;t contact the same student twice.</p>
        {activity.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-body-sm" data-testid="org-activity">
            {activity.map((a, i) => (
              <li key={i}>
                <strong className="font-semibold">{a.actor ?? "A former member"}</strong> {KIND_LABEL[a.kind] ?? a.kind} {a.student_name ?? "a student"}{" "}
                <span className="text-text-secondary">{ageLabel(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </main>
  );
}
