"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Input } from "@/components/ui";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/actions/account";
import type { ActionError } from "@/lib/actions/result";

/** Ask for deletion: type your username, then a 14-day cooling-off starts. */
export function RequestDeletionForm({ username }: { username: string }) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<ActionError | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestAccountDeletion(typed);
      if (result.ok) router.refresh();
      else setError(result);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg border border-error p-5" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-h3">
        Delete my account
      </h2>
      {error && !fields.confirmation ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id={`${id}-confirm`} label={`Type your username, ${username}, to confirm`} error={fields.confirmation}>
        <Input
          id={`${id}-confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={fields.confirmation ? true : undefined}
          aria-describedby={fields.confirmation ? `${id}-confirm-error` : undefined}
          data-testid="delete-confirm"
        />
      </Field>
      <Button type="submit" variant="danger" loading={pending} disabled={typed.trim().toLowerCase() !== username} className="self-start" data-testid="delete-submit">
        Start the 14-day countdown
      </Button>
    </form>
  );
}

/** Cancel during the cooling-off: the account is restored exactly as it was. */
export function CancelDeletionButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        loading={pending}
        className="self-start"
        data-testid="delete-cancel"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await cancelAccountDeletion();
            if (result.ok) router.replace("/feed");
            else setError(result.message);
          })
        }
      >
        Keep my account
      </Button>
    </div>
  );
}
