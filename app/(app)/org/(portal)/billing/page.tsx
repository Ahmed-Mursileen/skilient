import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditsForm } from "@/components/billing/credits-form";
import { InvoiceCheckoutButton, PlanCheckoutButton, SponsorPostButton } from "@/components/billing/checkout-buttons";
import { InvoiceTable, PaymentTable, PlanSummary, QuotaList, TestModeBanner } from "@/components/billing/parts";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { cancelSubscription, chooseSeats, disputeHireFee, reopenPausedJob, saveBillingDetails, schedulePlanChange } from "@/lib/actions/billing";
import { money, PROVINCES } from "@/lib/billing/constants";
import { getBillingOverview, paymentOptions } from "@/lib/data/billing";
import { isRefusal } from "@/lib/data/rpc-json";
import { getMyOrg } from "@/lib/data/recruit";
import { dayLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Billing" };

const KEYS = ["talent.full_profile", "contact.credits", "org.seats", "jobs.active_posts", "recruit.shortlists", "recruit.saved_searches", "recruit.analytics", "competitions.run", "api.access", "hire_fee.waived"];

/**
 * /org/billing (PRD 5.24, 4b.5–4b.9): the organisation's admin and billing members, on two-factor (route and SQL).
 * Plans, add-ons, hiring fees, invoices and payment details. Every price and limit comes from the database.
 */
export default async function OrgBillingPage() {
  const org = await getMyOrg();
  if (!org || org.role === "recruiter") notFound();
  let b;
  try {
    b = await getBillingOverview("org");
  } catch (e) {
    if (isRefusal(e, "42501")) notFound();
    throw e;
  }
  const options = paymentOptions();
  const sub = b.subscription;
  const paid = sub && sub.status !== "trialing" && sub.status !== "expired";
  const selfServe = b.plans.filter((p) => p.self_serve);
  const lower = selfServe.filter((p) => sub && p.rank < (b.plans.find((x) => x.id === sub.plan_id)?.rank ?? 0));
  const nextSeats = sub?.next_plan_id ? Number(b.plans.find((p) => p.id === sub.next_plan_id)?.grants["org.seats"] ?? 1) : null;
  const activeMembers = (b.members ?? []).filter((m) => m.status === "active");
  const verified = org.status === "verified";
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Billing">Money never buys rank or visibility: plans add tools and reach, never a higher place in results.</PageTitle>
      <TestModeBanner show={options.testMode} />
      {!b.details?.province ? (
        <p className="rounded-md border border-warning bg-bg-surface px-3 py-2 text-body-sm" data-testid="province-needed">
          Add your province under Invoice details before paying in PKR: it decides the sales tax on your invoices.
        </p>
      ) : null}

      <Section title="Your plan" id="plan-h">
        <PlanSummary sub={sub} freeLabel="Explore (free)">
          {paid && sub.gateway !== "comp" && sub.gateway !== "manual" ? (
            <RpcForm
              action={cancelSubscription as FormAction}
              extra={{ subject: "org", resume: sub.cancel_at_period_end }}
              fields={[]}
              submitLabel={sub.cancel_at_period_end ? "Keep this plan" : "Cancel at the end of the period"}
              testId="org-cancel-form"
            />
          ) : null}
        </PlanSummary>
        <QuotaList overview={b} keys={KEYS} />
      </Section>

      <Section title={paid ? "Upgrade" : "Choose a plan"} id="plans-h">
        {!verified ? <p className="text-body-sm text-text-secondary">Plans can be bought once Skilient has verified your organisation.</p> : null}
        <ul className="grid gap-3 md:grid-cols-2">
          {selfServe.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-5" data-testid={`plan-${p.id}`}>
              <p className="text-h3">{p.label} · {p.interval === "year" ? "yearly" : "monthly"}</p>
              <p className="font-display text-h2">{money(p.price_pkr, "PKR")}<span className="text-body text-text-secondary"> / {p.interval} + tax</span></p>
              {p.price_usd ? <p className="text-body-sm text-text-secondary">or {money(p.price_usd, "USD")} through our merchant of record</p> : null}
              {verified && sub?.plan_id !== p.id ? (
                <div className="flex flex-wrap gap-2">
                  {options.pkr ? <PlanCheckoutButton subject="org" planId={p.id} currency="PKR" label="Pay in PKR" testId={`checkout-${p.id}`} /> : null}
                  {options.usd && p.price_usd ? <PlanCheckoutButton subject="org" planId={p.id} currency="USD" label="Pay in USD" variant="secondary" testId={`checkout-usd-${p.id}`} /> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-text-secondary">Enterprise (custom seats and credits, single sign-on, annual invoicing): write to the Skilient team.</p>
      </Section>

      {paid && sub.gateway !== "comp" ? (
        <Section title="Change plan at renewal" id="change-h">
          <p className="text-body-sm text-text-secondary">Downgrades start at your next renewal. Over the new limits, extra seats become inactive and the newest extra job posts pause; nothing is deleted.</p>
          <RpcForm
            action={schedulePlanChange as FormAction}
            extra={{ subject: "org" }}
            submitLabel="Schedule the change"
            fields={[{ name: "planId", label: "From your next renewal", type: "select", options: [...lower.map((p) => ({ value: p.id, label: `${p.label} (${p.interval === "year" ? "yearly" : "monthly"})` })), { value: "free", label: "Explore (free)" }] }]}
          />
          {nextSeats !== null && activeMembers.length > nextSeats ? (
            <div className="flex flex-col gap-2" data-testid="seat-chooser">
              <p className="text-body font-semibold">Choose who keeps a seat ({nextSeats} on the new plan)</p>
              <RpcForm
                action={chooseSeats as FormAction}
                submitLabel="Save my choice"
                fields={[{ name: "keep", label: "Keep a seat", type: "checks", options: activeMembers.map((m) => ({ value: m.user_id, label: `${m.name ?? "Member"} (${m.role})` })), defaultValue: activeMembers.filter((m) => m.seat_keep).map((m) => m.user_id), help: "Include at least one admin. Without a choice, admins and the most recently active members keep their seats." }]}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {verified ? (
        <Section title="Add-ons" id="addons-h">
          <p className="text-body font-semibold">Extra contact credits</p>
          {options.pkr ? <CreditsForm currency="PKR" unitLabel="PKR 300" /> : <p className="text-body-sm text-text-secondary">Payments open soon.</p>}
          <p className="mt-4 text-body font-semibold">Sponsored job posts</p>
          <p className="text-body-sm text-text-secondary">PKR 5,000 for 14 days. Labelled &ldquo;Sponsored&rdquo; in the job list, never ranked above other results in talent search.</p>
          <DataTable
            head={["Live post", "Sponsored", ""]}
            empty="No live posts."
            rows={(b.live_jobs ?? []).map((j) => [
              j.title,
              j.sponsored_until && new Date(j.sponsored_until) > new Date() ? `Until ${dayLabel(j.sponsored_until)}` : "No",
              options.pkr && !(j.sponsored_until && new Date(j.sponsored_until) > new Date()) ? <SponsorPostButton key={j.id} jobId={j.id} currency="PKR" /> : "",
            ])}
          />
        </Section>
      ) : null}

      {(b.paused_posts ?? []).length > 0 ? (
        <Section title="Paused job posts" id="paused-h">
          <p className="text-body-sm text-text-secondary">These went over your plan&apos;s live-post limit. Close another post or upgrade, then reopen.</p>
          <DataTable
            head={["Post", "Paused", ""]}
            rows={(b.paused_posts ?? []).map((j) => [
              j.title,
              dayLabel(j.paused_at),
              <RpcForm key={j.id} action={reopenPausedJob as FormAction} extra={{ id: j.id }} fields={[]} submitLabel="Reopen" />,
            ])}
          />
        </Section>
      ) : null}

      <Section title="Hiring fees" id="fees-h">
        <p className="text-body-sm text-text-secondary">
          A flat fee per recorded hire (PKR 10,000 intern, PKR 30,000 full-time; waived on Growth and Enterprise), invoiced when you mark someone hired and due in 30 days.
          Dispute within 14 days if the candidate withdrew or it was marked in error. Unpaid after 30 days, new contact requests pause until it&apos;s paid.
        </p>
        <DataTable
          testId="hire-fee-table"
          head={["Hire", "Fee", "Status", "Dispute"]}
          empty="No hiring fees."
          rows={(b.hire_fees ?? []).map((f) => [
            `${f.kind === "intern" ? "Intern" : "Full-time"} · ${dayLabel(f.created_at)}`,
            money(f.amount, "PKR"),
            f.status === "invoiced" && f.due_at ? `Invoiced, due ${dayLabel(f.due_at)}` : f.status,
            f.can_dispute ? (
              <RpcForm
                key={f.id}
                action={disputeHireFee as FormAction}
                extra={{ id: f.id }}
                submitLabel="Dispute"
                fields={[
                  { name: "kind", label: "What happened", type: "select", options: [{ value: "candidate_withdrew", label: "The candidate withdrew" }, { value: "marked_in_error", label: "Marked hired in error" }] },
                  { name: "reason", label: "Details", type: "textarea", required: true, rows: 2 },
                ]}
              />
            ) : (f.resolution_reason ?? ""),
          ])}
        />
      </Section>

      <Section title="Invoice details" id="details-h">
        <RpcForm
          action={saveBillingDetails as FormAction}
          extra={{ subject: "org" }}
          submitLabel="Save details"
          testId="billing-details-form"
          fields={[
            { name: "province", label: "Province", type: "select", options: PROVINCES.map((p) => ({ value: p, label: p })), defaultValue: b.details?.province ?? "Punjab" },
            { name: "ntn", label: "Your NTN (optional)", type: "text", defaultValue: b.details?.ntn ?? "" },
            { name: "address", label: "Billing address (optional)", type: "textarea", rows: 2, defaultValue: b.details?.address ?? "" },
          ]}
        />
      </Section>

      <Section title="Invoices" id="inv-h">
        <InvoiceTable invoices={b.invoices} pay={(i) => ((i.live ? options.pkr && !options.testMode : options.testMode) ? <InvoiceCheckoutButton subject="org" invoiceId={i.id} testId={`pay-${i.number}`} /> : null)} />
      </Section>
      <Section title="Payments" id="pay-h">
        <PaymentTable payments={b.payments} />
      </Section>
    </main>
  );
}
