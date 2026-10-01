import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GraduationCap } from "@phosphor-icons/react/dist/ssr";
import { PlanCheckoutButton } from "@/components/billing/checkout-buttons";
import { InvoiceTable, PaymentTable, PlanSummary, QuotaList, TestModeBanner } from "@/components/billing/parts";
import { PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { cancelSubscription, schedulePlanChange, startTrial } from "@/lib/actions/billing";
import { getCurrentUser } from "@/lib/auth/current-user";
import { money } from "@/lib/billing/constants";
import { getBillingOverview, paymentOptions } from "@/lib/data/billing";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Billing" };

const PRO_KEYS = ["cv.pdf_export", "cv.refresh_on_demand", "cv.templates", "cv.insights", "cv.viewer_names", "privacy.record_viewers", "insights.post_survey"];

/** /settings/billing (PRD 5.24): Student Pro, the free trial, payments and receipts. */
export default async function StudentBillingPage() {
  const user = await getCurrentUser();
  if (user?.role !== "student") notFound();
  const [b, options] = await Promise.all([getBillingOverview("user"), Promise.resolve(paymentOptions())]);
  const sub = b.subscription;
  const paid = sub && sub.status !== "trialing";
  const pro = b.plans.filter((p) => p.self_serve);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-[var(--page-gutter)] py-8">
      <PageTitle title="Billing">Proof stays free for everyone: verification, levels, ranking and being found. Student Pro adds polish and convenience.</PageTitle>
      <TestModeBanner show={options.testMode} />
      {b.sponsored ? (
        <p className="flex items-start gap-2 rounded-md border border-verified bg-verified-subtle px-3 py-2 text-body-sm" data-testid="sponsored-banner">
          <GraduationCap aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {b.sponsored.university} sponsors your Student Pro{b.sponsored.ends_at ? ` until ${dayLabel(b.sponsored.ends_at)}` : ""}.
            {paid ? " You also pay for Pro yourself: you can cancel at the end of your period, nothing is paused automatically." : ""}
          </span>
        </p>
      ) : null}
      <Section title="Your plan" id="plan-h">
        <PlanSummary sub={sub} freeLabel={b.sponsored ? "Student Pro (sponsored)" : "Free"}>
          {sub && sub.status !== "expired" && sub.gateway !== "comp" ? (
            sub.cancel_at_period_end ? (
              <RpcForm action={cancelSubscription as FormAction} extra={{ subject: "user", resume: true }} fields={[]} submitLabel="Keep Student Pro" testId="resume-form" />
            ) : (
              <RpcForm action={cancelSubscription as FormAction} extra={{ subject: "user", resume: false }} fields={[]} submitLabel={sub.status === "trialing" ? "End the trial now" : "Cancel at the end of the period"} testId="cancel-form" />
            )
          ) : null}
        </PlanSummary>
        <QuotaList overview={b} keys={PRO_KEYS} />
      </Section>
      {b.trial_available ? (
        <Section title="Try Student Pro free for 7 days" id="trial-h">
          <p className="text-body-sm text-text-secondary">No card needed. It ends as Free unless you choose a plan. One trial per student.</p>
          <RpcForm action={startTrial as unknown as FormAction} fields={[]} submitLabel="Start my free trial" testId="trial-form" />
        </Section>
      ) : null}
      {!b.sponsored || paid ? (
        <Section title={paid ? "Change plan" : "Get Student Pro"} id="plans-h">
          {options.pkr ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {pro.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5">
                  <p className="text-h3">{p.label} · {p.interval === "year" ? "yearly" : "monthly"}</p>
                  <p className="font-display text-h2">{money(p.price_pkr, "PKR")}<span className="text-body text-text-secondary"> / {p.interval}</span></p>
                  {sub?.plan_id === p.id && paid ? (
                    <p className="text-body-sm text-text-secondary">Your current plan.{sub.payment_method !== "card" && !sub.next_period_paid ? " Pay the next period ahead below." : ""}</p>
                  ) : null}
                  {sub?.plan_id === p.id && paid && (sub.payment_method === "card" || sub.next_period_paid) && sub.status !== "past_due" ? null : (
                    <PlanCheckoutButton subject="user" planId={p.id} currency="PKR" label={sub?.plan_id === p.id && paid ? "Pay the next period" : `Choose ${p.interval === "year" ? "yearly" : "monthly"}`} testId={`checkout-${p.id}`} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-text-secondary">Payments open soon.</p>
          )}
          {paid && sub?.interval === "year" ? (
            <RpcForm action={schedulePlanChange as FormAction} extra={{ subject: "user", planId: "student_pro_monthly" }} fields={[]} submitLabel="Switch to monthly at renewal" after="refresh" />
          ) : null}
        </Section>
      ) : null}
      <Section title="Receipts" id="rec-h">
        <InvoiceTable invoices={b.invoices} />
      </Section>
      <Section title="Payments" id="pay-h">
        <PaymentTable payments={b.payments} />
      </Section>
    </main>
  );
}
