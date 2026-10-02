import type { Metadata } from "next";
import { ActionButton } from "@/components/teach/action-button";
import { Card, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { Badge } from "@/components/ui";
import { endAnnouncement, postAnnouncement } from "@/lib/actions/uni";
import { getAnnouncements } from "@/lib/data/uni";
import { ageLabel, dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Announcements" };

/** /uni/announcements (PRD 5.23): targeted to the whole university, departments or batches; 3 a day. */
export default async function AnnouncementsPage() {
  const a = await getAnnouncements();
  const left = Math.max(0, a.daily_limit - a.posted_today);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Announcements">They appear in the University Feed of the people you choose, with an in-app notice and the daily digest (never an instant email). {left} of {a.daily_limit} left today.</PageTitle>
      <Section title="New announcement" id="n-h">
        <RpcForm testId="announce-form" action={postAnnouncement as FormAction} after="reset" submitLabel="Post announcement" fields={[
          { name: "body", label: "Announcement", type: "textarea", required: true, rows: 4 },
          { name: "category", label: "Category", type: "select", options: [{ value: "", label: "None" }, ...a.categories.map((c) => ({ value: c, label: c }))] },
          { name: "departments", label: "Departments (none ticked = everyone)", type: "checks", options: a.departments.map((d) => ({ value: d.id, label: d.name })) },
          { name: "batches", label: "Batches (graduating years, comma separated; empty = all)", type: "list", numeric: true, placeholder: "2027, 2028" },
          { name: "expiresDays", label: "Shows for (days, up to 90)", type: "number", defaultValue: 30 },
          { name: "pinDays", label: "Pin at the top for (days, 0 to 7)", type: "number", defaultValue: 0 },
        ]} />
      </Section>
      <Section title="Posted" id="p-h">
        {a.items.length === 0 ? <p className="text-body text-text-secondary">Nothing posted yet.</p> : null}
        <ul className="flex flex-col gap-3" data-testid="announcements">
          {a.items.map((i) => {
            const live = new Date(i.expires_at) > new Date();
            return (
              <li key={i.id}>
                <Card className="flex flex-col gap-2">
                  <p className="whitespace-pre-line">{i.body}</p>
                  <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                    {i.category ? <Badge>{i.category}</Badge> : null}
                    {i.pinned_until ? <Badge tone="primary">Pinned</Badge> : null}
                    <span>{i.author} · {ageLabel(i.created_at)} · {live ? `until ${dayLabel(i.expires_at)}` : "ended"}</span>
                    <span>To: {[...(i.departments ?? []), ...(i.batches ?? []).map((b) => `class of ${b}`)].join(", ") || "everyone"}</span>
                  </p>
                  {live ? <ActionButton size="sm" variant="ghost" action={endAnnouncement.bind(null, i.id)}>End now</ActionButton> : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </Section>
    </main>
  );
}
