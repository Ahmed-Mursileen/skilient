"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError, Input, Label, Textarea } from "@/components/ui";
import { forceGithubResync, recomputeSkills, resetTwoFactor, startViewAs } from "@/lib/actions/ops/users";

/** A staff action on one account that needs a reason (audited). */
export function ReasonAction({ kind, userId, label, title, description }: { kind: "resync" | "recompute"; userId: string; label: string; title: string; description: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="self-start">
            {label}
          </Button>
        </DialogTrigger>
        <DialogContent title={title} description={description}>
          <div className="mt-4 flex flex-col gap-1">
            <label htmlFor={`${uid}-r`} className="text-body-sm font-semibold">
              Reason
            </label>
            <Textarea id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
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
                  const result = kind === "resync" ? await forceGithubResync(userId, reason) : await recomputeSkills(userId, reason);
                  if (result.ok) {
                    setOpen(false);
                    setDone(true);
                    setReason("");
                  } else setError(result.message);
                })
              }
            >
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {done ? <p role="status" className="text-caption text-text-secondary">Done.</p> : null}
    </div>
  );
}

/** Starts a read-only, logged view; the user is told the date and the reason. */
export function StartViewAsForm({ userId, name }: { userId: string; name: string }) {
  const uid = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await startViewAs(userId, reason);
          if (result && !result.ok) setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        View as {name}
      </h2>
      <p className="text-body-sm text-text-secondary">
        Read-only, for one hour. {name} is told: &ldquo;Skilient support viewed your account on today&apos;s date for &lt;your reason&gt;&rdquo;. Chats are never shown.
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-r`}>Reason (they read it)</Label>
        <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="a support request about your score" />
      </div>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        Start viewing
      </Button>
    </form>
  );
}

/** Last resort: removes every authenticator and backup code after an identity check (super admins). */
export function ResetTwoFactorForm({ userId, name }: { userId: string; name: string }) {
  const uid = useId();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await resetTwoFactor(userId, note);
          if (result.ok) {
            setDone(true);
            setNote("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Reset two-factor
      </h2>
      <p className="text-body-sm text-text-secondary">
        Last resort, for someone who lost their authenticator and backup codes. Check it is them first (docs/recruiter-2fa-recovery.md). This removes every authenticator and
        backup code, signs {name} out everywhere and emails them.
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">Two-factor was reset and {name} has been emailed.</FormAlert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-n`}>Identity check: who asked, who confirmed, how and when</Label>
        <Textarea id={`${uid}-n`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <Button type="submit" variant="danger" loading={pending} className="self-start">
        Reset two-factor
      </Button>
    </form>
  );
}
