"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button, FieldError, HelperText, Input, Label, Textarea } from "@/components/ui";
import { submitClaim } from "@/lib/actions/uni";
import { createClient } from "@/lib/supabase/client";

const MAX = 5 * 1024 * 1024;

/** /uni/claim (PRD 5.23): title, an optional note and the authorisation letter or MoU as a PDF (5 MB). */
export function ClaimForm() {
  const id = useId();
  const user = useCurrentUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="claim-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const file = data.get("letter");
        setError(null);
        if (!(file instanceof File) || file.size === 0) return setError("Choose the letter (a PDF).");
        if (file.type !== "application/pdf") return setError("Upload the letter as a PDF. Scan it with your phone's PDF option if it's on paper.");
        if (file.size > MAX) return setError("Letters can be up to 5 MB.");
        if (!user) return setError("Your session expired. Sign in again.");
        startTransition(async () => {
          const path = `${user.id}/${crypto.randomUUID()}.pdf`;
          const upload = await createClient().storage.from("university-claims").upload(path, file, { contentType: "application/pdf", upsert: false });
          if (upload.error) return setError("Couldn't upload the letter. Try again.");
          const result = await submitClaim({ title: String(data.get("title") ?? ""), note: String(data.get("note") ?? ""), path });
          if (!result.ok) return setError(result.message);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-title`}>Your job title</Label>
        <Input id={`${id}-title`} name="title" required maxLength={80} placeholder="Registrar" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-note`}>Note for Skilient (optional)</Label>
        <Textarea id={`${id}-note`} name="note" rows={3} maxLength={1000} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-letter`}>Authorisation letter or signed MoU</Label>
        <input id={`${id}-letter`} name="letter" type="file" accept="application/pdf" aria-describedby={`${id}-help`} className="text-body" />
        <HelperText id={`${id}-help`}>A PDF up to 5 MB, on university letterhead, naming you. It is deleted 90 days after the decision.</HelperText>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div>
        <Button type="submit" loading={pending}>Send for verification</Button>
      </div>
    </form>
  );
}
