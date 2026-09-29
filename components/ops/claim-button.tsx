"use client";

import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { claimCase } from "@/lib/actions/ops/moderation";

export function ClaimButton({ caseId, claimed }: { caseId: string; claimed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={claimed ? "ghost" : "primary"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await claimCase(caseId, !claimed);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {claimed ? "Release" : "Claim"}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
