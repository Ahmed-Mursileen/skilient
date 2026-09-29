"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError, Input, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { addExamPeriod, removeExamPeriod, reviewRankingFlag } from "@/lib/actions/ops/ranking";
import { cn } from "@/lib/cn";

/**
 * Clear or uphold a ranking flag, with a reason for the audit log (PRD 5.13 anti-gaming).
 * What each choice does depends on the kind of flag.
 */
export function RankingFlagReviewForm({ id, kind }: { id: string; kind: "ring" | "rapid_gain" }) {
  const uid = useId();
  const [uphold, setUphold] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hints =
    kind === "ring"
      ? {
          clear: "Real teammates: their endorsements count again from the next nightly run.",
          uphold: "A ring: these endorsements stay at 0 for good.",
        }
      : {
          clear: "The gain is genuine: it counts from the next nightly run.",
          uphold: "The gain doesn't stand: a negative adjustment of the same size cancels it.",
        };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (uphold === null) {
          setError("Choose clear or uphold.");
          return;
        }
        startTransition(async () => {
          setError(null);
          const result = await reviewRankingFlag(id, uphold, reason);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-semibold">Decision</legend>
        <label className="flex items-start gap-2 text-body-sm">
          <input type="radio" name={`${uid}-d`} checked={uphold === false} onChange={() => setUphold(false)} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">Clear</span>
            <span className="block text-caption text-text-secondary">{hints.clear}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-body-sm">
          <input type="radio" name={`${uid}-d`} checked={uphold === true} onChange={() => setUphold(true)} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">Uphold</span>
            <span className="block text-caption text-text-secondary">{hints.uphold}</span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-reason`} className="text-body-sm font-semibold">
          Reason
        </label>
        <Textarea id={`${uid}-reason`} rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required />
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Save decision
      </Button>
    </form>
  );
}

/** Add an exam period for one university: at most 45 days, never overlapping another. */
export function ExamPeriodForm({ universities }: { universities: { id: string; name: string }[] }) {
  const uid = useId();
  const router = useRouter();
  const [university, setUniversity] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          setSaved(false);
          const result = await addExamPeriod({ university, starts, ends, why: reason });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setSaved(true);
          setStarts("");
          setEnds("");
          setReason("");
          router.refresh();
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-u`} className="text-body-sm font-semibold">
          University
        </label>
        <select id={`${uid}-u`} value={university} onChange={(e) => setUniversity(e.currentTarget.value)} required className={cn(controlBase, "h-10")}>
          <option value="">Choose a university</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-s`} className="text-body-sm font-semibold">
            First day
          </label>
          <Input id={`${uid}-s`} type="date" value={starts} onChange={(e) => setStarts(e.currentTarget.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-e`} className="text-body-sm font-semibold">
            Last day
          </label>
          <Input id={`${uid}-e`} type="date" value={ends} min={starts || undefined} onChange={(e) => setEnds(e.currentTarget.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-r`} className="text-body-sm font-semibold">
          Reason
        </label>
        <p id={`${uid}-rh`} className="text-caption text-text-secondary">
          Where the dates come from, e.g. &ldquo;Fall 2026 mid-terms, from the registrar&rsquo;s calendar&rdquo;. Recorded in the audit log.
        </p>
        <Textarea id={`${uid}-r`} aria-describedby={`${uid}-rh`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Add exam period
        </Button>
        {saved ? (
          <p role="status" className="text-body-sm text-text-secondary">
            Added. Decay pauses on these days from the next nightly run.
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Removing takes a reason too: decay for those days comes back from the next nightly run. */
export function RemoveExamPeriod({ id, label }: { id: string; label: string }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`}>
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent title="Remove this exam period?" description={`${label}. Those days count toward decay again from the next nightly run.`}>
        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor={`${uid}-r`} className="text-body-sm font-semibold">
            Reason
          </label>
          <Textarea id={`${uid}-r`} rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep it</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await removeExamPeriod(id, reason);
                if (result.ok) {
                  setOpen(false);
                  router.refresh();
                } else {
                  setError(result.message);
                }
              })
            }
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
