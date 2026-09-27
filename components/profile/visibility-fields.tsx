"use client";

import { useState } from "react";
import { VISIBILITY, type Visibility } from "@/lib/profile/options";
import { cn } from "@/lib/cn";

/** PRD 5.4 visibility, enforced by RLS. Native radios, so arrow keys work. */
export function VisibilityFields({ defaultValue }: { defaultValue: Visibility }) {
  const [value, setValue] = useState<Visibility>(defaultValue);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-label text-text-secondary uppercase">Who can see my full profile</legend>
      {VISIBILITY.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors duration-[120ms]",
            value === o.value ? "border-primary bg-primary-subtle" : "border-border-default hover:bg-bg-subtle",
          )}
        >
          <input
            type="radio"
            name="visibility"
            value={o.value}
            checked={value === o.value}
            onChange={() => setValue(o.value)}
            className="mt-1 size-4"
          />
          <span>
            <span className="block text-body font-semibold">{o.label}</span>
            <span className="block text-body-sm text-text-secondary">{o.description}</span>
          </span>
        </label>
      ))}
      <p className="text-body-sm text-text-muted">Everyone signed in still sees your name, department and batch.</p>
    </fieldset>
  );
}
