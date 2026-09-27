"use client";

import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui";
import { acceptAgreement } from "@/lib/actions/agreement";
import type { ActionError } from "@/lib/actions/result";

export function AcceptAgreementForm({ version, next }: { version: number; next: string | null }) {
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <SignOutButton label="Not now, sign out" variant="ghost" />
        <Button
          type="button"
          size="lg"
          loading={pending}
          onClick={() => {
            const form = new FormData();
            form.set("version", String(version));
            if (next) form.set("next", next);
            setError(null);
            startTransition(async () => {
              const result = await acceptAgreement(form);
              if (result && !result.ok) setError(result);
            });
          }}
        >
          I agree
        </Button>
      </div>
    </div>
  );
}
