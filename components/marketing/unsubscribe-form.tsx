"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useActionState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { requestUniversity as copy } from "@/content/marketing";
import { unsubscribeUniversityRequest } from "@/lib/actions/marketing";
import type { ActionResult } from "@/lib/actions/result";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(unsubscribeUniversityRequest, null);
  if (state?.ok) {
    return (
      <p role="status" className="flex items-start gap-2 text-body-lg" data-testid="request-unsubscribed">
        <CheckCircle aria-hidden weight="bold" className="mt-1 size-5 shrink-0 text-success" />
        <span>{copy.unsubscribed}</span>
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && !state.ok ? <FormAlert requestId={state.requestId}>{state.message}</FormAlert> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" variant="secondary" loading={pending} className="self-start">
        {copy.unsubscribeSubmit}
      </Button>
    </form>
  );
}
