"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Field, Input } from "@/components/ui";
import { createApiToken, createWebhook, deleteWebhook, revokeApiToken } from "@/lib/actions/recruit";
import { WEBHOOK_EVENTS } from "@/lib/recruit/constants";

/** Create a token: shown once here and never stored (only its hash is). */
export function TokenForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    setError(null);
    setToken(null);
    startTransition(async () => {
      const r = await createApiToken(name);
      if (r.ok) {
        setToken(r.data.token);
        form.reset();
        router.refresh();
      } else setError(r.message);
    });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {token ? (
        <FormAlert tone="success">
          Copy your token now; it is shown once and Skilient keeps only a hash.{" "}
          <span className="block font-mono text-code-sm break-all" data-testid="new-token">{token}</span>
        </FormAlert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field id="token-name" label="Token name" helper="For example, the ATS it is for.">
          <Input id="token-name" name="name" required maxLength={60} />
        </Field>
        <Button type="submit" loading={pending}>Create token</Button>
      </div>
    </form>
  );
}

export function RevokeTokenButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => revokeApiToken(id)} variant="danger" size="sm">
      Revoke
    </ActionButton>
  );
}

export function WebhookForm() {
  const router = useRouter();
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const url = String(new FormData(form).get("url") ?? "");
    setError(null);
    setSecret(null);
    startTransition(async () => {
      const r = await createWebhook(url, events);
      if (r.ok) {
        setSecret(r.data.secret);
        form.reset();
        router.refresh();
      } else setError(r.message);
    });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {secret ? (
        <FormAlert tone="success">
          Your signing secret is shown once. Each delivery carries <code className="font-mono text-code-sm">X-Skilient-Signature: t=&lt;unix time&gt;,v1=&lt;HMAC-SHA256&gt;</code> over <code className="font-mono text-code-sm">t.body</code>.{" "}
          <span className="block font-mono text-code-sm break-all" data-testid="new-secret">{secret}</span>
        </FormAlert>
      ) : null}
      <Field id="hook-url" label="Endpoint" helper="https only; a public host name, not an address.">
        <Input id="hook-url" name="url" type="url" required maxLength={300} placeholder="https://ats.example.com/skilient" />
      </Field>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Events</legend>
        {WEBHOOK_EVENTS.map((e) => (
          <label key={e} className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              className="size-4"
              checked={events.includes(e)}
              onChange={(ev) => setEvents((cur) => (ev.target.checked ? [...cur, e] : cur.filter((x) => x !== e)))}
            />
            <span className="font-mono text-code-sm">{e}</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" loading={pending} className="self-start">Add webhook</Button>
    </form>
  );
}

export function DeleteWebhookButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => deleteWebhook(id)} variant="danger" size="sm">
      Delete
    </ActionButton>
  );
}
