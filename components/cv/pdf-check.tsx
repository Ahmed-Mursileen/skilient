"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, FieldError, HelperText } from "@/components/ui";

/**
 * "Check a PDF" (PRD 5.18): the file is hashed in the browser with Web Crypto and only its
 * SHA-256 goes to the server, which compares it with the PDFs exported under this code.
 */
export function PdfCheck({ code }: { code: string }) {
  const id = useId();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        setError(null);
        startTransition(async () => {
          try {
            const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
            const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
            router.push(`/verify/${code}?pdf=${hex}`);
          } catch {
            setError("We couldn't read that file. Try again.");
          }
        });
      }}
    >
      <label htmlFor={`${id}-file`} className="text-h4">
        Check a PDF you were sent
      </label>
      <input
        id={`${id}-file`}
        type="file"
        accept="application/pdf"
        aria-describedby={`${id}-help`}
        className="text-body-sm file:mr-3 file:rounded-md file:border file:border-border-default file:bg-bg-subtle file:px-3 file:py-1.5 file:text-body-sm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        data-testid="pdf-file"
      />
      <HelperText id={`${id}-help`}>The file stays on your device; only its fingerprint (SHA-256) is sent.</HelperText>
      <Button type="submit" variant="secondary" disabled={!file} loading={pending}>
        Check this PDF
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  );
}
