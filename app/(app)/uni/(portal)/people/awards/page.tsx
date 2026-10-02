import type { Metadata } from "next";
import { ActionButton } from "@/components/teach/action-button";
import { Card, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { archiveBadge, awardBadge, revokeAward, saveBadge } from "@/lib/actions/uni";
import { getBadges, getMyUni } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";
import { BADGE_ICONS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Awards" };

/** /uni/people/awards (PRD 5.23): university awards, shown on profiles and the CV. They never change ranking. */
export default async function AwardsPage() {
  const [uni, badges] = await Promise.all([getMyUni(), getBadges()]);
  const isAdmin = uni?.role === "owner" || uni?.role === "admin";
  const active = badges.filter((b) => !b.archived);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Awards">Awards appear on the student&apos;s profile and their next verified CV as awarded by your university. They never change ranking or tiers.</PageTitle>
      <Section title="New award" id="new-h">
        <RpcForm testId="new-award" action={saveBadge as FormAction} after="reset" submitLabel="Create award" fields={[
          { name: "name", label: "Name", type: "text", required: true, placeholder: "Dean's Innovation Award" },
          { name: "description", label: "What it recognises", type: "textarea", rows: 2 },
          { name: "icon", label: "Icon", type: "select", options: BADGE_ICONS.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) })) },
        ]} />
      </Section>
      {active.length === 0 ? <p className="text-body text-text-secondary">No awards yet.</p> : null}
      {active.map((b) => (
        <Section key={b.id} title={b.name} id={`b-${b.id}`}>
          {b.description ? <p className="text-body text-text-secondary">{b.description}</p> : null}
          <Card>
            <RpcForm testId="grant-award" action={awardBadge as FormAction} extra={{ badgeId: b.id }} after="reset" submitLabel="Grant" fields={[
              { name: "student", label: "Student's username or university email", type: "text", required: true },
              { name: "note", label: "Note (optional)", type: "text" },
            ]} />
          </Card>
          <ul className="flex flex-col gap-2" data-testid="award-list">
            {b.awards.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 text-body">
                <span className="font-semibold">{w.student}</span>
                <span className="text-text-secondary">{w.department} · {dayLabel(w.awarded_at)}</span>
                <ActionButton size="sm" variant="ghost" action={revokeAward.bind(null, w.id)}>Revoke</ActionButton>
              </li>
            ))}
          </ul>
          {isAdmin ? <ActionButton size="sm" action={archiveBadge.bind(null, b.id)}>Archive this award</ActionButton> : null}
        </Section>
      ))}
    </main>
  );
}
