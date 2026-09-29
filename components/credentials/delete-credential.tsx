"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError } from "@/components/ui";
import { deleteCredential } from "@/lib/actions/credentials";

/** Deleting takes the credential and its file away for good (it drops out of the score). */
export function DeleteCredential({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Delete ${title}`}>
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete this credential?" description={`${title} and its file are deleted. This can't be undone.`}>
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep it</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await deleteCredential(id);
                if (result.ok) {
                  setOpen(false);
                  router.refresh();
                } else {
                  setError(result.message);
                }
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
