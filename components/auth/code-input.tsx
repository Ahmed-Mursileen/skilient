"use client";

import { Field, Input } from "@/components/ui";

/** Single 6-digit code field: numeric keypad on phones, autofill from SMS/mail apps. */
export function CodeInput({
  id,
  label,
  value,
  onChange,
  error,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-12 text-center font-mono text-h3 tracking-[0.5em]"
      />
    </Field>
  );
}
