"use client";

import Link from "next/link";
import { useId, useState, useTransition, type FormEvent } from "react";
import { AgreementSheet } from "@/components/agreement/agreement-sheet";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { Turnstile } from "@/components/auth/turnstile";
import { Button, Checkbox, Field, FieldError, Input, Label } from "@/components/ui";
import { signUpRecruiter } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";
import type { Agreement } from "@/lib/data/agreement";

export function RecruiterSignupForm({ siteKey, agreement, defaultEmail }: { siteKey: string | null; agreement: Agreement | null; defaultEmail: string }) {
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const agreeId = useId();
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (token) form.set("turnstileToken", token);
    setError(null);
    startTransition(async () => {
      const result = await signUpRecruiter(form);
      // Success redirects to /signup/verify; anything returned is an error.
      if (result && !result.ok) {
        setError(result);
        setResetKey((k) => k + 1);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && !Object.keys(fields).length ? (
        <FormAlert requestId={error.requestId}>
          {error.message}{" "}
          {error.code === "already_registered" ? (
            <Link href="/signin" className="font-semibold underline underline-offset-4">
              Sign in
            </Link>
          ) : null}
        </FormAlert>
      ) : null}

      <Field id="fullName" label="Full name" error={fields.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required maxLength={60} aria-invalid={fields.fullName ? true : undefined} aria-describedby={fields.fullName ? "fullName-error" : undefined} />
      </Field>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@company.com"
          defaultValue={defaultEmail}
          readOnly={defaultEmail !== ""}
          aria-invalid={fields.email ? true : undefined}
          aria-describedby="email-status"
        />
        <div id="email-status" aria-live="polite">
          {fields.email ? <FieldError>{fields.email}</FieldError> : <p className="text-body-sm text-text-muted">Personal addresses like Gmail can&apos;t create a recruiter account.</p>}
        </div>
      </div>

      <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" meter error={fields.password} />

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id={agreeId}
            name="acceptAgreement"
            value="on"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            aria-invalid={fields.acceptAgreement ? true : undefined}
            aria-describedby={fields.acceptAgreement ? `${agreeId}-error` : undefined}
            className="mt-0.5"
          />
          <label htmlFor={agreeId} className="text-body-sm text-text-secondary">
            I agree to the{" "}
            {agreement ? (
              <AgreementSheet version={agreement.version} title={agreement.title} body={agreement.body}>
                <button type="button" className="font-semibold text-text-primary underline underline-offset-4">
                  Skilient User Agreement and Privacy Notice
                </button>
              </AgreementSheet>
            ) : (
              "Skilient User Agreement and Privacy Notice"
            )}
            .
          </label>
        </div>
        {fields.acceptAgreement ? <FieldError id={`${agreeId}-error`}>{fields.acceptAgreement}</FieldError> : null}
      </div>

      {siteKey ? <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} action="signup" /> : null}

      <Button type="submit" size="lg" loading={pending}>
        Create recruiter account
      </Button>
      <p className="text-center text-body-sm text-text-muted">
        A student or teacher?{" "}
        <Link href="/signup" className="font-semibold text-text-primary underline underline-offset-4">
          Sign up with your university email
        </Link>
      </p>
    </form>
  );
}
