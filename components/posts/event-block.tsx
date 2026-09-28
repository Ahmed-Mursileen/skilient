"use client";

import { CalendarBlank, LinkSimple, MapPin } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { rsvpEvent } from "@/lib/actions/posts";
import type { PostEvent } from "@/lib/data/posts";
import { eventTime } from "@/lib/format/time";

/** Event details and Going / Interested (PRD 5.28). Tapping your choice again clears it. */
export function EventBlock({ postId, event }: { postId: string; event: PostEvent }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const past = event.past;

  const choose = (status: "going" | "interested") =>
    startTransition(async () => {
      setError(null);
      const result = await rsvpEvent(postId, event.mine === status ? null : status);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-default bg-bg-subtle p-3" data-testid="event">
      <p className="flex items-center gap-2 text-body-sm font-semibold">
        <CalendarBlank aria-hidden weight="bold" className="size-4 shrink-0" />
        {eventTime(event.startsAt)}
      </p>
      {event.place ? (
        <p className="flex items-center gap-2 text-body-sm">
          <MapPin aria-hidden weight="bold" className="size-4 shrink-0" />
          {event.place}
        </p>
      ) : null}
      {event.url ? (
        <a href={event.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-2 text-body-sm underline underline-offset-4">
          <LinkSimple aria-hidden weight="bold" className="size-4 shrink-0" />
          <span className="truncate">{event.url}</span>
        </a>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {past ? (
          <span className="text-body-sm text-text-secondary">This event has happened.</span>
        ) : (
          <>
            <Button size="sm" variant={event.mine === "going" ? "primary" : "secondary"} aria-pressed={event.mine === "going"} loading={pending} onClick={() => choose("going")}>
              Going
            </Button>
            <Button size="sm" variant={event.mine === "interested" ? "primary" : "secondary"} aria-pressed={event.mine === "interested"} disabled={pending} onClick={() => choose("interested")}>
              Interested
            </Button>
          </>
        )}
        <span className="text-caption text-text-secondary">
          {event.going} going · {event.interested} interested
        </span>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
