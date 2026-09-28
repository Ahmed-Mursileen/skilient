"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Input } from "@/components/ui";
import { addVentureDeliverable } from "@/lib/actions/ventures";
import type { ActionError } from "@/lib/actions/result";

/** Members add a link to something the team made (a deployed app, a report, a repo release). */
export function DeliverableForm({ ventureId }: { ventureId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await addVentureDeliverable(ventureId, String(data.get("label") ?? ""), String(data.get("url") ?? ""));
      if (result.ok) {
        form.current?.reset();
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg border border-border-default p-4">
      <h2 className="text-h4">Add a deliverable</h2>
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="deliverable-label" label="Name" error={fields.label}>
        <Input
          id="deliverable-label"
          name="label"
          maxLength={80}
          required
          placeholder="e.g. Live app"
          aria-invalid={fields.label ? true : undefined}
          aria-describedby={fields.label ? "deliverable-label-error" : undefined}
        />
      </Field>
      <Field id="deliverable-url" label="Link" error={fields.url}>
        <Input
          id="deliverable-url"
          name="url"
          type="url"
          inputMode="url"
          maxLength={500}
          required
          placeholder="https://"
          aria-invalid={fields.url ? true : undefined}
          aria-describedby={fields.url ? "deliverable-url-error" : undefined}
        />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        Add deliverable
      </Button>
    </form>
  );
}
