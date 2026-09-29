"use client";

import { Flag } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, Textarea } from "@/components/ui";
import { submitReport } from "@/lib/actions/reports";
import { cn } from "@/lib/cn";

type Target = "post" | "comment" | "message" | "profile" | "venture";
type Reason = "spam" | "harassment" | "inappropriate" | "misinformation" | "impersonation" | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "misinformation", label: "Misinformation" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

const NOUNS: Record<Target, string> = { post: "post", comment: "comment", message: "message", profile: "profile", venture: "venture" };

export interface EarlierMessage {
  id: string;
  sender: string;
  excerpt: string;
}

/**
 * Report (PRD 5.12): a reason, optional detail, and for a chat message up to 10 earlier
 * messages the reporter chooses to include (staff see only those). The reporter hears
 * only "thanks, we'll review this".
 */
export function ReportButton({
  targetType,
  targetId,
  earlier = [],
  compact = false,
  className,
}: {
  targetType: Target;
  targetId: string;
  earlier?: EarlierMessage[];
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [detail, setDetail] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const noun = NOUNS[targetType];

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setReason(null);
      setDetail("");
      setAttached([]);
      setError(null);
      setDone(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className={cn("min-h-6 underline-offset-4 hover:underline", className)}>
          Report
        </button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className={className}>
          <Flag aria-hidden weight="bold" className="size-4" />
          Report
        </Button>
      )}
      <DialogContent
        title={done ? "Thanks for telling us" : `Report this ${noun}`}
        description={done ? undefined : "Reports are private. The person isn't told who reported them."}
      >
        {done ? (
          <>
            <p className="text-body" role="status">
              Thanks, we&apos;ll review this.
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason) {
                setError("Choose a reason.");
                return;
              }
              startTransition(async () => {
                setError(null);
                const result = await submitReport({ targetType, targetId, reason, detail: detail.trim() || undefined, messageIds: attached });
                if (result.ok) setDone(true);
                else setError(result.message);
              });
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body-sm font-semibold">Why are you reporting it?</legend>
              {REASONS.map((r) => (
                <label key={r.value} className="flex min-h-8 items-center gap-2 text-body-sm">
                  <input type="radio" name={`${id}-reason`} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="size-4" />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-detail`} className="text-body-sm font-semibold">
                Anything else? <span className="font-normal text-text-secondary">(optional)</span>
              </label>
              <Textarea id={`${id}-detail`} value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} maxLength={500} />
            </div>
            {earlier.length ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-body-sm font-semibold">Include earlier messages for context (up to 10)</legend>
                <p className="text-caption text-text-secondary">Moderators see only the reported message and the ones you tick.</p>
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {earlier.slice(-10).map((m) => (
                    <li key={m.id}>
                      <label className="flex items-start gap-2 text-body-sm">
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={attached.includes(m.id)}
                          onChange={(e) => setAttached((a) => (e.target.checked ? [...a, m.id] : a.filter((x) => x !== m.id)))}
                        />
                        <span>
                          <span className="font-semibold">{m.sender}: </span>
                          {m.excerpt}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
