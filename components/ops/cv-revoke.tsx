"use client";

import { useId, useState, useTransition } from "react";
import { Button, FieldError, Textarea } from "@/components/ui";
import { opsRevokeCv } from "@/lib/actions/ops/cv";

/** Revoke one CV version, or every version of the student, with a reason (audited, student told). */
export function OpsCvRevoke({ id, code }: { id: string; code: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (done) return <p role="status">{done}</p>;
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Revoke…
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await opsRevokeCv(id, all, why);
          if (result.ok) setDone(result.data === 1 ? "Revoked." : `Revoked ${result.data} versions.`);
          else setError(result.message);
        });
      }}
    >
      <label htmlFor={`${uid}-why`} className="text-body-sm font-semibold">
        Reason (the audit log keeps it; the student isn&rsquo;t shown it)
      </label>
      <Textarea id={`${uid}-why`} value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={2000} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4" />
        Every version of this student, not only {code}
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" loading={pending}>
          Revoke
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  );
}
