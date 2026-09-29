"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { hideEndorsement } from "@/lib/actions/endorsements";

/** The endorsee hides an endorsement (or shows it again). */
export function HideEndorsementButton({ id, hidden, username, name }: { id: string; hidden: boolean; username: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        aria-label={`${hidden ? "Show" : "Hide"} ${name}'s endorsement`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await hideEndorsement(id, !hidden, username);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {hidden ? "Show" : "Hide"}
      </Button>
      {error ? (
        <p role="alert" className="text-body-sm text-text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
