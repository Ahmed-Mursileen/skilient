"use client";

import { useId, useState, useTransition } from "react";
import { FieldError, Switch } from "@/components/ui";
import { setReadReceipts } from "@/lib/actions/chat";

/** DM read receipts: off means you neither send nor see them (PRD 5.28). Saves on change. */
export function ReadReceiptsToggle({ initial }: { initial: boolean }) {
  const id = useId();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 px-5 py-4" aria-busy={pending || undefined}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor={id} className="text-h4">
            Read receipts
          </label>
          <p className="text-body-sm text-text-secondary" id={`${id}-desc`}>
            In direct messages, show &ldquo;Seen&rdquo; when someone has read your message. If you turn this off, you
            won&apos;t send them or see anyone else&apos;s.
          </p>
        </div>
        <Switch
          id={id}
          aria-describedby={`${id}-desc`}
          checked={on}
          disabled={pending}
          onCheckedChange={(next) => {
            setError(null);
            setSaved(false);
            startTransition(async () => {
              const result = await setReadReceipts(next);
              if (result.ok) {
                setOn(next);
                setSaved(true);
              } else setError(result.message);
            });
          }}
        />
      </div>
      <p role="status" className="text-caption text-text-secondary">
        {saved ? "Saved." : ""}
      </p>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
