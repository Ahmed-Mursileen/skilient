"use client";

import { useState, useTransition } from "react";
import { showUpgrade } from "@/components/billing/upgrade-sheet";
import { Button, FieldError } from "@/components/ui";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Starts a checkout: the server action prices it in SQL and returns the gateway's page (ours for the
 * simulated gateway). A fresh idempotency key per button means a double click opens one session.
 */
export function CheckoutButton({
  start,
  label,
  variant = "primary",
  testId,
  disabled,
}: {
  start: (key: string) => Promise<ActionResult<{ redirectUrl: string }>>;
  label: string;
  variant?: "primary" | "secondary";
  testId?: string;
  disabled?: boolean;
}) {
  const [key] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        disabled={pending || disabled}
        data-testid={testId}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await start(key);
            if (!r.ok) {
              if (!showUpgrade(r)) setError(r.message);
              return;
            }
            window.location.assign(r.data.redirectUrl);
          })
        }
      >
        {pending ? "Opening checkout…" : label}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
