"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { FieldError, HelperText, Input, Label } from "@/components/ui";
import { checkUsername } from "@/lib/actions/profile";
import { USERNAME_HINT, USERNAME_RE } from "@/lib/profile/options";

type Status = { kind: "idle" | "checking" | "available" | "yours" } | { kind: "error"; message: string };

/** Username with a live availability check (PRD 5.27 step 2). The server re-checks on save. */
export function UsernameField({ defaultValue, error }: { defaultValue?: string | null; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [status, setStatus] = useState<Status>({ kind: defaultValue ? "yours" : "idle" });

  useEffect(() => {
    const name = value.trim().toLowerCase();
    if (!name || name === defaultValue) return;
    if (!USERNAME_RE.test(name)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus({ kind: "checking" });
      const result = await checkUsername(name);
      if (cancelled) return;
      if (!result.ok) setStatus({ kind: "error", message: result.message });
      else setStatus(result.data.available ? { kind: "available" } : { kind: "error", message: "That username is taken. Try another." });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, defaultValue]);

  const name = value.trim().toLowerCase();
  const formatError = name && !USERNAME_RE.test(name) ? USERNAME_HINT : null;
  const shown = error ?? formatError ?? (status.kind === "error" ? status.message : null);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="username">Username</Label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-text-muted">
          @
        </span>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={30}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toLowerCase());
            setStatus({ kind: "idle" });
          }}
          aria-invalid={shown ? true : undefined}
          aria-describedby="username-status"
          className="pl-7"
        />
      </div>
      <div id="username-status" aria-live="polite">
        {shown ? (
          <FieldError>{shown}</FieldError>
        ) : status.kind === "available" ? (
          <p className="flex items-center gap-1 text-body-sm text-text-primary">
            <CheckCircle aria-hidden weight="bold" className="size-4 text-success" />
            Available
          </p>
        ) : status.kind === "checking" ? (
          <HelperText>Checking…</HelperText>
        ) : (
          <HelperText>{USERNAME_HINT} This is your profile link.</HelperText>
        )}
      </div>
    </div>
  );
}
