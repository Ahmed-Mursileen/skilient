"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, FieldError, Input, Label, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { claimAppeal, decideAppeal, fileAppealForUser } from "@/lib/actions/ops/sanctions";
import { APPEAL_TYPES } from "@/lib/ops/appeals";
import { cn } from "@/lib/cn";

export function AppealClaimButton({ id, claimed }: { id: string; claimed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={claimed ? "ghost" : "primary"}
        loading={pending}
        className="self-start"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await claimAppeal(id, !claimed);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {claimed ? "Release" : "Claim"}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

/** Uphold or overturn. Final: the appellant is told and nothing can change it afterwards. */
export function DecideAppealForm({ id }: { id: string }) {
  const uid = useId();
  const [outcome, setOutcome] = useState<"upheld" | "overturned" | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await decideAppeal(id, outcome, reason);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        Decide
      </h2>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-semibold">Outcome</legend>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name={`${uid}-o`} checked={outcome === "upheld"} onChange={() => setOutcome("upheld")} className="mt-1 size-4" />
          <span>
            Uphold <span className="block text-body-sm text-text-secondary">The decision stands.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name={`${uid}-o`} checked={outcome === "overturned"} onChange={() => setOutcome("overturned")} className="mt-1 size-4" />
          <span>
            Overturn{" "}
            <span className="block text-body-sm text-text-secondary">
              Reverse it where it can be: lift the sanction, restore a removed post, remove the penalty, approve the credential or pass the check.
            </span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-r`}>Reason (the appellant reads it)</Label>
        <Textarea id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <p className="text-body-sm text-text-secondary">This is final. The appellant is told straight away.</p>
      <Button type="submit" loading={pending} className="self-start">
        Confirm decision
      </Button>
    </form>
  );
}

const TYPE_LABELS: Record<(typeof APPEAL_TYPES)[number], string> = {
  sanction: "Sanction (suspension, ban, warning, throttle)",
  report_case: "Moderation decision (report case)",
  cv_revocation: "Verified CV revocation",
  credential: "Credential rejection",
  code_check: "Code-check grade",
};

/** For a banned account, whose appeal arrives by email. */
export function FileAppealForm() {
  const uid = useId();
  const [type, setType] = useState<(typeof APPEAL_TYPES)[number]>("sanction");
  const [decisionId, setDecisionId] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
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
        setDone(false);
        startTransition(async () => {
          const result = await fileAppealForUser({ type, decisionId: decisionId.trim(), body, reason });
          if (result.ok) {
            setDone(true);
            setDecisionId("");
            setBody("");
            setReason("");
          } else setError(result.message);
        });
      }}
    >
      <h2 id={`${uid}-h`} className="text-h3">
        File an emailed appeal
      </h2>
      <p className="text-body-sm text-text-secondary">A banned account can&apos;t sign in to appeal. Copy in what they wrote; the appeal is theirs, and filing it is audited.</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {done ? <FormAlert tone="success">Filed. It is in the appeals queue.</FormAlert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-t`}>Decision</Label>
          <select id={`${uid}-t`} value={type} onChange={(e) => setType(e.target.value as typeof type)} className={cn(controlBase, "h-10")}>
            {APPEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-id`}>Decision id</Label>
          <Input id={`${uid}-id`} value={decisionId} onChange={(e) => setDecisionId(e.target.value)} autoComplete="off" maxLength={36} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-b`}>Their appeal</Label>
        <Textarea id={`${uid}-b`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-r`}>Reason for filing (where it came from)</Label>
        <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      </div>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        File appeal
      </Button>
    </form>
  );
}
