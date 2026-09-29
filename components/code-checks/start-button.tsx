"use client";

import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { startCodeCheck } from "@/lib/actions/code-checks";

export function StartCodeCheck({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        loading={pending}
        className="self-start"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startCodeCheck(id);
            if (!result.ok) setError(result.message);
          })
        }
      >
        Start: show my code
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
