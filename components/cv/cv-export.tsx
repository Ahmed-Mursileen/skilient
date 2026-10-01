"use client";

import { useId, useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { CV_TEMPLATES, TEMPLATE_INFO, type CvTemplate } from "@/lib/cv/document";

/**
 * ATS PDF export (PRD 5.18, Student Pro; entitlement cv.pdf_export). The route prints the
 * current version, records its hash for Altered checks and returns a 60-second download link.
 */
export function CvExport({ recordId, canExport, canUseTemplates }: { recordId: string; canExport: boolean; canUseTemplates: boolean }) {
  const id = useId();
  const [template, setTemplate] = useState<CvTemplate>("standard");
  const [paper, setPaper] = useState<"a4" | "letter">("a4");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      {!canExport ? (
        <p className="text-body-sm text-text-secondary" data-testid="export-locked">
          ATS PDF export is a Student Pro feature, coming with plans. Your web CV and share links are free.
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-1" disabled={!canExport}>
        <legend className="mb-1 text-body-sm font-semibold">Template</legend>
        {CV_TEMPLATES.map((t) => {
          const locked = TEMPLATE_INFO[t].pro && !canUseTemplates;
          return (
            <label key={t} className="flex items-start gap-2 text-body">
              <input type="radio" name={`${id}-template`} value={t} checked={template === t} disabled={locked} onChange={() => setTemplate(t)} className="mt-1 size-4" />
              <span>
                {TEMPLATE_INFO[t].name}
                {TEMPLATE_INFO[t].pro ? <span className="text-text-secondary"> (Pro)</span> : null}
                <span className="block text-caption text-text-secondary">{TEMPLATE_INFO[t].description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="flex gap-4" disabled={!canExport}>
        <legend className="mb-1 text-body-sm font-semibold">Paper</legend>
        {(["a4", "letter"] as const).map((p) => (
          <label key={p} className="flex items-center gap-2 text-body">
            <input type="radio" name={`${id}-paper`} value={p} checked={paper === p} onChange={() => setPaper(p)} className="size-4" />
            {p === "a4" ? "A4" : "Letter"}
          </label>
        ))}
      </fieldset>
      <Button
        variant="secondary"
        disabled={!canExport}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setDone(null);
            const res = await fetch("/api/cv/pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recordId, template, paper }),
            }).catch(() => null);
            const body = (await res?.json().catch(() => null)) as { url?: string; message?: string } | null;
            if (!res?.ok || !body?.url) {
              setError(body?.message ?? "We couldn't make the PDF. Try again.");
              return;
            }
            setDone("Your PDF is ready. The download link works for one minute.");
            window.location.assign(body.url);
          })
        }
      >
        Export ATS PDF
      </Button>
      <p role="status" className="text-body-sm text-text-secondary">
        {pending ? "Making your PDF…" : (done ?? "")}
      </p>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
