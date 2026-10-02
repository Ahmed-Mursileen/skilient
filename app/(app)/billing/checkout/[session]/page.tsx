import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CreditCard, Flask } from "@phosphor-icons/react/dist/ssr";
import { SimulatedCheckout } from "@/components/billing/simulated-checkout";
import { money } from "@/lib/billing/constants";
import { getCheckoutSession, type CheckoutSession } from "@/lib/data/billing";
import { isRefusal } from "@/lib/data/rpc-json";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The simulated gateway's checkout (decisions.md 2026-10-05). Everything shown comes from the checkout session
 * in the database: the amount, tax and currency were computed there from `plans`, never from the browser.
 * Real gateways open their own hosted page instead.
 */
export default async function CheckoutPage({ params }: PageProps<"/billing/checkout/[session]">) {
  const { session } = await params;
  if (!UUID.test(session)) notFound();
  let c: CheckoutSession;
  try {
    c = await getCheckoutSession(session);
  } catch (e) {
    if (isRefusal(e, "P0002", "42501")) notFound();
    throw e;
  }
  if (c.gateway !== "simulated" || c.status !== "open") redirect(`/billing/return/${c.id}` as Route);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div className="flex flex-col gap-2">
        <p className="text-caption font-semibold text-text-secondary uppercase">Skilient checkout</p>
        <h1 className="font-display text-h1">Payment will be done on this screen</h1>
      </div>
      <p className="flex items-start gap-2 rounded-md border-2 border-warning bg-bg-surface px-4 py-3 text-body font-semibold" data-testid="test-mode-notice">
        <Flask aria-hidden weight="bold" className="mt-1 size-5 shrink-0" />
        <span>Test mode: no real money is charged.</span>
      </p>
      <section aria-labelledby="order-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5">
        <h2 id="order-h" className="flex items-center gap-2 text-h3">
          <CreditCard aria-hidden className="size-5" />
          {c.title}
        </h2>
        <table className="w-full text-body-sm">
          <caption className="sr-only">What you&apos;re paying for</caption>
          <tbody>
            {c.quote.lines.map((l, i) => (
              <tr key={i} className="border-b border-border-muted">
                <th scope="row" className="py-2 text-left font-normal">{l.description}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</th>
                <td className="py-2 text-right">{money(l.amount, c.currency)}</td>
              </tr>
            ))}
            {c.quote.tax_lines.map((t, i) => (
              <tr key={`t${i}`} className="border-b border-border-muted">
                <th scope="row" className="py-2 text-left font-normal">{t.label} ({(Number(t.rate) * 100).toFixed(0)}%)</th>
                <td className="py-2 text-right">{money(t.amount, c.currency)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 text-left">Total</th>
              <td className="py-2 text-right font-display text-h3" data-testid="checkout-amount">{money(c.amount, c.currency)}</td>
            </tr>
          </tbody>
        </table>
        {c.change === "upgrade" ? <p className="text-body-sm text-text-secondary">Your new plan starts as soon as this is paid; unused time on your current plan is credited above.</p> : null}
      </section>
      <SimulatedCheckout sessionId={c.id} recurringAllowed={c.recurring_allowed} />
      <p className="text-body-sm text-text-secondary">
        <Link href={c.return_to as Route} className="underline underline-offset-4">Back to billing</Link>
      </p>
    </main>
  );
}
