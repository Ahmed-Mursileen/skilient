"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { FormAlert } from "@/components/auth/form-alert";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui";
import { verifySignInCode } from "@/lib/actions/mfa";
import type { ActionError } from "@/lib/actions/result";

export function MfaForm({ next }: { next: string | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (next) form.set("next", next);
    setError(null);
    startTransition(async () => {
      const result = await verifySignInCode(form);
      if (result && !result.ok) {
        setError(result);
        setCode("");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <CodeInput id="code" label="Authenticator code" value={code} onChange={setCode} error={error?.fields?.code} autoFocus />
      <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6}>
        Continue
      </Button>
      <SignOutButton variant="ghost" label="Use a different account" />
    </form>
  );
}
