"use client";

import { GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui";
import { startGithubConnect } from "@/lib/actions/github";
import type { ActionError } from "@/lib/actions/result";

/** Sends the student to GitHub to install (or re-authorise) the Skilient App. */
export function ConnectGithubButton({
  returnTo,
  label = "Connect GitHub",
  size = "lg",
}: {
  returnTo: "onboarding" | "settings";
  label?: string;
  size?: "md" | "lg";
}) {
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert requestId={error.requestId}>{error.message}</FormAlert> : null}
      <Button
        type="button"
        size={size}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const form = new FormData();
            form.set("returnTo", returnTo);
            const result = await startGithubConnect(form);
            if (result && !result.ok) setError(result);
          })
        }
      >
        <GithubLogo aria-hidden weight="bold" className="size-5" />
        {label}
      </Button>
    </div>
  );
}
