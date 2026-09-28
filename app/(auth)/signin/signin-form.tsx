"use client";

import { GoogleLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
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
  // Turnstile appears after 3 wrong passwords for this account (5 for a network); from the
  // 10th, a wait of a few seconds. Never a lockout: the emailed code always works.
  const [captcha, setCaptcha] = useState(false);
  const [wait, setWait] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [googlePending, startGoogle] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const codeHref = (next ? `/signin/code?next=${encodeURIComponent(next)}` : "/signin/code") as "/signin/code";

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
      if (typeof result.hints?.retryAfter === "number") setWait(result.hints.retryAfter);
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
            {error.code === "slow_down" || error.code === "rate_limited" ? (
              <Link href={codeHref} className="font-semibold underline underline-offset-4">
                Email me a code
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

        <Button type="submit" size="lg" loading={pending} disabled={googlePending || wait > 0 || (captcha && !!siteKey && !token)}>
          {wait > 0 ? `Try again in ${wait}s` : "Sign in"}
        </Button>
        <Link href={codeHref} className="self-center text-body-sm font-semibold text-text-primary underline underline-offset-4">
          Email me a sign-in code instead
        </Link>
      </form>
    </div>
  );
}
