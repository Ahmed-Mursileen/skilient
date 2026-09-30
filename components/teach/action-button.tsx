"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { FieldError } from "@/components/ui";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";

/**
 * One button for one server action (passed already bound to its arguments). Shows the action's
 * message if it is refused and refreshes the page when it works.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "md",
  className,
  testId,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
  testId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={pending}
        className={className}
        data-testid={testId}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await action();
            if (result && !result.ok) setError(result.message);
            else router.refresh();
          })
        }
      >
        {children}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </span>
  );
}
