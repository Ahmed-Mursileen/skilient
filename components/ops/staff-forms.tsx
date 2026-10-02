"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { grantStaffRole, revokeStaffRole } from "@/lib/actions/ops/staff";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/ops/nav";

/** Grant a role to an existing account (it must already have two-factor on). */
export function GrantRoleForm() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("moderator");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await grantStaffRole(email, role, reason);
          if (result.ok) {
            setDone(`${ROLE_LABELS[role]} granted to ${email.trim().toLowerCase()}.`);
            setEmail("");
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Grant a role
      </h2>
      <p className="text-body-sm text-text-secondary">The account must already exist and have two-factor on. Roles only count on a two-factor session.</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">{done}</FormAlert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-email`}>Account email</Label>
          <Input id={`${uid}-email`} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-role`}>Role</Label>
          <select id={`${uid}-role`} value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={cn(controlBase, "h-10")}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-reason`}>Reason</Label>
        <Textarea id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} required />
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Grant role
      </Button>
    </form>
  );
}

/** Remove one role, with a reason. SQL keeps at least one super admin and never your own. */
export function RevokeRoleButton({ userId, name, role }: { userId: string; name: string; role: StaffRole }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = `${ROLE_LABELS[role]} from ${name}`;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`}>
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent title="Remove this role?" description={`${label}. It stops working on their next request.`}>
        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor={`${uid}-r`} className="text-body-sm font-semibold">
            Reason
          </label>
          <Textarea id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} />
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep it</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await revokeStaffRole(userId, role, reason);
                if (result.ok) setOpen(false);
                else setError(result.message);
              })
            }
          >
            Remove role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
