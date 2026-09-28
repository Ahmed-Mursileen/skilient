"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/ui";
import { votePoll } from "@/lib/actions/posts";
import type { PostPoll } from "@/lib/data/posts";
import { futureTime } from "@/lib/format/time";
import { cn } from "@/lib/cn";

/** Poll: vote once; results show after voting, on close, or to the author (PRD 5.28). */
export function PollBlock({ postId, poll, isMine }: { postId: string; poll: PostPoll; isMine: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showResults = poll.myVote !== null || poll.closed || isMine;
  const canVote = !poll.closed && poll.myVote === null && !isMine;

  return (
    <div className="flex flex-col gap-2" data-testid="poll">
      {showResults ? (
        <ul className="flex flex-col gap-2">
          {poll.options.map((o) => {
            const pct = poll.total ? Math.round(((o.votes ?? 0) / poll.total) * 100) : 0;
            return (
              <li key={o.position} className="relative overflow-hidden rounded-md border border-border-default px-3 py-2">
                <span aria-hidden className="absolute inset-y-0 left-0 bg-primary-subtle" style={{ width: `${pct}%` }} />
                <span className="relative flex justify-between gap-3 text-body-sm">
                  <span className={cn(poll.myVote === o.position && "font-semibold")}>
                    {o.label}
                    {poll.myVote === o.position ? <span className="text-text-secondary"> (your vote)</span> : null}
                  </span>
                  <span className="tabular-nums">{pct}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <fieldset className="flex flex-col gap-2" disabled={!canVote || pending}>
          <legend className="sr-only">Vote</legend>
          {poll.options.map((o) => (
            <button
              key={o.position}
              type="button"
              className="rounded-md border border-border-default px-3 py-2 text-left text-body-sm hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await votePoll(postId, o.position);
                  if (result.ok) router.refresh();
                  else setError(result.message);
                })
              }
            >
              {o.label}
            </button>
          ))}
        </fieldset>
      )}
      <p className="text-caption text-text-secondary">
        {poll.total} {poll.total === 1 ? "vote" : "votes"} · {poll.closed ? "Closed" : `Closes ${futureTime(poll.closesAt)}`}
        {!showResults ? " · results after you vote" : ""}
      </p>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
