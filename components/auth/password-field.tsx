"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { useId, useState } from "react";
import { FieldError, HelperText, Input, Label } from "@/components/ui";
import { passwordStrength, PASSWORD_MIN } from "@/lib/auth/password";
import { cn } from "@/lib/cn";

/** Password input with show/hide and, for new passwords, a strength meter (text + bar). */
export function PasswordField({
  id,
  name = "password",
  label = "Password",
  value,
  onChange,
  error,
  autoComplete,
  meter = false,
}: {
  id: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: "current-password" | "new-password";
  meter?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const meterId = useId();
  const strength = passwordStrength(value);
  const describedBy = [error ? `${id}-error` : null, meter ? meterId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={meter ? PASSWORD_MIN : undefined}
          maxLength={128}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-sm text-text-muted hover:text-text-primary"
        >
          {visible ? <EyeSlash aria-hidden className="size-4" weight="bold" /> : <Eye aria-hidden className="size-4" weight="bold" />}
        </button>
      </div>
      {meter ? (
        <div id={meterId} className="flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={cn(
                  "h-1 flex-1 rounded-full bg-bg-muted transition-colors duration-[120ms]",
                  value && strength.score >= n && (strength.score === 1 ? "bg-error" : strength.score === 2 ? "bg-warning" : "bg-success"),
                )}
              />
            ))}
          </div>
          <HelperText className="shrink-0">
            {value ? strength.label : `At least ${PASSWORD_MIN} characters`}
          </HelperText>
        </div>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}
