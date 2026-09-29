"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Textarea } from "@/components/ui";
import { resolveCase } from "@/lib/actions/ops/moderation";

const ACTIONS = [
  { value: "dismiss", label: "Dismiss", hint: "Nothing breaks the guidelines. A held post goes back to the feed." },
  { value: "remove", label: "Remove content", hint: "Hidden from everyone, the owner included. The owner is told why." },
  { value: "warn", label: "Warn the owner", hint: "The content stays. The owner gets a warning with your reason." },
] as const;

/** Dismiss, remove or warn, always with a reason (PRD 5.26). Suspend and ban come in phase 11. */
export function ResolveForm({ caseId, canRemove }: { caseId: string; canRemove: boolean }) {
  const id = useId();
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!action) {
          setError("Choose an action.");
          return;
        }
        startTransition(async () => {
          setError(null);
          const result = await resolveCase(caseId, action, reason);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-semibold">Action</legend>
        {ACTIONS.filter((a) => canRemove || a.value !== "remove").map((a) => (
          <label key={a.value} className="flex items-start gap-2 text-body-sm">
            <input type="radio" name={`${id}-action`} value={a.value} checked={action === a.value} onChange={() => setAction(a.value)} className="mt-1 size-4" />
            <span>
              <span className="font-semibold">{a.label}</span>
              <span className="block text-caption text-text-secondary">{a.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-reason`} className="text-body-sm font-semibold">
          Reason
        </label>
        <p id={`${id}-hint`} className="text-caption text-text-secondary">
          Recorded in the audit log. For removals and warnings the owner sees it too.
        </p>
        <Textarea id={`${id}-reason`} aria-describedby={`${id}-hint`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} required minLength={3} />
      </div>
      <Button type="submit" loading={pending}>
        Confirm decision
      </Button>
    </form>
  );
}
