"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui";
import type { ActionError, ActionResult } from "@/lib/actions/result";

/**
 * Wraps a step's fields: submits to the step's server action (which saves and moves on),
 * shows a submitting state, and passes field errors down.
 */
export function StepForm({
  action,
  submitLabel = "Continue",
  secondary,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel?: string;
  secondary?: ReactNode;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await action(form);
      if (result && !result.ok) setError(result);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {children(error?.fields ?? {})}
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        {secondary}
        <Button type="submit" size="lg" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
