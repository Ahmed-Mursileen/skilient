"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { hidePost, muteUser } from "@/lib/actions/posts";

/**
 * "Not for me" and "Mute" on someone else's post (PRD 5.28). Either one folds the card
 * into a short notice with Undo; the feed leaves it out from then on.
 */
export function ViewerActions({
  postId,
  authorUsername,
  authorName,
  onChange,
}: {
  postId: string;
  authorUsername: string | null;
  authorName: string;
  onChange: (state: "hidden" | "muted" | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => ReturnType<typeof hidePost>, next: "hidden" | "muted") =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) onChange(next);
      else setError(result.message);
    });
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => hidePost(postId, true), "hidden")}>
        Not for me
      </Button>
      {authorUsername ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => muteUser(authorUsername, true), "muted")}>
          Mute {authorName.split(" ")[0]}
        </Button>
      ) : null}
      {error ? (
        <span role="alert" className="text-caption text-text-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** What's left of a card after hiding or muting, with Undo. */
export function FoldedPost({
  state,
  postId,
  authorUsername,
  authorName,
  onUndo,
}: {
  state: "hidden" | "muted";
  postId: string;
  authorUsername: string | null;
  authorName: string;
  onUndo: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-default px-4 py-3" role="status">
      <p className="text-body-sm text-text-secondary">
        {state === "hidden" ? "Hidden. You'll see fewer posts like this." : `You muted ${authorName}. Their posts won't appear in your feeds.`}
      </p>
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = state === "hidden" ? await hidePost(postId, false) : await muteUser(authorUsername ?? "", false);
            if (result.ok) onUndo();
          })
        }
      >
        Undo
      </Button>
    </div>
  );
}
