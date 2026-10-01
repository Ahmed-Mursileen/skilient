import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReturnStatus } from "@/components/billing/return-status";
import { money } from "@/lib/billing/constants";
import { getCheckoutSession, type CheckoutSession } from "@/lib/data/billing";
import { isRefusal } from "@/lib/data/rpc-json";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where every gateway sends the payer back (PRD 4b.5). The status comes from the database, never the redirect. */
export default async function ReturnPage({ params }: PageProps<"/billing/return/[session]">) {
  const { session } = await params;
  if (!UUID.test(session)) notFound();
  let c: CheckoutSession;
  try {
    c = await getCheckoutSession(session);
  } catch (e) {
    if (isRefusal(e, "P0002", "42501")) notFound();
    throw e;
  }
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">{c.title}</h1>
      <p className="text-body text-text-secondary">
        {money(c.amount, c.currency)}{c.live ? "" : " · test mode, no real money"}
      </p>
      <ReturnStatus sessionId={c.id} initial={c.status} returnTo={c.return_to} />
    </main>
  );
}
