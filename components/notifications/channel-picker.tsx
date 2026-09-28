"use client";

import { useState, useTransition } from "react";
import { FieldError } from "@/components/ui";
import { setNotificationPref } from "@/lib/actions/notifications";
import type { EmailChannel } from "@/lib/data/notifications";
import { cn } from "@/lib/cn";

const OPTIONS: { value: EmailChannel; label: string }[] = [
  { value: "instant_email", label: "Instant email" },
  { value: "digest", label: "Daily digest" },
  { value: "off", label: "Off" },
];

/** Email channel for one category; saves on change. In-app notifications always stay on. */
export function ChannelPicker({
  category,
  label,
  description,
  channel,
  allowInstant,
}: {
  category: string;
  label: string;
  description: string;
  channel: EmailChannel;
  allowInstant: boolean;
}) {
  const [value, setValue] = useState(channel);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const options = OPTIONS.filter((o) => allowInstant || o.value !== "instant_email");

  return (
    <fieldset className="flex flex-col gap-3 px-5 py-4" data-testid={`pref-${category}`} aria-busy={pending || undefined}>
      <legend className="sr-only">{label}</legend>
      <div aria-hidden>
        <p className="text-h4">{label}</p>
        <p className="text-body-sm text-text-secondary">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-body-sm font-semibold",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              value === o.value ? "border-primary bg-primary-subtle text-text-primary" : "border-border-default text-text-secondary hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name={`channel-${category}`}
              value={o.value}
              checked={value === o.value}
              className="sr-only"
              onChange={() => {
                const previous = value;
                setValue(o.value);
                setSaved(false);
                startTransition(async () => {
                  setError(null);
                  const result = await setNotificationPref(category, o.value);
                  if (result.ok) setSaved(true);
                  else {
                    setValue(previous);
                    setError(result.message);
                  }
                });
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
      <p role="status" className="min-h-5 text-caption text-text-secondary">
        {saved ? `Saved: ${OPTIONS.find((o) => o.value === value)?.label.toLowerCase()} for ${label.toLowerCase()}.` : ""}
      </p>
      {error ? <FieldError>{error}</FieldError> : null}
    </fieldset>
  );
}
