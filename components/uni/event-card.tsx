import type { Route } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/teach/action-button";
import { Badge } from "@/components/ui";
import { cancelRsvp, rsvpEvent } from "@/lib/actions/uni";
import type { EventCard as Card } from "@/lib/data/uni";
import { eventTime } from "@/lib/format/time";
import { EVENT_TYPE_LABELS } from "@/lib/uni/constants";

export function EventCard({ e, detail = false }: { e: Card; detail?: boolean }) {
  const full = e.capacity !== null && e.going >= e.capacity;
  const past = new Date(e.ends_at) < new Date();
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="event-card">
      <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
        <Badge>{EVENT_TYPE_LABELS[e.type as keyof typeof EVENT_TYPE_LABELS] ?? e.type}</Badge>
        <span>{e.university}</span>
        {e.scope === "global" ? <span>Open to everyone</span> : null}
      </p>
      <h2 className="text-h3">{detail ? e.title : <Link className="underline-offset-4 hover:underline" href={`/events/${e.id}` as Route}>{e.title}</Link>}</h2>
      <p className="text-body">{eventTime(e.starts_at)} · {e.location ?? "Online"}</p>
      {detail && e.description ? <p className="whitespace-pre-line text-body">{e.description}</p> : null}
      {detail && e.link ? <a className="underline" href={e.link} rel="noopener noreferrer" target="_blank">Event link</a> : null}
      <p className="text-body-sm text-text-secondary">{e.going} going{e.capacity ? ` of ${e.capacity}` : ""}</p>
      {e.cancelled ? <Badge tone="warning">Cancelled</Badge> : past ? <span className="text-body-sm">This event is over.</span> : e.my_status === "checked_in" ? (
        <Badge tone="success">Checked in</Badge>
      ) : e.my_status === "going" ? (
        <span className="flex flex-wrap items-center gap-2"><Badge tone="success">You&apos;re going</Badge><ActionButton size="sm" variant="ghost" action={cancelRsvp.bind(null, e.id)}>Can&apos;t go</ActionButton></span>
      ) : e.can_attend ? (
        full ? <span className="text-body-sm">Full</span> : <ActionButton size="sm" variant="primary" testId="rsvp" action={rsvpEvent.bind(null, e.id)}>I&apos;m going</ActionButton>
      ) : null}
      {detail && e.can_organise && !past ? <Link className="underline" href={`/events/${e.id}/check-in` as Route}>Open the check-in screen</Link> : null}
    </article>
  );
}
