"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, FieldError, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { setFinalYearBatch } from "@/lib/actions/ops/batches";
import { claimFeedback, respondFeedback } from "@/lib/actions/ops/feedback";
import { FEEDBACK_STATUSES, STATUS_LABELS, type FeedbackStatus } from "@/lib/feedback/constants";
import { cn } from "@/lib/cn";

export function FeedbackClaimButton({ id, claimed }: { id: string; claimed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={claimed ? "ghost" : "primary"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await claimFeedback(id, !claimed);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {claimed ? "Release" : "Claim"}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

/** Set the status and an optional reply the student reads; they are notified of the change. */
export function FeedbackRespondForm({ id, status: initial, reply: initialReply }: { id: string; status: FeedbackStatus; reply: string | null }) {
  const uid = useId();
  const [status, setStatus] = useState<FeedbackStatus>(initial);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await respondFeedback(id, status, reply);
          if (result.ok) {
            setSaved(true);
            setReply("");
          } else setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Saved. The student has been told.</FormAlert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-status`}>Status</Label>
        <select id={`${uid}-status`} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} className={cn(controlBase, "h-10")}>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-reply`}>Reply (optional, the student reads it)</Label>
        <Textarea id={`${uid}-reply`} value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={2000} placeholder={initialReply ?? ""} />
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}

/** One university's final-year batch, with the reason the audit log keeps. */
export function BatchForm({ universityId, batch, name }: { universityId: string; batch: number | null; name: string }) {
  const uid = useId();
  const [year, setYear] = useState(batch ? String(batch) : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await setFinalYearBatch(universityId, year.trim() === "" ? null : Number(year), reason);
          if (result.ok) {
            setSaved(true);
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${uid}-y`} className="sr-only">
          Final-year batch for {name}
        </Label>
        <Input id={`${uid}-y`} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" className="w-24" />
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <Label htmlFor={`${uid}-r`} className="sr-only">
          Reason for {name}
        </Label>
        <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" maxLength={500} />
      </div>
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
      <p role="status" className="basis-full text-caption text-text-secondary">
        {saved ? "Saved." : ""}
      </p>
      {error ? <FieldError className="basis-full">{error}</FieldError> : null}
    </form>
  );
}
