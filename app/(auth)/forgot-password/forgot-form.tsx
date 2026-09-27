"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Input } from "@/components/ui";
import { requestPasswordReset } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";

export function ForgotForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(form);
      if (result.ok) setSentTo(email.trim());
      else setError(result);
    });
  }

  if (sentTo) {
    return (
      <FormAlert tone="success">
        If an account exists for <strong className="font-semibold">{sentTo}</strong>, we&apos;ve sent a reset link. It works
        for 15 minutes. Check spam if it doesn&apos;t arrive.
      </FormAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {expired && !error ? <FormAlert>That reset link has expired or was already used. Ask for a new one.</FormAlert> : null}
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="email" label="University email" error={error?.fields?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error?.fields?.email ? true : undefined}
          aria-describedby={error?.fields?.email ? "email-error" : undefined}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}
