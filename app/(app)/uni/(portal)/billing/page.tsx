import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceCheckoutButton } from "@/components/billing/checkout-buttons";
import { InvoiceTable, PaymentTable, PlanSummary, QuotaList, TestModeBanner } from "@/components/billing/parts";
import { PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { requestLicence, saveBillingDetails } from "@/lib/actions/billing";
import { money } from "@/lib/billing/constants";
import { getBillingOverview, paymentOptions } from "@/lib/data/billing";
import { getMyUni } from "@/lib/data/uni";

export const metadata: Metadata = { title: "Billing" };

const KEYS = ["uni.dashboard", "uni.exports", "uni.student_records", "uni.sponsored_pro", "uni.job_fairs", "uni.hackathons", "uni.admin_seats"];

/**
 * /uni/billing (PRD 5.23, 5.24, 4a): the owner only, on two-factor. Licences are annual, invoiced with the
 * university's purchase-order number on 30-day terms, and paid by bank transfer or a pay link.
 */
export default async function UniBillingPage() {
  const uni = await getMyUni();
  if (!uni?.is_owner) notFound();
  const b = await getBillingOverview("university");
  const options = paymentOptions();
  const levels = b.plans;
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Billing">Every university gets its ecosphere free. Licences add analytics, records, sponsored Student Pro, job fairs and hackathons.</PageTitle>
      <TestModeBanner show={options.testMode && !b.live_mode} />
      <Section title="Your licence" id="lic-h">
        <PlanSummary sub={b.subscription} freeLabel="Free (every university)" />
        <QuotaList overview={b} keys={KEYS} />
      </Section>
      <Section title="Ask for a licence" id="req-h">
        <ul className="grid gap-3 md:grid-cols-3">
          {levels.map((p) => (
            <li key={p.id} className="rounded-lg border border-border-default bg-bg-surface p-4">
              <p className="text-h3">{p.label}</p>
              <p className="text-body-sm text-text-secondary">{money(p.price_pkr, "PKR")} a year, plus tax</p>
            </li>
          ))}
        </ul>
        <RpcForm
          action={requestLicence as FormAction}
          after="reset"
          successText="Sent. The Skilient team will issue the invoice with your PO number."
          submitLabel="Send request"
          testId="licence-request-form"
          fields={[
            { name: "level", label: "Licence", type: "select", options: [{ value: "basic", label: "Basic" }, { value: "growth", label: "Growth" }, { value: "campus", label: "Campus" }] },
            { name: "note", label: "Note (PO number, start date, contact)", type: "textarea", rows: 3 },
          ]}
        />
      </Section>
      <Section title="Invoice details" id="details-h">
        <RpcForm
          action={saveBillingDetails as FormAction}
          extra={{ subject: "university" }}
          submitLabel="Save details"
          fields={[
            { name: "ntn", label: "University NTN (optional)", type: "text", defaultValue: b.details?.ntn ?? "" },
            { name: "address", label: "Billing address (optional)", type: "textarea", rows: 2, defaultValue: b.details?.address ?? "" },
          ]}
        />
      </Section>
      <Section title="Invoices" id="inv-h">
        <p className="text-body-sm text-text-secondary">Pay by bank transfer using the details on the invoice (quote its number), or pay online.</p>
        <InvoiceTable invoices={b.invoices} pay={(i) => ((i.live ? options.pkr && !options.testMode : options.testMode) ? <InvoiceCheckoutButton subject="university" invoiceId={i.id} testId={`pay-${i.number}`} /> : null)} />
      </Section>
      <Section title="Payments" id="pay-h">
        <PaymentTable payments={b.payments} />
      </Section>
    </main>
  );
}
