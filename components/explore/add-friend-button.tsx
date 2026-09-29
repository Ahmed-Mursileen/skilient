"use client";

import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { sendFriendRequest } from "@/lib/actions/friends";

/** "Add friend" on a search result; becomes "Request sent" (or "Friends" if they'd asked you). */
export function AddFriendButton({ username, name }: { username: string; name: string }) {
  const [state, setState] = useState<"none" | "pending" | "accepted">("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (state !== "none") {
    return <span className="text-caption font-semibold text-text-secondary">{state === "accepted" ? "Friends" : "Request sent"}</span>;
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        aria-label={`Add ${name} as a friend`}
        onClick={() =>
          startTransition(async () => {
            const result = await sendFriendRequest(username);
            if (result.ok) setState(result.data.status);
            else setError(result.message);
          })
        }
      >
        Add friend
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </span>
  );
}
