"use client";

import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui";
import { signOutEverywhere } from "@/lib/actions/auth";
import type { ActionError } from "@/lib/actions/result";
import { clearClientState, hardNavigate, postAuthMessage } from "@/lib/auth/channel";

export function SignOutEverywhere() {
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger">Sign out of all devices</Button>
      </DialogTrigger>
      <DialogContent title="Sign out everywhere?" description="Every device, including this one, will need to sign in again.">
        {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await signOutEverywhere();
                if (!result.ok) {
                  setError(result);
                  return;
                }
                postAuthMessage("signed-out");
                clearClientState();
                hardNavigate("/");
              })
            }
          >
            Sign out everywhere
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
