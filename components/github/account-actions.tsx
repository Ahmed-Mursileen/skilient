"use client";

import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui";
import { disconnectGithub, resyncGithub } from "@/lib/actions/github";
import type { ActionError } from "@/lib/actions/result";

export function AccountActions({ syncing }: { syncing: boolean }) {
  const [error, setError] = useState<ActionError | null>(null);
  const [resyncing, startResync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={resyncing}
          disabled={syncing}
          onClick={() =>
            startResync(async () => {
              setError(null);
              const result = await resyncGithub();
              if (!result.ok) setError(result);
            })
          }
        >
          {syncing ? "Syncing…" : "Resync"}
        </Button>
        <Dialog open={open} onOpenChange={(value) => !disconnecting && setOpen(value)}>
          <DialogTrigger asChild>
            <Button variant="ghost">Disconnect</Button>
          </DialogTrigger>
          <DialogContent
            title="Disconnect GitHub?"
            description="Skilient's access is revoked on GitHub and your repository and commit data is deleted. Skills confirmed by teammates, teachers or code checks stay on your profile."
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={disconnecting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={disconnecting}
                onClick={() =>
                  startDisconnect(async () => {
                    setError(null);
                    const result = await disconnectGithub();
                    if (!result.ok) setError(result);
                    setOpen(false);
                  })
                }
              >
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
