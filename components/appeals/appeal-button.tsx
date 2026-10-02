"use client";

import { useId, useState, useTransition } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError, Textarea } from "@/components/ui";
import { submitAppeal } from "@/lib/actions/appeals";

/** Appeal one decision: a short explanation, once (PRD 5.26). */
export function AppealButton({ type, id, title }: { type: string; id: string; title: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Appeal: ${title}`}>
          Appeal
        </Button>
      </DialogTrigger>
      <DialogContent title="Appeal this decision" description={`${title}. A different Skilient staff member reviews it. You can appeal once, and their decision is final.`}>
        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor={`${uid}-b`} className="text-body-sm font-semibold">
            Why should it change?
          </label>
          <Textarea id={`${uid}-b`} value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} />
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await submitAppeal(type, id, body);
                if (result.ok) setOpen(false);
                else setError(result.message);
              })
            }
          >
            Send appeal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
