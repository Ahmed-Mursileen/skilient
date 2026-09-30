"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Textarea } from "@/components/ui";
import { submitFeedback } from "@/lib/actions/feedback";
import type { ActionError } from "@/lib/actions/result";
import { FEEDBACK_TYPES, TYPE_LABELS, type FeedbackType } from "@/lib/feedback/constants";
import { downscaleForUpload } from "@/lib/images/downscale";

/**
 * The feedback form (PRD 5.27): type, text and an optional screenshot. The page you came
 * from, your device and the app version are attached automatically (and said so here).
 */
export function FeedbackForm({ from }: { from?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<FeedbackType>("confusing");
  const [error, setError] = useState<ActionError | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};
  // The page the person was on when they pressed Feedback: ?from=, else the referrer, else this one.
  const [referrerPath] = useState(() => {
    try {
      const url = new URL(document.referrer);
      return url.origin === window.location.origin && url.pathname !== pathname ? url.pathname : null;
    } catch {
      return null;
    }
  });
  const page = from && from.startsWith("/") && !from.startsWith("//") ? from : (referrerPath ?? pathname);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);
    const data = new FormData(event.currentTarget);
    data.set("type", type);
    data.set("page", page);
    const shot = data.get("screenshot");
    startTransition(async () => {
      if (shot instanceof File && shot.size > 0) {
        try {
          data.set("screenshot", await downscaleForUpload(shot));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Use a JPEG, PNG or WebP image.";
          setError({ ok: false, code: "invalid_file", message, fields: { screenshot: message } });
          return;
        }
      } else {
        data.delete("screenshot");
      }
      const result = await submitFeedback(data);
      if (result.ok) {
        form.current?.reset();
        setType("confusing");
        setSent(true);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-lg border border-border-default bg-bg-surface p-5" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-h3">
        Send feedback
      </h2>
      {error && !Object.keys(fields).length ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      {sent ? <FormAlert tone="success">Thank you. We read every one, and you&apos;ll see its status below.</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">What kind is it?</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_TYPES.map((t) => (
            <label
              key={t}
              className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border-default px-4 text-body-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring"
            >
              <input type="radio" name="kind" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
              {TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={`${id}-body`} label="What happened, or what would help?" error={fields.body}>
        <Textarea
          id={`${id}-body`}
          name="body"
          rows={5}
          maxLength={2000}
          required
          aria-invalid={fields.body ? true : undefined}
          aria-describedby={fields.body ? `${id}-body-error` : undefined}
        />
      </Field>
      <Field id={`${id}-shot`} label="Screenshot (optional)" error={fields.screenshot} helper="JPEG, PNG or WebP up to 5 MB. Location data is removed.">
        <input
          id={`${id}-shot`}
          name="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={fields.screenshot ? true : undefined}
          aria-describedby={fields.screenshot ? `${id}-shot-error` : `${id}-shot-helper`}
          className="text-body-sm file:mr-3 file:h-10 file:rounded-md file:border file:border-border-default file:bg-bg-surface file:px-4 file:font-semibold"
        />
      </Field>
      <p className="text-caption text-text-secondary">
        We attach the page you&apos;re on ({page}), your browser and the app version. Nothing else.
      </p>
      <Button type="submit" loading={pending} className="self-start">
        Send
      </Button>
    </form>
  );
}
