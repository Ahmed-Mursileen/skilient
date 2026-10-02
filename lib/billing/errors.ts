/**
 * Paid-feature refusals (PRD 4b.4). SQL raises SQLSTATE PT402 (HTTP 402 through PostgREST) when the
 * caller's subject doesn't hold an entitlement; actions return `{ ok: false, code: "payment_required" }`
 * and the UI turns that into the upgrade sheet. Safe to import from client components.
 */
export const PAYMENT_REQUIRED = "payment_required";

export class PaymentRequiredError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

export function isPaymentRequiredCode(code: string | undefined | null): boolean {
  return code === "PT402";
}
