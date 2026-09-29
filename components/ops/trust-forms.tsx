"use client";

import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, FieldError, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { claimRankingFlag } from "@/lib/actions/ops/ranking";
import { claimCodeCheck, claimCredential, claimReviewFlag, resolveReviewFlag, reviewCredential } from "@/lib/actions/ops/trust";
import { cn } from "@/lib/cn";

/** Claim before deciding, so two reviewers never work the same item (PRD 5.26). */
export function TrustClaimButton({ kind, id, claimed }: { kind: "credential" | "flag" | "code_check" | "ranking_flag"; id: string; claimed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={claimed ? "ghost" : "primary"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result =
              kind === "credential"
                ? await claimCredential(id, !claimed)
                : kind === "code_check"
                  ? await claimCodeCheck(id, !claimed)
                  : kind === "ranking_flag"
                    ? await claimRankingFlag(id, !claimed)
                    : await claimReviewFlag(Number(id), !claimed);
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

/** Approve (optionally as a recognised issuer) or reject, always with a reason the student reads. */
export function CredentialReviewForm({
  id,
  issuers,
  suggested,
}: {
  id: string;
  issuers: { id: string; name: string }[];
  suggested: string | null;
}) {
  const uid = useId();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [issuer, setIssuer] = useState(suggested ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!decision) {
          setError("Choose approve or reject.");
          return;
        }
        startTransition(async () => {
          setError(null);
          const result = await reviewCredential(id, decision === "approve", reason, decision === "approve" ? issuer || null : null);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-semibold">Decision</legend>
        <label className="flex items-start gap-2 text-body-sm">
          <input type="radio" name={`${uid}-d`} checked={decision === "approve"} onChange={() => setDecision("approve")} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">Approve</span>
            <span className="block text-caption text-text-secondary">It shows on the profile and counts 40 points (1.5× for a recognised issuer).</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-body-sm">
          <input type="radio" name={`${uid}-d`} checked={decision === "reject"} onChange={() => setDecision("reject")} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">Reject</span>
            <span className="block text-caption text-text-secondary">The student reads your reason; the file is deleted after 30 days.</span>
          </span>
        </label>
      </fieldset>
      {decision === "approve" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-issuer`} className="text-body-sm font-semibold">
            Recognised issuer
          </label>
          <select id={`${uid}-issuer`} value={issuer} onChange={(e) => setIssuer(e.currentTarget.value)} className={cn(controlBase, "h-10")}>
            <option value="">Not a recognised issuer</option>
            {issuers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-reason`} className="text-body-sm font-semibold">
          Reason
        </label>
        <Textarea id={`${uid}-reason`} rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required />
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Save decision
      </Button>
    </form>
  );
}

/** Clear the held commits (they count again) or uphold the flag (they never count), with a note. */
export function FlagResolveForm({ id }: { id: number }) {
  const uid = useId();
  const [upheld, setUpheld] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (upheld === null) {
          setError("Choose clear or uphold.");
          return;
        }
        startTransition(async () => {
          setError(null);
          const result = await resolveReviewFlag(id, upheld, note);
          if (!result.ok) setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-semibold">Decision</legend>
        <label className="flex items-start gap-2 text-body-sm">
          <input type="radio" name={`${uid}-d`} checked={upheld === false} onChange={() => setUpheld(false)} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">Clear</span>
            <span className="block text-caption text-text-secondary">The commits count again (unless another open flag holds them).</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-body-sm">
          <input type="radio" name={`${uid}-d`} checked={upheld === true} onChange={() => setUpheld(true)} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">Uphold</span>
            <span className="block text-caption text-text-secondary">The commits are excluded for good. The student only sees that something was reviewed.</span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-note`} className="text-body-sm font-semibold">
          Reason
        </label>
        <Textarea id={`${uid}-note`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.currentTarget.value)} required />
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Save decision
      </Button>
    </form>
  );
}
