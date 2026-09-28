"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui";
import type { ActionError, ActionResult } from "@/lib/actions/result";

/**
 * A button that runs a bound server action, optionally behind a confirm dialog. Server pages
 * pass `action.bind(null, ...)`, so the ids travel as bound arguments and SQL re-checks them.
 */
export function ConfirmAction({
  action,
  label,
  confirm,
  confirmLabel,
  variant = "ghost",
  size = "sm",
  danger = false,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  confirm?: { title: string; description: string };
  confirmLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  danger?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result);
      }
    });

  if (!confirm) {
    return (
      <span className="inline-flex flex-col gap-2">
        <Button variant={variant} size={size} loading={pending} onClick={run}>
          {label}
        </Button>
        {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      </span>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={confirm.title} description={confirm.description}>
        {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={run}>
            {confirmLabel ?? label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
