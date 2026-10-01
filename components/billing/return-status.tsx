"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle, Clock, WarningCircle } from "@phosphor-icons/react";
import { checkoutStatus } from "@/lib/actions/billing";

/**
 * The return page never trusts the gateway's redirect (PRD 4b.5): it asks the database every 2 seconds until
 * the webhook has been applied, for up to 60 seconds, then says we'll email when it's confirmed.
 */
export function ReturnStatus({ sessionId, initial, returnTo }: { sessionId: string; initial: string; returnTo: string }) {
  const [status, setStatus] = useState(initial);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (status !== "open") return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const r = await checkoutStatus(sessionId);
      if (r.ok && r.data !== "open") {
        setStatus(r.data);
        window.clearInterval(timer);
      } else if (Date.now() - started > 60_000) {
        setTimedOut(true);
        window.clearInterval(timer);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [sessionId, status]);

  const back = (
    <Link href={returnTo as Route} className="font-semibold underline underline-offset-4">
      Back to billing
    </Link>
  );
  if (status === "paid") {
    return (
      <div role="status" className="flex items-start gap-3" data-testid="checkout-result" data-status="paid">
        <CheckCircle aria-hidden weight="fill" className="mt-1 size-6 shrink-0 text-success" />
        <div><p className="text-h3">Payment confirmed</p><p className="text-text-secondary">Your plan is active now. {back}</p></div>
      </div>
    );
  }
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return (
      <div role="status" className="flex items-start gap-3" data-testid="checkout-result" data-status={status}>
        <WarningCircle aria-hidden weight="fill" className="mt-1 size-6 shrink-0 text-text-error" />
        <div>
          <p className="text-h3">{status === "failed" ? "The payment didn't go through" : status === "cancelled" ? "Checkout cancelled" : "This checkout expired"}</p>
          <p className="text-text-secondary">Nothing was charged. {back}</p>
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3" data-testid="checkout-result" data-status="open">
      <Clock aria-hidden className="mt-1 size-6 shrink-0 text-text-secondary" />
      <div>
        <p className="text-h3">{timedOut ? "Still confirming" : "Confirming your payment…"}</p>
        <p className="text-text-secondary">
          {timedOut ? <>We&apos;ll email you as soon as the payment is confirmed. {back}</> : "This usually takes a few seconds."}
        </p>
      </div>
    </div>
  );
}
