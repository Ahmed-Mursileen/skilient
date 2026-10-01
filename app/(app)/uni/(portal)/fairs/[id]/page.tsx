import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { BarList } from "@/components/uni/bar-list";
import { Card, DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { inviteFairCompany, setFairStatus } from "@/lib/actions/uni";
import { isRefusal } from "@/lib/data/rpc-json";
import { getFair, type UniFair } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";

export const metadata: Metadata = { title: "Job fair" };

/** /uni/fairs/[id] (PRD 5.23): setup, invites, the live dashboard and the post-fair report (hires tracked 90 days). */
export default async function FairPage({ params }: PageProps<"/uni/fairs/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let f: UniFair;
  try {
    f = await getFair(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    throw err;
  }
  const r = f.report;
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title={f.fair.title}>{eventTime(f.fair.starts_at)} to {eventTime(f.fair.ends_at)} · {f.fair.status}</PageTitle>
      <div className="flex flex-wrap gap-3">
        {f.fair.status === "draft" ? <ActionButton variant="primary" testId="publish-fair" action={setFairStatus.bind(null, { id, action: "publish" })}>Publish to students</ActionButton> : null}
        {f.fair.status !== "cancelled" ? <ActionButton variant="ghost" action={setFairStatus.bind(null, { id, action: "cancel" })}>Cancel fair</ActionButton> : null}
        {f.fair.status === "published" ? <Link className="self-center underline" href={`/fairs/${id}` as Route}>Open the fair page</Link> : null}
      </div>
      <Section title="Invite companies" id="i-h">
        <RpcForm testId="fair-invite" action={inviteFairCompany as FormAction} extra={{ fairId: id }} after="reset" submitLabel="Send invite" fields={[{ name: "email", label: "Company email", type: "email", required: true }]} />
        <DataTable head={["Email", "Company", "Status"]} empty="No invites yet."
          rows={f.invites.map((i) => [i.email, i.company ?? "", i.accepted ? (i.verified ? "Booth open" : "Accepted, waiting for Skilient verification") : "Invited"])} />
      </Section>
      <Section title="Booths" id="b-h">
        <DataTable testId="booths" head={["Company", "Waiting", "Conversations", "Interviews booked", "Interviews held"]} empty="No booths yet."
          rows={f.booths.map((b) => [b.company, b.waiting, b.conversations, b.interviews_booked, b.interviews_held])} />
      </Section>
      <Section title="Report" id="r-h">
        <div className="grid gap-3 sm:grid-cols-5">
          {([["Attendees", r.attendees], ["Conversations", r.conversations], ["Interviews held", r.interviews_held], ["Contacts (90 days)", r.contacts], ["Hires (90 days)", r.hires]] as const).map(([l, n]) => (
            <Card key={l}><p className="text-caption text-text-secondary">{l}</p><p className="text-h3">{n}</p></Card>
          ))}
        </div>
        <BarList label="Attendees by department" items={r.by_department} />
      </Section>
    </main>
  );
}
