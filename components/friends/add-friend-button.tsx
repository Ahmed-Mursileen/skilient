"use client";

import { Check, UserPlus } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { sendFriendRequest } from "@/lib/actions/friends";

/**
 * "Add friend" for lists (onboarding, later Explore): sends the request in place and
 * settles to "Request sent" or "Friends" (when they had already asked you).
 */
export function AddFriendButton({ username, fullName }: { username: string; fullName: string }) {
  const [state, setState] = useState<"idle" | "pending" | "accepted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (state !== "idle") {
    return (
      <span className="inline-flex items-center gap-1.5 text-body-sm text-text-secondary" role="status">
        <Check aria-hidden weight="bold" className="size-4" />
        {state === "accepted" ? "Friends" : "Request sent"}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        aria-label={`Add ${fullName} as a friend`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await sendFriendRequest(username);
            if (result.ok) setState(result.data.status);
            else setError(result.message);
          })
        }
      >
        <UserPlus aria-hidden weight="bold" className="size-4" />
        Add friend
      </Button>
      {error ? (
        <span role="alert" className="text-caption text-text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
