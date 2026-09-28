"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { FormAlert } from "@/components/auth/form-alert";
import { Turnstile } from "@/components/auth/turnstile";
import { Button, Field, Input } from "@/components/ui";
import { forgetSignInCode, requestSignInCode, resendSignInCode, verifyEmailSignInCode } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";

const RESEND_COOLDOWN = 60;

export function CodeRequestForm({ siteKey, next }: { siteKey: string | null; next: string | null }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (token) form.set("turnstileToken", token);
    if (next) form.set("next", next);
    setError(null);
    startTransition(async () => {
      const result = await requestSignInCode(form);
      if (result && !result.ok) {
        setError(result);
        setResetKey((k) => k + 1);
      }
    });
  }

  const fields = error?.fields ?? {};
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="email" label="University email" error={fields.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fields.email ? true : undefined}
          aria-describedby={fields.email ? "email-error" : undefined}
        />
      </Field>
      {siteKey ? <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} action="signin_code" /> : null}
      <Button type="submit" size="lg" loading={pending} disabled={!!siteKey && !token}>
        Email me a code
      </Button>
    </form>
  );
}

export function CodeVerifyForm({ next }: { next: string | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [pending, startTransition] = useTransition();
  const [resending, startResend] = useTransition();
  const [switching, startSwitch] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (next) form.set("next", next);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await verifyEmailSignInCode(form);
      if (result && !result.ok) setError(result);
    });
  }

  function onResend() {
    setError(null);
    setNotice(null);
    startResend(async () => {
      const result = await resendSignInCode();
      if (result.ok) {
        setNotice("We sent a new code. Older codes stop working.");
        setCode("");
        setCooldown(RESEND_COOLDOWN);
      } else {
        setError(result);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
      <CodeInput id="code" label="6-digit code" value={code} onChange={setCode} error={error?.fields?.code} autoFocus />
      <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6 || resending || switching}>
        Sign in
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-text-secondary">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => startSwitch(async () => void (await forgetSignInCode()))}
          loading={switching}
          disabled={pending}
        >
          Use a different email
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onResend} loading={resending} disabled={cooldown > 0 || pending}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </Button>
      </div>
    </form>
  );
}
