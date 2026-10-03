import type { Metadata } from "next";
import { CtaLink, OrgHero } from "@/components/marketing/org-parts";
import { PlanTable } from "@/components/marketing/plan-table";
import { Section, SectionHeading } from "@/components/marketing/sections/section";
import { TalkToUsForm } from "@/components/marketing/talk-to-us-form";
import { pricingPage, universitiesPage as copy } from "@/content/marketing";
import { getPublicPlans } from "@/lib/data/marketing";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: copy.title, description: copy.description, alternates: { canonical: "/universities" } };

/**
 * /universities (PRD 5.1, 5.23; docs/marketing-design-plan.md B7): an editorial long read with a
 * contents column, the licence plans from `plans`, and "Talk to us" (a sales lead in /ops/leads).
 */
export default async function UniversitiesPage() {
  const plans = await getPublicPlans();
  return (
    <>
      <OrgHero headline={copy.headline} intro={copy.intro} art="universities" cta={<CtaLink href={copy.cta.href} testId="org-cta" track="talk_to_us">{copy.cta.label}</CtaLink>} />

      <section aria-label="What your university gets" className="border-b border-border-muted">
        <div className="mx-auto grid max-w-page gap-10 px-[var(--page-gutter)] py-16 sm:py-20 md:grid-cols-12 md:gap-6">
          <nav aria-label="On this page" className="hidden md:col-span-3 md:block">
            <ol className="sticky top-8 flex flex-col gap-3 border-l border-border-default pl-4 text-body">
              {copy.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-col gap-14 md:col-span-8 md:col-start-5">
            {copy.sections.map((s) => (
              <article key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="flex scroll-mt-8 flex-col gap-4">
                <h2 id={`${s.id}-title`} className="font-display text-h2">
                  {s.heading}
                </h2>
                <p className="max-w-[62ch] text-body-lg text-text-secondary">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Section id="plans" labelledBy="plans-title" className="border-b border-border-muted bg-bg-surface">
        <div className="flex flex-col gap-3">
          <SectionHeading id="plans-title">{copy.plans.heading}</SectionHeading>
          <p className="max-w-[62ch] text-body-lg text-text-secondary">{copy.plans.text}</p>
        </div>
        <div className="mt-10">
          <PlanTable id="universities" plans={plans.filter((p) => p.audience === "university")} free={pricingPage.universities.free} />
        </div>
      </Section>

      <Section id="talk" labelledBy="talk-title">
        <div className="grid gap-10 md:grid-cols-12 md:gap-6">
          <div className="flex flex-col gap-4 md:col-span-4">
            <SectionHeading id="talk-title">{copy.talk.heading}</SectionHeading>
            <p className="text-body-lg text-text-secondary">{copy.talk.text}</p>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <TalkToUsForm siteKey={turnstileSiteKey()} />
          </div>
        </div>
      </Section>
    </>
  );
}
