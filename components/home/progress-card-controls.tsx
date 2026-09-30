"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { dismissChecklist, dismissProgressCard } from "@/lib/actions/learn";

/** "Hide for today": the card comes back tomorrow (Pakistan time). */
export function DismissCardButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label="Hide this card until tomorrow"
      title="Hide until tomorrow"
      className="-mr-2 -mt-1 size-8 shrink-0 px-0"
      onClick={() => startTransition(async () => void (await dismissProgressCard()))}
      data-testid="progress-dismiss"
    >
      <X aria-hidden weight="bold" className="size-4" />
    </Button>
  );
}

/** Hide the checklist for good. */
export function DismissChecklistButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={() => startTransition(async () => void (await dismissChecklist()))}>
      Hide checklist
    </Button>
  );
}
