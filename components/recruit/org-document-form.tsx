"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, HelperText, Label } from "@/components/ui";
import { submitOrgDocument } from "@/lib/actions/org-document";
import { createClient } from "@/lib/supabase/client";

const MAX = 5 * 1024 * 1024;

/**
 * Optional business registration document for verification (PRD 5.26): a PDF up to 5 MB. Only the
 * organisation's admins and Skilient accounts staff can open it; a new upload replaces the old one.
 */
export function OrgDocumentForm({ orgId, uploadedLabel }: { orgId: string; uploadedLabel: string | null }) {
  const uid = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      data-testid="org-document-form"
      onSubmit={(e) => {
        e.preventDefault();
        const file = new FormData(e.currentTarget).get("document");
        setError(null);
        setDone(false);
        if (!(file instanceof File) || file.size === 0) return setError("Choose the document (a PDF).");
        if (file.type !== "application/pdf") return setError("Upload the document as a PDF.");
        if (file.size > MAX) return setError("Documents can be up to 5 MB.");
        startTransition(async () => {
          const path = `${orgId}/${crypto.randomUUID()}.pdf`;
          const upload = await createClient().storage.from("org-documents").upload(path, file, { contentType: "application/pdf", upsert: false });
          if (upload.error) return setError("Couldn't upload the document. Try again.");
          const result = await submitOrgDocument(path);
          if (!result.ok) return setError(result.message);
          setDone(true);
          router.refresh();
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Registration document
      </h2>
      <p className="text-body-sm text-text-secondary">
        Optional, and it speeds up verification: your business registration (SECP certificate or similar) as a PDF. Only your organisation&apos;s admins and Skilient&apos;s
        accounts team can open it.
      </p>
      {uploadedLabel ? <p className="text-body-sm">Uploaded {uploadedLabel}. A new upload replaces it.</p> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">Document received.</FormAlert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-f`}>PDF, up to 5 MB</Label>
        <input id={`${uid}-f`} name="document" type="file" accept="application/pdf" className="text-body-sm" aria-describedby={`${uid}-help`} />
        <HelperText id={`${uid}-help`}>Scan a paper certificate with your phone&apos;s PDF option.</HelperText>
      </div>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        Upload document
      </Button>
    </form>
  );
}
