"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Field, Textarea } from "@/components/ui";
import { decideOrg, resolveSpamReview, reviewCompetition } from "@/lib/actions/ops/orgs";

/** Verify, reject, suspend or reinstate an organisation; a reason is needed to reject or suspend and is shown to the organisation. */
export function OrgDecisionForm({ orgId, status }: { orgId: string; status: "pending" | "verified" | "suspended" | "rejected" }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function decide(action: "verify" | "reject" | "suspend" | "reinstate") {
    setError(null);
    startTransition(async () => {
      const r = await decideOrg(orgId, action, reason);
      if (r.ok) {
        setReason("");
        router.refresh();
      } else setError(r.message);
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="org-decision">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id={`reason-${orgId}`} label="Reason (needed to reject or suspend; the organisation reads it)">
        <Textarea id={`reason-${orgId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {status === "pending" ? (
          <>
            <Button loading={pending} onClick={() => decide("verify")} data-testid="verify-org">Verify</Button>
            <Button variant="danger" loading={pending} onClick={() => decide("reject")} data-testid="reject-org">Reject</Button>
          </>
        ) : null}
        {status === "verified" ? <Button variant="danger" loading={pending} onClick={() => decide("suspend")} data-testid="suspend-org">Suspend</Button> : null}
        {status === "suspended" ? <Button loading={pending} onClick={() => decide("reinstate")} data-testid="reinstate-org">Reinstate</Button> : null}
      </div>
    </div>
  );
}

export function SpamReviewForm({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function resolve(action: "clear" | "suspend") {
    setError(null);
    startTransition(async () => {
      const r = await resolveSpamReview(id, action, reason);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id={`spam-${id}`} label="Reason">
        <Textarea id={`spam-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => resolve("clear")}>Clear</Button>
        <Button size="sm" variant="danger" loading={pending} onClick={() => resolve("suspend")}>Suspend organisation</Button>
      </div>
    </div>
  );
}

export function CompetitionReviewForm({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function review(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await reviewCompetition(id, approve, reason);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id={`cr-${id}`} label="Note (needed to reject; briefs that ask for free product work are rejected)">
        <Textarea id={`cr-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => review(true)} data-testid="approve-brief">Approve</Button>
        <Button size="sm" variant="danger" loading={pending} onClick={() => review(false)} data-testid="reject-brief">Reject</Button>
      </div>
    </div>
  );
}
