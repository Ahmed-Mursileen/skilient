import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/uni/page-parts";
import { getMyUni } from "@/lib/data/uni";
import { PLAN_LABELS } from "@/lib/uni/constants";

export const metadata: Metadata = { title: "Billing" };

/** /uni/billing (PRD 5.23): owner only. Invoices, activation and renewals arrive with phase 10. */
export default async function BillingPage() {
  const uni = await getMyUni();
  if (!uni?.is_owner) notFound();
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title="Billing" />
      <Card>
        <p className="text-body font-semibold">Your licence: {PLAN_LABELS[uni.plan] ?? uni.plan}</p>
        <p className="text-body-sm text-text-secondary">Licences are annual and invoiced (with your purchase-order number). To start or change one, write to the Skilient team; invoices will appear here.</p>
      </Card>
    </main>
  );
}
