"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { FormAlert } from "@/components/auth/form-alert";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button, Field, Input } from "@/components/ui";
import { redeemBackupCode, verifySignInCode } from "@/lib/actions/mfa";
import type { ActionError } from "@/lib/actions/result";

export function MfaForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<"app" | "backup">("app");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (next) form.set("next", next);
    setError(null);
    startTransition(async () => {
      const result = mode === "app" ? await verifySignInCode(form) : await redeemBackupCode(form);
      if (result && !result.ok) {
        setError(result);
        if (mode === "app") setCode("");
      }
    });
  }

  function switchMode() {
    setError(null);
    setMode((m) => (m === "app" ? "backup" : "app"));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {mode === "app" ? (
        <CodeInput id="code" label="Authenticator code" value={code} onChange={setCode} error={error?.fields?.code} autoFocus />
      ) : (
        <>
          <Field id="backupCode" label="Backup code" error={error?.fields?.backupCode}>
            <Input
              id="backupCode"
              name="backupCode"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="xxxxx-xxxxx"
              className="font-mono"
              autoFocus
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              aria-invalid={error?.fields?.backupCode ? true : undefined}
              aria-describedby={error?.fields?.backupCode ? "backupCode-error" : undefined}
            />
          </Field>
          <p className="text-body-sm text-text-secondary">
            Using a backup code turns two-factor off. We&apos;ll email you, and you can set it up again in Settings.
          </p>
        </>
      )}
      <Button
        type="submit"
        size="lg"
        loading={pending}
        disabled={mode === "app" ? code.length !== 6 : backupCode.replace(/[\s-]/g, "").length !== 10}
      >
        Continue
      </Button>
      <Button type="button" variant="ghost" onClick={switchMode} disabled={pending}>
        {mode === "app" ? "Use a backup code instead" : "Use my authenticator app"}
      </Button>
      <SignOutButton variant="ghost" label="Use a different account" />
    </form>
  );
}
