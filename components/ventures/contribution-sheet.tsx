"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogTrigger, Field, Input, SheetContent, Textarea } from "@/components/ui";
import { correctContribution, logContribution } from "@/lib/actions/ventures";
import type { ActionError } from "@/lib/actions/result";
import type { Contribution, ContributionKind } from "@/lib/data/ventures";
import { CONTRIBUTION_KINDS } from "@/lib/ventures/labels";

/**
 * Log a contribution, or correct your own within 24 hours (PRD 5.14). Nothing is edited in
 * place: a correction is a new entry that the timeline shows instead.
 */
export function ContributionSheet({
  ventureId,
  correcting,
  trigger,
}: {
  ventureId: string;
  /** The entry being corrected; absent when logging a new one. */
  correcting?: Contribution;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ContributionKind>(correcting?.kind ?? "code");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};
  const prefix = correcting ? `fix-${correcting.id.slice(0, 8)}` : "log";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hoursText = String(form.get("hours") ?? "").trim();
    const input = {
      kind,
      description: String(form.get("description") ?? ""),
      evidenceUrl: String(form.get("evidenceUrl") ?? ""),
      hours: hoursText ? Number(hoursText) : null,
    };
    setError(null);
    startTransition(async () => {
      const result = correcting ? await correctContribution(ventureId, correcting.id, input) : await logContribution(ventureId, input);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  const describedBy = (name: string, helper?: boolean) => (fields[name] ? `${prefix}-${name}-error` : helper ? `${prefix}-${name}-helper` : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <SheetContent
        title={correcting ? "Correct your entry" : "Log a contribution"}
        description={
          correcting
            ? "Your correction replaces what the timeline shows. The original stays on the record, and a teammate confirms the new version."
            : "What you did for the team. A teammate's confirmation makes it peer-verified. Entries can't be deleted; you can correct one for 24 hours."
        }
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label text-text-secondary uppercase">Kind of work</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {CONTRIBUTION_KINDS.map((k) => (
                <label key={k.value} className="flex items-center gap-2 text-body">
                  <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="size-4" />
                  {k.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id={`${prefix}-description`} label="What you did" error={fields.description}>
            <Textarea
              id={`${prefix}-description`}
              name="description"
              rows={4}
              maxLength={500}
              required
              defaultValue={correcting?.description}
              aria-invalid={fields.description ? true : undefined}
              aria-describedby={describedBy("description")}
            />
          </Field>
          <Field id={`${prefix}-evidenceUrl`} label="Evidence link (optional)" error={fields.evidenceUrl} helper="A commit, pull request, file or design link.">
            <Input
              id={`${prefix}-evidenceUrl`}
              name="evidenceUrl"
              type="url"
              inputMode="url"
              maxLength={500}
              placeholder="https://"
              defaultValue={correcting?.evidenceUrl ?? ""}
              aria-invalid={fields.evidenceUrl ? true : undefined}
              aria-describedby={describedBy("evidenceUrl", true)}
            />
          </Field>
          <Field id={`${prefix}-hours`} label="Hours (optional)" error={fields.hours}>
            <Input
              id={`${prefix}-hours`}
              name="hours"
              type="number"
              inputMode="decimal"
              min={0.25}
              max={100}
              step={0.25}
              defaultValue={correcting?.hours ?? ""}
              className="w-32"
              aria-invalid={fields.hours ? true : undefined}
              aria-describedby={describedBy("hours")}
            />
          </Field>
          <Button type="submit" loading={pending} className="self-start">
            {correcting ? "Save correction" : "Log contribution"}
          </Button>
        </form>
      </SheetContent>
    </Dialog>
  );
}
