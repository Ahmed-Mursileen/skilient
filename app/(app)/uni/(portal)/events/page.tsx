import type { Metadata, Route } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/teach/action-button";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { cancelEvent, saveEvent } from "@/lib/actions/uni";
import { getUniEvents } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Events" };

/** /uni/events (PRD 5.23): talks, workshops, hackathons and competitions with RSVP, capacity and QR check-in. */
export default async function UniEventsPage() {
  const e = await getUniEvents();
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Events">Students RSVP from Events; at the door they scan the code on your check-in screen. You see counts, never a list of names.</PageTitle>
      {!e.module_on ? <p className="text-body">The Events module is off. Turn it on in Settings, Ecosphere.</p> : null}
      {e.can_edit && e.module_on ? (
        <Section title="New event" id="n-h">
          <RpcForm testId="event-form" action={saveEvent as FormAction} after="reset" submitLabel="Create event" fields={[
            { name: "title", label: "Title", type: "text", required: true },
            { name: "type", label: "Type", type: "select", options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] })) },
            { name: "scope", label: "Who can come", type: "select", options: [{ value: "university", label: "Our students and faculty" }, { value: "global", label: "Anyone on Skilient" }] },
            { name: "startsAt", label: "Starts", type: "datetime-local", required: true },
            { name: "endsAt", label: "Ends", type: "datetime-local", required: true },
            { name: "location", label: "Place", type: "text" },
            { name: "link", label: "Online link (https://)", type: "url" },
            { name: "capacity", label: "Capacity (empty = no limit)", type: "number" },
            { name: "description", label: "Description", type: "textarea", rows: 3 },
          ]} />
        </Section>
      ) : null}
      <DataTable testId="uni-events" head={["Event", "When", "Going", "Checked in", ""]} empty="No events yet."
        rows={e.items.map((ev) => [
          <Link key="t" className="font-semibold underline underline-offset-4" href={`/events/${ev.id}` as Route}>{ev.title}</Link>,
          eventTime(ev.starts_at), `${ev.going}${ev.capacity ? ` / ${ev.capacity}` : ""}`, ev.checked_in ?? 0,
          ev.cancelled ? "Cancelled" : e.can_edit ? (
            <span key="a" className="flex flex-col gap-1">
              <Link className="underline" href={`/events/${ev.id}/check-in` as Route}>Check-in screen</Link>
              <ActionButton size="sm" variant="ghost" action={cancelEvent.bind(null, ev.id)}>Cancel event</ActionButton>
            </span>
          ) : "",
        ])} />
    </main>
  );
}
