import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CaptureImage } from "@/components/marketing/capture-image";
import { CtaLink, OrgHero } from "@/components/marketing/org-parts";
import { PlanTable } from "@/components/marketing/plan-table";
import { Section, SectionHeading } from "@/components/marketing/sections/section";
import { nav, opportunities, pricingPage, recruitersPage as copy, ventures } from "@/content/marketing";
import { getPublicPlans, getViewer } from "@/lib/data/marketing";
import { captures } from "@/lib/marketing/captures";

export const metadata: Metadata = { title: copy.title, description: copy.description };

/**
 * /recruiters (PRD 5.1, 5.20; docs/marketing-design-plan.md B7): what a recruiter sees, how
 * contact works, job posts and fairs, verification and the recruiter plans from `plans`.
 */
export default async function RecruitersPage() {
  const [viewer, plans] = await Promise.all([getViewer(), getPublicPlans()]);
  const cta = viewer ? (
    <CtaLink href={viewer.home} testId="org-cta">
      {viewer.role === "recruiter" ? copy.signedIn : nav.open}
    </CtaLink>
  ) : (
    <CtaLink href={copy.cta.href} testId="org-cta">
      {copy.cta.label}
    </CtaLink>
  );
  return (
    <>
      <OrgHero headline={copy.headline} intro={copy.intro} art="recruiters" cta={cta} />

      <Section labelledBy="see-title" className="border-b border-border-muted">
        <div className="grid gap-10 md:grid-cols-12 md:gap-6">
          <div className="flex flex-col gap-8 md:col-span-5">
            <SectionHeading id="see-title">{copy.see.heading}</SectionHeading>
            <dl className="flex flex-col gap-6">
              {copy.see.items.map((item) => (
                <div key={item.title} className="flex flex-col gap-1 border-t-2 border-text-primary pt-4">
                  <dt className="text-h4">{item.title}</dt>
                  <dd className="text-body text-text-secondary">{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="overflow-hidden rounded-lg border border-border-default bg-bg-page self-start md:col-span-7">
            <CaptureImage file={captures.sections.venture} alt={ventures.alt} />
          </div>
        </div>
      </Section>

      <Section labelledBy="contact-title" className="border-b border-border-muted bg-bg-surface">
        <SectionHeading id="contact-title">{copy.contact.heading}</SectionHeading>
        <div className="mt-10 grid gap-10 md:grid-cols-12 md:gap-6">
          <ol className="flex flex-col gap-8 md:col-span-7">
            {copy.contact.steps.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[3rem_1fr] gap-x-4">
                <span aria-hidden className="font-display text-h1 leading-none text-primary tabular-nums">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-h4">{step.title}</h3>
                  <p className="text-body text-text-secondary">{step.text}</p>
                </div>
              </li>
            ))}
            <li className="col-span-full border-t border-border-default pt-6 text-body text-text-secondary">{copy.contact.rules}</li>
          </ol>
          <div className="self-start overflow-hidden rounded-lg border border-border-default bg-bg-page md:col-span-5">
            <CaptureImage file={captures.sections.contactRequest} alt={opportunities.cells.requests.alt} />
          </div>
        </div>
      </Section>

      <Section labelledBy="jobs-title" className="border-b border-border-muted">
        <div className="grid gap-10 md:grid-cols-12 md:items-center md:gap-6">
          <div className="order-2 w-full max-w-[26rem] justify-self-center overflow-hidden rounded-lg border border-border-default bg-bg-page md:order-1 md:col-span-6">
            <CaptureImage file={captures.sections.jobs} alt={opportunities.cells.jobs.alt} />
          </div>
          <div className="order-1 flex flex-col gap-5 md:order-2 md:col-span-5 md:col-start-8">
            <SectionHeading id="jobs-title">{copy.jobs.heading}</SectionHeading>
            <p className="text-body-lg text-text-secondary">{copy.jobs.text}</p>
          </div>
        </div>
      </Section>

      <Section labelledBy="verified-title" className="border-b border-border-muted" dense>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <ShieldCheck aria-hidden weight="fill" className="size-10 shrink-0 text-verified" />
          <div className="flex max-w-[62ch] flex-col gap-3">
            <h2 id="verified-title" className="text-h2">
              {copy.verification.heading}
            </h2>
            <p className="text-body-lg text-text-secondary">{copy.verification.text}</p>
          </div>
        </div>
      </Section>

      <Section id="plans" labelledBy="plans-title">
        <div className="flex flex-col gap-3">
          <SectionHeading id="plans-title">{copy.plans.heading}</SectionHeading>
          <p className="max-w-[62ch] text-body-lg text-text-secondary">{copy.plans.text}</p>
        </div>
        <div className="mt-10">
          <PlanTable id="recruiters" plans={plans.filter((p) => p.audience === "org")} free={pricingPage.recruiters.explore} />
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          {cta}
          <Link href={"/pricing#recruiters" as Route} className="text-body font-semibold underline underline-offset-4">
            {copy.plans.link}
          </Link>
        </div>
      </Section>
    </>
  );
}
