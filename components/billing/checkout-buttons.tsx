"use client";

import { CheckoutButton } from "@/components/billing/checkout-button";
import { startAddOnCheckout, startInvoiceCheckout, startPlanCheckout } from "@/lib/actions/billing";

/** Checkout buttons bound to one plan, add-on or invoice; prices are never sent from here. */
export function PlanCheckoutButton(props: { subject: "user" | "org"; planId: string; currency: "PKR" | "USD"; label: string; testId?: string; variant?: "primary" | "secondary" }) {
  return (
    <CheckoutButton
      label={props.label}
      testId={props.testId}
      variant={props.variant}
      start={(key) => startPlanCheckout({ subject: props.subject, planId: props.planId, currency: props.currency, key })}
    />
  );
}

export function InvoiceCheckoutButton(props: { subject: "org" | "university"; invoiceId: string; label?: string; testId?: string }) {
  return (
    <CheckoutButton
      label={props.label ?? "Pay now"}
      testId={props.testId}
      variant="secondary"
      start={(key) => startInvoiceCheckout({ subject: props.subject, invoiceId: props.invoiceId, key })}
    />
  );
}

export function SponsorPostButton(props: { jobId: string; currency: "PKR" | "USD" }) {
  return (
    <CheckoutButton
      label="Sponsor for 14 days"
      variant="secondary"
      testId={`sponsor-${props.jobId}`}
      start={(key) => startAddOnCheckout({ kind: "sponsored_post", quantity: 1, jobId: props.jobId, currency: props.currency, key })}
    />
  );
}
