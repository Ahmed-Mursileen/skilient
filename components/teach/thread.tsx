"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Textarea } from "@/components/ui";
import { postSupervisorComment } from "@/lib/actions/teach";
import { cn } from "@/lib/cn";
import type { SupervisorThread } from "@/lib/data/teach";

/** The supervisor thread (PRD 5.21), separate from the team chat: the team and the supervisor only. */
export function SupervisorThreadView({ ventureId, thread, canPost }: { ventureId: string; thread: SupervisorThread; canPost: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await postSupervisorComment(ventureId, body);
      if (result.ok) {
        form.reset();
        router.refresh();
      } else setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {thread.comments.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No comments yet. The supervisor and the team write here; it is separate from the team chat.</p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="supervisor-thread">
          {thread.comments.map((c) => (
            <li key={c.id} className={cn("rounded-lg border p-3", c.supervisor ? "border-border-strong bg-bg-subtle" : "border-border-default bg-bg-surface")}>
              <p className="text-caption text-text-secondary">
                <span className="font-semibold text-text-primary">{c.authorName}</span>
                {c.supervisor ? " · Supervisor" : ""} · {c.dateLabel}
              </p>
              <p className="mt-1 text-body whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      {canPost ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <label htmlFor="thread-body" className="text-body-sm font-semibold">Add a comment</label>
          <Textarea id="thread-body" name="body" rows={3} maxLength={2000} required />
          <Button type="submit" loading={pending} className="self-start">Post</Button>
        </form>
      ) : null}
    </div>
  );
}
