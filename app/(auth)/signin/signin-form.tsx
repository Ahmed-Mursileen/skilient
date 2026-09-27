"use client";

import { GoogleLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { Turnstile } from "@/components/auth/turnstile";
import { Button, Field, Input } from "@/components/ui";
import { signIn, startGoogleSignIn } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";

export function SigninForm({
  siteKey,
  next,
  initialError,
}: {
  siteKey: string | null;
  next: string | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ActionError | null>(
    initialError ? { ok: false, code: "initial", message: initialError } : null,
  );
  // PRD 10: Turnstile appears after 5 failed attempts for this account or network.
  const [captcha, setCaptcha] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [googlePending, startGoogle] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (token) form.set("turnstileToken", token);
    if (next) form.set("next", next);
    setError(null);
    startTransition(async () => {
      const result = await signIn(form);
      if (!result || result.ok) return;
      if (result.hints?.verify) {
        router.push("/signup/verify");
        return;
      }
      if (result.hints?.captcha) setCaptcha(true);
      setResetKey((k) => k + 1);
      setPassword("");
      setError(result);
    });
  }

  function onGoogle() {
    const form = new FormData();
    if (next) form.set("next", next);
    if (email) form.set("email", email);
    setError(null);
    startGoogle(async () => {
      const result = await startGoogleSignIn(form);
      if (result && !result.ok) setError(result);
    });
  }

  const fields = error?.fields ?? {};
  return (
    <div className="flex flex-col gap-5">
      <Button type="button" variant="secondary" size="lg" onClick={onGoogle} loading={googlePending} disabled={pending}>
        <GoogleLogo aria-hidden weight="bold" className="size-5" />
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-body-sm text-text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border-default" />
        or with your email
        <span className="h-px flex-1 bg-border-default" />
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {error && !Object.keys(fields).length ? (
          <FormAlert requestId={error.requestId}>
            {error.message}{" "}
            {error.code === "locked" ? (
              <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
                Reset password
              </Link>
            ) : null}
          </FormAlert>
        ) : null}

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

        <div className="flex flex-col gap-2">
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" error={fields.password} />
          <Link href="/forgot-password" className="self-end text-body-sm font-semibold text-text-primary underline underline-offset-4">
            Forgot password?
          </Link>
        </div>

        {captcha && siteKey ? <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} action="signin" /> : null}

        <Button type="submit" size="lg" loading={pending} disabled={googlePending || (captcha && !!siteKey && !token)}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
