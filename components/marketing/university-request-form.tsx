"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useActionState, useId, useState } from "react";
import { Turnstile } from "@/components/auth/turnstile";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { FieldError, HelperText, Input, Label } from "@/components/ui/field";
import { requestUniversity as copy } from "@/content/marketing";
import { requestUniversity, type RequestUniversityResult } from "@/lib/actions/marketing";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The "Request it" form (PRD 5.1), in the landing sheet and on /request-university. A server
 * action through useActionState, so it also posts with JavaScript off (Turnstile then can't
 * run, and production asks the visitor to turn JavaScript on). `university` is the known
 * university for the domain; without one the visitor types the name.
 */
export function UniversityRequestForm({
  defaultEmail = "",
  university,
  siteKey,
  idPrefix = "request",
}: {
  defaultEmail?: string;
  university: string | null;
  siteKey: string | null;
  idPrefix?: string;
}) {
  const [state, action, pending] = useActionState<ActionResult<RequestUniversityResult> | null, FormData>(requestUniversity, null);
  const [token, setToken] = useState<string | null>(null);
  const uid = useId();
  const id = (name: string) => `${idPrefix}-${name}-${uid}`;
  const fields = state && !state.ok ? (state.fields ?? {}) : {};

  if (state?.ok) {
    const name = state.data.university ?? university ?? "your university";
    return (
      <p role="status" className="flex items-start gap-2 text-body-lg" data-testid="request-done">
        <CheckCircle aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-success" />
        <span>{state.data.status === "exists" ? copy.already.replace("{name}", name) : copy.sent}</span>
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" data-testid="request-form" noValidate>
      {state && !state.ok && !Object.keys(fields).length ? <FormAlert requestId={state.requestId}>{state.message}</FormAlert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("email")}>{copy.email}</Label>
        <Input
          id={id("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={defaultEmail}
          aria-invalid={fields.email ? true : undefined}
          aria-describedby={fields.email ? id("email-error") : undefined}
        />
        {fields.email ? <FieldError id={id("email-error")}>{fields.email}</FieldError> : null}
      </div>
      {university ? (
        <p className="text-body text-text-secondary">
          Requesting <strong className="font-semibold text-text-primary">{university}</strong>.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("name")}>{copy.universityName}</Label>
          <Input
            id={id("name")}
            name="universityName"
            required
            maxLength={200}
            autoComplete="organization"
            aria-invalid={fields.universityName ? true : undefined}
            aria-describedby={fields.universityName ? id("name-error") : id("name-help")}
          />
          {fields.universityName ? (
            <FieldError id={id("name-error")}>{fields.universityName}</FieldError>
          ) : (
            <HelperText id={id("name-help")}>{copy.universityNameHelp}</HelperText>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 text-body">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 size-5 shrink-0 rounded-sm"
            aria-invalid={fields.consent ? true : undefined}
            aria-describedby={fields.consent ? id("consent-error") : undefined}
          />
          <span>{copy.consent}</span>
        </label>
        {fields.consent ? <FieldError id={id("consent-error")}>{fields.consent}</FieldError> : null}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name="turnstileToken" value={token ?? ""} />
      {siteKey ? <Turnstile siteKey={siteKey} onToken={setToken} action="request_university" /> : null}
      <Button type="submit" size="lg" loading={pending} className="self-start active:scale-[0.98]">
        {copy.submit}
      </Button>
    </form>
  );
}
