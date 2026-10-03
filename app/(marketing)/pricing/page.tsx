import { ArrowRight, CaretDown } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CtaLink } from "@/components/marketing/org-parts";
import { PlanTable } from "@/components/marketing/plan-table";
import { Section, SectionHeading } from "@/components/marketing/sections/section";
import { nav, pricingPage as copy, recruitersPage, universitiesPage } from "@/content/marketing";
import { getPricingExtras, getPublicPlans, getViewer } from "@/lib/data/marketing";
import { pkr } from "@/lib/marketing/plan-lines";

export const metadata: Metadata = { title: copy.title, description: copy.description, alternates: { canonical: "/pricing" } };

const fill = (s: string, values: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

/**
 * /pricing (PRD 4a; docs/marketing-design-plan.md B7): one section per audience, every price and
 * limit from `plans` and the add-ons, hiring fees and trial from platform_config, PKR only.
 * Monthly/yearly is a CSS radio pair; the audience links are anchors. No JavaScript.
 */
export default async function PricingPage() {
  const [viewer, plans, extras] = await Promise.all([getViewer(), getPublicPlans(), getPricingExtras()]);
  const by = (a: string) => plans.filter((p) => p.audience === a);
  const sponsored = extras.add_ons?.sponsored_post;
  const credit = extras.add_ons?.contact_credits?.pkr;
  const fees = extras.hire_fees;
  const addOns = [
    sponsored ? fill(copy.recruiters.sponsoredPost, { price: pkr(sponsored.pkr), days: String(sponsored.days) }) : null,
    credit ? fill(copy.recruiters.credits, { price: pkr(credit) }) : null,
    fees?.intern && fees.full_time ? fill(copy.recruiters.hireFee, { intern: pkr(fees.intern), fullTime: pkr(fees.full_time) }) : null,
  ].filter((l): l is string => l !== null);
  const trial = extras.trial_days ? fill(copy.trial, { days: String(extras.trial_days) }) : null;

  return (
    <>
      <section aria-labelledby="page-title" className="border-b border-border-muted">
        <div className="mx-auto flex max-w-page flex-col gap-6 px-[var(--page-gutter)] py-12 sm:py-16">
          <h1 id="page-title" className="text-hero max-w-[18ch] text-text-primary">
            {copy.headline}
          </h1>
          <p className="max-w-[60ch] text-body-lg text-text-secondary">{copy.intro}</p>
          <nav aria-label="Plans for" className="flex flex-wrap gap-2">
            {copy.audiences.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="inline-flex h-10 items-center rounded-md border border-border-default px-4 text-body font-semibold hover:border-border-strong"
              >
                {a.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <Section id="students" labelledBy="students-title" className="scroll-mt-4 border-b border-border-muted">
        <SectionHeading id="students-title">{copy.students.heading}</SectionHeading>
        <div className="mt-10">
          <PlanTable
            id="students"
            plans={by("user")}
            free={{ label: copy.students.freeLabel, items: copy.students.freeItems }}
            notes={{ pro: [trial ? `${trial}.` : null, copy.students.sponsored].filter(Boolean).join(" ") }}
            extra={{
              pro: viewer ? null : (
                <Link href="/signup" className="inline-flex items-center gap-1.5 self-start text-body font-semibold underline underline-offset-4">
                  {nav.join.label}
                  <ArrowRight aria-hidden weight="bold" className="cta-arrow size-4" />
                </Link>
              ),
            }}
          />
        </div>
      </Section>

      <Section id="recruiters" labelledBy="recruiters-title" className="scroll-mt-4 border-b border-border-muted bg-bg-surface">
        <SectionHeading id="recruiters-title">{copy.recruiters.heading}</SectionHeading>
        <div className="mt-10">
          <PlanTable id="recruiters" plans={by("org")} free={copy.recruiters.explore} />
        </div>
        {addOns.length ? (
          <div className="mt-12 flex max-w-[72ch] flex-col gap-3" data-testid="pricing-add-ons">
            <h3 className="text-h3">{copy.recruiters.addOns}</h3>
            <ul className="flex flex-col gap-2">
              {addOns.map((line) => (
                <li key={line} className="text-body text-text-secondary">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-10">
          <CtaLink href={viewer ? viewer.home : recruitersPage.cta.href}>{viewer ? nav.open : recruitersPage.cta.label}</CtaLink>
        </div>
      </Section>

      <Section id="universities" labelledBy="universities-title" className="scroll-mt-4 border-b border-border-muted">
        <SectionHeading id="universities-title">{copy.universities.heading}</SectionHeading>
        <div className="mt-10">
          <PlanTable id="universities" plans={by("university")} free={copy.universities.free} />
        </div>
        <p className="mt-10 text-body text-text-secondary">{copy.universities.note}</p>
        <div className="mt-6">
          <CtaLink href={"/universities#talk" as Route}>{universitiesPage.talk.heading}</CtaLink>
        </div>
      </Section>

      <Section labelledBy="pricing-faq-title">
        <div className="grid gap-8 md:grid-cols-12 md:gap-6">
          <SectionHeading id="pricing-faq-title" className="md:col-span-3">
            Questions
          </SectionHeading>
          <div className="border-t border-border-default md:col-span-8 md:col-start-5">
            {copy.faq.map((item) => (
              <details key={item.q} className="faq-item group border-b border-border-default">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-h4 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <CaretDown aria-hidden weight="bold" className="faq-caret size-5 shrink-0 text-text-secondary" />
                </summary>
                <p className="max-w-[64ch] pb-6 text-body-lg text-text-secondary">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
