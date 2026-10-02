"use client";

import { Buildings, GoogleLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { AgreementSheet } from "@/components/agreement/agreement-sheet";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { Turnstile } from "@/components/auth/turnstile";
import { Button, Checkbox, Field, FieldError, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { signUp, startGoogleSignIn } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";
import { detectionMessage, detectUniversity } from "@/lib/auth/email-domain";
import type { Agreement } from "@/lib/data/agreement";
import { useDomainDirectory } from "@/lib/hooks/use-domain-directory";

export function SignupForm({
  siteKey,
  agreement,
  role = "student",
  defaultEmail = "",
}: {
  siteKey: string | null;
  agreement: Agreement | null;
  role?: "student" | "faculty" | "university_admin";
  /** Prefilled from the landing page's email field (?email=). */
  defaultEmail?: string;
}) {
  const directory = useDomainDirectory();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [showPickerNote, setShowPickerNote] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const [googlePending, startGoogle] = useTransition();
  const agreeId = useId();

  const detection = useMemo(
    () => (directory ? detectUniversity(email, directory, { requireLive: role !== "university_admin" }) : null),
    [email, directory, role],
  );
  const owners = detection?.kind === "match" ? detection.universities : [];
  const shared = owners.length > 1;
  const chosen = owners.find((u) => u.id === universityId) ?? (owners.length === 1 ? owners[0] : undefined);
  const liveEmailError = detection ? detectionMessage(detection) : null;
  const fields = error?.fields ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (token) form.set("turnstileToken", token);
    if (chosen) form.set("universityId", chosen.id);
    form.set("role", role);
    setError(null);
    startTransition(async () => {
      const result = await signUp(form);
      // Success redirects to /signup/verify; anything returned is an error.
      if (result && !result.ok) {
        setError(result);
        setResetKey((k) => k + 1);
      }
    });
  }

  function onGoogle() {
    if (!agreed) {
      setError({ ok: false, code: "invalid_input", message: "Accept the User Agreement first.", fields: { acceptAgreement: "Accept the User Agreement to continue." } });
      return;
    }
    const form = new FormData();
    form.set("acceptAgreement", "on");
    if (email) form.set("email", email);
    setError(null);
    startGoogle(async () => {
      const result = await startGoogleSignIn(form);
      if (result && !result.ok) setError(result);
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
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          maxLength={60}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={fields.fullName ? true : undefined}
          aria-describedby={fields.fullName ? "fullName-error" : undefined}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">University email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@university.edu.pk"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setUniversityId("");
            setShowPickerNote(false);
          }}
          aria-invalid={fields.email || (liveEmailError && detection?.kind !== "invalid") ? true : undefined}
          aria-describedby="email-status"
        />
        <div id="email-status" aria-live="polite">
          {fields.email ? (
            <FieldError>{fields.email}</FieldError>
          ) : liveEmailError && detection?.kind !== "invalid" ? (
            <FieldError>
              {liveEmailError}
              {detection?.kind === "not_live" || detection?.kind === "unknown" ? (
                <>
                  {" "}
                  <Link href={`/request-university?email=${encodeURIComponent(email.trim())}`} className="font-semibold underline underline-offset-4">
                    Request it
                  </Link>
                </>
              ) : null}
            </FieldError>
          ) : chosen ? (
            <p className="flex items-start gap-1.5 text-body-sm text-text-secondary">
              <Buildings aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-text-muted" />
              <span>
                Signing up as {role === "faculty" ? "faculty" : role === "university_admin" ? "an official" : "a student"} of <strong className="font-semibold text-text-primary">{chosen.name}</strong>.{" "}
                {!shared ? (
                  <button
                    type="button"
                    onClick={() => setShowPickerNote((v) => !v)}
                    aria-expanded={showPickerNote}
                    className="font-semibold text-text-primary underline underline-offset-4"
                  >
                    Not your university?
                  </button>
                ) : null}
              </span>
            </p>
          ) : null}
          {showPickerNote && chosen && !shared ? (
            <p className="mt-2 text-body-sm text-text-muted">
              On Skilient, only {chosen.name} uses @{detection?.kind === "match" ? detection.domain : ""}. Sign up with
              the email your own university gave you.
            </p>
          ) : null}
        </div>
      </div>

      {shared ? (
        <div className="flex flex-col gap-2">
          <Label id="university-label">Your university</Label>
          <Select value={universityId} onValueChange={setUniversityId} name="universityId">
            <SelectTrigger aria-labelledby="university-label" aria-invalid={fields.universityId ? true : undefined}>
              <SelectValue placeholder="Choose your university" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-body-sm text-text-muted">More than one university uses this email domain.</p>
          {fields.universityId ? <FieldError>{fields.universityId}</FieldError> : null}
        </div>
      ) : null}

      <PasswordField
        id="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        meter
        error={fields.password}
      />

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

      <Button type="submit" size="lg" loading={pending} disabled={googlePending}>
        Create account
      </Button>

      {role === "university_admin" ? (
        <p className="text-center text-body-sm text-text-muted">
          University officials use their official email. Next you turn on two-factor sign-in and send your authorisation letter.
        </p>
      ) : role === "faculty" ? (
        <p className="text-center text-body-sm text-text-muted">
          Faculty sign up with their university email, then ask for the teacher role.{" "}
          <Link href="/signup" className="font-semibold text-text-primary underline underline-offset-4">
            I&apos;m a student
          </Link>
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 text-body-sm text-text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border-default" />
            or
            <span className="h-px flex-1 bg-border-default" />
          </div>

          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={onGoogle} loading={googlePending} disabled={pending}>
              <GoogleLogo aria-hidden weight="bold" className="size-5" />
              Continue with Google
            </Button>
            <p className="text-center text-body-sm text-text-muted">Only your university Google account works.</p>
            <p className="text-center text-body-sm text-text-muted">
              Teaching at a university?{" "}
              <Link href="/signup?role=faculty" className="font-semibold text-text-primary underline underline-offset-4">
                Sign up as faculty
              </Link>
            </p>
            <p className="text-center text-body-sm text-text-muted">
              Hiring?{" "}
              <Link href="/signup/recruiter" className="font-semibold text-text-primary underline underline-offset-4">
                Create a recruiter account
              </Link>
            </p>
          </div>
        </>
      )}
    </form>
  );
}
