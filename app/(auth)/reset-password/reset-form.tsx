"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui";
import { resetPassword } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";

export function ResetForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await resetPassword(form);
      if (result && !result.ok) setError(result);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <PasswordField id="password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" meter error={error?.fields?.password} />
      <PasswordField id="confirm" name="confirm" label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" error={error?.fields?.confirm} />
      <Button type="submit" size="lg" loading={pending}>
        Save password
      </Button>
    </form>
  );
}
