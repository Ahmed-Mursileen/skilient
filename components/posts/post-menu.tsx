"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, Field, Textarea } from "@/components/ui";
import { deletePost, editPost } from "@/lib/actions/posts";

/** Author controls: edit (first 15 minutes) and delete. */
export function PostMenu({ postId, body, canEdit, onDeleted }: { postId: string; body: string; canEdit: boolean; onDeleted?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [text, setText] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = (open: boolean) => {
    if (!open) {
      setMode(null);
      setError(null);
      setText(body);
    }
  };

  return (
    <div className="flex gap-1">
      {canEdit ? (
        <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>
          Edit
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => setMode("delete")}>
        Delete
      </Button>
      <Dialog open={mode === "edit"} onOpenChange={close}>
        <DialogContent title="Edit post" description="You can edit a post for 15 minutes after posting. It will show as edited.">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id={`edit-${postId}`} label="Post">
            <Textarea id={`edit-${postId}`} value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={2000} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await editPost(postId, text);
                  if (result.ok) {
                    setMode(null);
                    router.refresh();
                  } else setError(result.message);
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={mode === "delete"} onOpenChange={close}>
        <DialogContent title="Delete this post?" description="It's removed for everyone, with its images, votes and RSVPs. This can't be undone.">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deletePost(postId);
                  if (result.ok) {
                    setMode(null);
                    onDeleted?.();
                    router.refresh();
                  } else setError(result.message);
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
