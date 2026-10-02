"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FieldError } from "@/components/ui";
import { simulatePayment } from "@/lib/actions/billing";

/**
 * The simulated gateway's page (decisions.md 2026-10-05). Each button produces the gateway's result as a
 * signed webhook to /api/billing/webhook/simulated: the real pipeline, with no money.
 */
export function SimulatedCheckout({ sessionId, recurringAllowed }: { sessionId: string; recurringAllowed: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const act = (outcome: "card" | "wallet" | "fail" | "cancel") =>
    startTransition(async () => {
      setError(null);
      const r = await simulatePayment({ sessionId, outcome });
      if (!r.ok) return setError(r.message);
      router.push(r.data.next as Route);
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button disabled={pending} onClick={() => act("card")} data-testid="sim-pay-card">
          Pay by card
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => act("wallet")} data-testid="sim-pay-wallet">
          Pay by wallet (JazzCash / Easypaisa)
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => act("fail")} data-testid="sim-pay-fail">
          Simulate a failed payment
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => act("cancel")} data-testid="sim-pay-cancel">
          Cancel
        </Button>
      </div>
      <ul className="list-disc pl-5 text-body-sm text-text-secondary">
        <li>{recurringAllowed ? "A card is saved for automatic renewal; you can cancel any time." : "A card pays this once; nothing is saved."}</li>
        <li>A wallet pays for this period only. Wallets can&apos;t renew themselves, so we remind you 7, 3 and 1 days before it ends.</li>
      </ul>
      {pending ? <p className="text-body-sm text-text-secondary" role="status">Sending the result to Skilient…</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
