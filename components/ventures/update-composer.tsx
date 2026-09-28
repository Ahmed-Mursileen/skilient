"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Textarea } from "@/components/ui";
import { postVentureUpdate } from "@/lib/actions/ventures";
import type { ActionError } from "@/lib/actions/result";

/** Members post short progress updates (PRD 5.28 "Updates"). */
export function UpdateComposer({ ventureId }: { ventureId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body") ?? "");
    startTransition(async () => {
      setError(null);
      const result = await postVentureUpdate(ventureId, body);
      if (result.ok) {
        form.current?.reset();
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-3 rounded-lg border border-border-default p-4">
      {error && !error.fields ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Field id="update-body" label="Post an update" error={error?.fields?.body} helper="What the team shipped, learned or needs. Everyone who can see the venture reads it.">
        <Textarea
          id="update-body"
          name="body"
          rows={3}
          maxLength={2000}
          required
          aria-invalid={error?.fields?.body ? true : undefined}
          aria-describedby={error?.fields?.body ? "update-body-error" : "update-body-helper"}
        />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        Post update
      </Button>
    </form>
  );
}
