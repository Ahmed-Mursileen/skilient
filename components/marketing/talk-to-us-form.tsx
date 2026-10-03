"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useActionState, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { FieldError, HelperText, Input, Label, Textarea } from "@/components/ui/field";
import { universitiesPage } from "@/content/marketing";
import { submitSalesLead } from "@/lib/actions/marketing";
import type { ActionResult } from "@/lib/actions/result";

const copy = universitiesPage.talk;

type Name = "name" | "role" | "organisation" | "email" | "message";

/**
 * "Talk to us" on /universities (PRD 5.1): a server action through useActionState, so it posts
 * with JavaScript off too. Honeypot, Turnstile and 5 an hour per network are checked on the server.
 */
export function TalkToUsForm({ siteKey }: { siteKey: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(submitSalesLead, null);
  const [token, setToken] = useState<string | null>(null);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};

  if (state?.ok) {
    return (
      <p role="status" className="flex items-start gap-2 text-body-lg" data-testid="talk-done">
        <CheckCircle aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-success" />
        <span>{copy.sent}</span>
      </p>
    );
  }

  const field = (name: Name, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, help?: string) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`talk-${name}`}>{label}</Label>
      <Input
        id={`talk-${name}`}
        name={name}
        required
        aria-invalid={fields[name] ? true : undefined}
        aria-describedby={fields[name] ? `talk-${name}-error` : help ? `talk-${name}-help` : undefined}
        {...props}
      />
      {fields[name] ? <FieldError id={`talk-${name}-error`}>{fields[name]}</FieldError> : help ? <HelperText id={`talk-${name}-help`}>{help}</HelperText> : null}
    </div>
  );

  return (
    <form action={action} className="flex flex-col gap-5" data-testid="talk-form" noValidate>
      {state && !state.ok && !Object.keys(fields).length ? <FormAlert requestId={state.requestId}>{state.message}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        {field("name", copy.name, { autoComplete: "name", maxLength: 80 })}
        {field("role", copy.role, { autoComplete: "organization-title", maxLength: 80 }, copy.roleHelp)}
      </div>
      {field("organisation", copy.organisation, { autoComplete: "organization", maxLength: 200 })}
      {field("email", copy.email, { type: "email", inputMode: "email", autoComplete: "email", maxLength: 254 })}
      <div className="flex flex-col gap-2">
        <Label htmlFor="talk-message">{copy.message}</Label>
        <Textarea
          id="talk-message"
          name="message"
          required
          rows={5}
          maxLength={2000}
          aria-invalid={fields.message ? true : undefined}
          aria-describedby={fields.message ? "talk-message-error" : undefined}
        />
        {fields.message ? <FieldError id="talk-message-error">{fields.message}</FieldError> : null}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name="turnstileToken" value={token ?? ""} />
      {siteKey ? <Turnstile siteKey={siteKey} onToken={setToken} action="sales_lead" /> : null}
      <Button type="submit" size="lg" loading={pending} className="self-start active:scale-[0.98]">
        {copy.submit}
      </Button>
    </form>
  );
}
