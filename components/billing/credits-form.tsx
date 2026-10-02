"use client";

import { useId, useState } from "react";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { HelperText, Input, Label } from "@/components/ui";
import { startAddOnCheckout } from "@/lib/actions/billing";

/** Extra contact credits (5–100, valid 90 days). The price is computed by the database at checkout. */
export function CreditsForm({ currency, unitLabel }: { currency: "PKR" | "USD"; unitLabel: string }) {
  const id = useId();
  const [qty, setQty] = useState(10);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>Credits</Label>
        <Input id={id} type="number" min={5} max={100} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-32" data-testid="credits-qty" />
        <HelperText>{unitLabel} each, plus tax on PKR invoices. Valid 90 days.</HelperText>
      </div>
      <CheckoutButton
        label="Buy credits"
        variant="secondary"
        testId="buy-credits"
        start={(key) => startAddOnCheckout({ kind: "contact_credits", quantity: qty, jobId: null, currency, key })}
      />
    </div>
  );
}
