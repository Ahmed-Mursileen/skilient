"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger, FieldError, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { liftSanction, sanctionOrg, sanctionUser } from "@/lib/actions/ops/sanctions";
import { cn } from "@/lib/cn";

const MOD_DAYS = [1, 2, 3, 5, 7];
const SUPER_DAYS = [1, 3, 7, 14, 30, 90];

/**
 * Warn, suspend or ban one account (PRD 5.26). Moderators see suspensions up to 7 days; only super
 * admins see longer suspensions and bans. SQL enforces both again.
 */
export function SanctionUserForm({ userId, name, caseId = null, superAdmin }: { userId: string; name: string; caseId?: string | null; superAdmin: boolean }) {
  const uid = useId();
  const [kind, setKind] = useState<"warn" | "suspend" | "ban">("suspend");
  const [days, setDays] = useState(3);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const kinds = superAdmin ? (["warn", "suspend", "ban"] as const) : (["warn", "suspend"] as const);
  const labels = { warn: "Warn", suspend: "Suspend", ban: "Ban" };
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await sanctionUser({ userId, kind, days: kind === "suspend" ? days : null, until: kind === "ban" && until ? until : null, reason, caseId });
          if (result.ok) {
            setDone(kind === "warn" ? `${name} was warned.` : kind === "suspend" ? `${name} is suspended for ${days} day${days === 1 ? "" : "s"}.` : `${name} is banned.`);
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Sanction {name}
      </h2>
      <p className="text-body-sm text-text-secondary">
        A suspension signs them out everywhere and leaves them able to read, appeal and delete their account.
        {superAdmin ? " A ban also blocks sign-in and revokes their verified CVs." : " Moderators suspend for up to 7 days."}
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">{done}</FormAlert> : null}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-body-sm font-semibold">Sanction</legend>
        {kinds.map((k) => (
          <label key={k} className="flex items-center gap-2 text-body">
            <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4" />
            {labels[k]}
          </label>
        ))}
      </fieldset>
      {kind === "suspend" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-days`}>How long</Label>
          <select id={`${uid}-days`} value={days} onChange={(e) => setDays(Number(e.target.value))} className={cn(controlBase, "h-10 max-w-xs")}>
            {(superAdmin ? SUPER_DAYS : MOD_DAYS).map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {kind === "ban" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-until`}>Ends on (leave empty for a permanent ban)</Label>
          <Input id={`${uid}-until`} type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="max-w-xs" />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-reason`}>Reason (the account owner reads it)</Label>
        <Textarea id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} required />
      </div>
      <Button type="submit" variant={kind === "warn" ? "secondary" : "danger"} loading={pending} className="self-start">
        {labels[kind]} {name}
      </Button>
    </form>
  );
}

/** Warn, throttle contact requests or suspend an organisation (accounts staff). */
export function OrgSanctionForm({ orgId, name }: { orgId: string; name: string }) {
  const uid = useId();
  const [kind, setKind] = useState<"warn" | "throttle" | "suspend">("throttle");
  const [days, setDays] = useState(14);
  const [perDay, setPerDay] = useState(3);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const labels = { warn: "Warn", throttle: "Throttle contact requests", suspend: "Suspend" };
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await sanctionOrg({ orgId, kind, days: kind === "throttle" ? days : null, perDay: kind === "throttle" ? perDay : null, reason });
          if (result.ok) {
            setDone("Done. The organisation's admins have been told.");
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Sanction {name}
      </h2>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">{done}</FormAlert> : null}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-body-sm font-semibold">Sanction</legend>
        {(["warn", "throttle", "suspend"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-body">
            <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4" />
            {labels[k]}
          </label>
        ))}
      </fieldset>
      {kind === "throttle" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-per`}>Contact requests a day</Label>
            <Input id={`${uid}-per`} type="number" min={1} max={50} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-days`}>For how many days (up to 90)</Label>
            <Input id={`${uid}-days`} type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-reason`}>Reason (the organisation&apos;s admins read it)</Label>
        <Textarea id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} required />
      </div>
      <Button type="submit" variant={kind === "warn" ? "secondary" : "danger"} loading={pending} className="self-start">
        {labels[kind]}
      </Button>
    </form>
  );
}

/** Lift one sanction with a reason. */
export function LiftSanctionButton({ id, label }: { id: string; label: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Lift ${label}`}>
          Lift
        </Button>
      </DialogTrigger>
      <DialogContent title="Lift this sanction?" description={`${label}. It stops applying straight away and they are told.`}>
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
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await liftSanction(id, reason);
                if (result.ok) setOpen(false);
                else setError(result.message);
              })
            }
          >
            Lift sanction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
