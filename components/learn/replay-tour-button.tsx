"use client";

import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { useTransition } from "react";
import { replayTour } from "@/lib/actions/learn";

/** Settings row: "Replay tour" (PRD 5.27). Forgets the progress and starts the tour on Home. */
export function ReplayTourButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(async () => void (await replayTour()))}
      disabled={pending}
      aria-busy={pending || undefined}
      className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-bg-subtle disabled:opacity-60"
      data-testid="replay-tour"
    >
      <ArrowsClockwise aria-hidden weight="bold" className="size-6 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-h4">Replay tour</span>
        <span className="block text-body-sm text-text-secondary">Walk through the app again, one area at a time.</span>
      </span>
    </button>
  );
}
