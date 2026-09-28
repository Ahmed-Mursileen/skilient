"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, FieldError, HelperText, Input, Label } from "@/components/ui";
import { sendFriendRequest } from "@/lib/actions/friends";

/** /friends: send a request by exact username (PRD 5.8). A leading "@" is fine. */
export function AddByUsername() {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const username = value.trim().replace(/^@/, "");
        if (!username) {
          setMessage({ tone: "error", text: "Enter a username." });
          return;
        }
        startTransition(async () => {
          setMessage(null);
          const result = await sendFriendRequest(username);
          if (result.ok) {
            setValue("");
            setMessage({
              tone: "ok",
              text: result.data.status === "accepted" ? `You and @${username} are now friends.` : `Request sent to @${username}.`,
            });
            router.refresh();
          } else {
            setMessage({ tone: "error", text: result.message });
          }
        });
      }}
    >
      <Label htmlFor={id}>Add a friend by username</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          name="username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="@username"
          aria-invalid={message?.tone === "error" || undefined}
          aria-describedby={message ? `${id}-msg` : undefined}
          className="h-11 min-w-0 flex-1"
        />
        <Button type="submit" loading={busy}>
          Send request
        </Button>
      </div>
      {message?.tone === "error" ? <FieldError id={`${id}-msg`}>{message.text}</FieldError> : null}
      {message?.tone === "ok" ? (
        <HelperText id={`${id}-msg`} className="text-text-secondary">
          <span role="status">{message.text}</span>
        </HelperText>
      ) : null}
    </form>
  );
}
