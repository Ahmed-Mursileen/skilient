"use client";

import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { claimInboxItem } from "@/lib/actions/ops/inbox";

/** Claim or release an inbox item without leaving the inbox; the queue's own claim function decides. */
export function InboxClaim({ queue, id, mine, label }: { queue: string; id: string; mine: boolean; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={mine ? "ghost" : "secondary"}
        loading={pending}
        aria-label={`${mine ? "Release" : "Claim"} ${label}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await claimInboxItem(queue, id, !mine);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {mine ? "Release" : "Claim"}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
