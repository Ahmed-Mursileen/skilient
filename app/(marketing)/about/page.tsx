import type { Metadata } from "next";
import { ArtImage } from "@/components/marketing/art-image";
import { CtaLink } from "@/components/marketing/org-parts";
import { aboutPage as copy, nav } from "@/content/marketing";
import { getViewer } from "@/lib/data/marketing";

export const metadata: Metadata = { title: copy.title, description: copy.description };

/**
 * /about (PRD 5.1; docs/marketing-design-plan.md B7): an editorial single column, the story and
 * values, paced by two full-bleed prints. Founders, incubation and the award join it once Ahmed
 * supplies them (decisions 2026-10-02); nothing here is invented.
 */
export default async function AboutPage() {
  const viewer = await getViewer();
  return (
    <article aria-labelledby="page-title">
      <header className="mx-auto max-w-page px-[var(--page-gutter)] pt-12 pb-10 sm:pt-16">
        <h1 id="page-title" className="text-hero max-w-[18ch] text-text-primary">
          {copy.headline}
        </h1>
      </header>
      <div className="mx-auto max-w-page px-[var(--page-gutter)]">
        <ArtImage name="about-corridor" eager sizes="(min-width: 1280px) 1200px, 100vw" className="rounded-none border-x-0 sm:rounded-lg sm:border-x" />
      </div>
      <div className="mx-auto flex max-w-[44rem] flex-col gap-6 px-[var(--page-gutter)] py-16 sm:py-20">
        {copy.story.map((p) => (
          <p key={p.slice(0, 24)} className="text-body-lg text-text-primary">
            {p}
          </p>
        ))}
      </div>
      <section aria-labelledby="values-title" className="border-y border-border-muted bg-bg-surface">
        <div className="mx-auto grid max-w-page gap-10 px-[var(--page-gutter)] py-16 sm:py-20 md:grid-cols-12 md:gap-6">
          <h2 id="values-title" className="font-display text-[2rem] leading-[1.1] tracking-[-0.02em] sm:text-h1 md:col-span-4">
            {copy.values.heading}
          </h2>
          <dl className="grid gap-8 sm:grid-cols-2 md:col-span-8">
            {copy.values.items.map((v) => (
              <div key={v.term} className="flex flex-col gap-1 border-t-2 border-text-primary pt-4">
                <dt className="text-h4">{v.term}</dt>
                <dd className="text-body text-text-secondary">{v.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <div className="mx-auto max-w-page px-[var(--page-gutter)] pt-16">
        <ArtImage name="about-desk" sizes="(min-width: 1280px) 1200px, 100vw" className="rounded-none border-x-0 sm:rounded-lg sm:border-x" />
      </div>
      <div className="mx-auto flex max-w-page justify-center px-[var(--page-gutter)] py-16 sm:py-20">
        <CtaLink href={viewer ? viewer.home : nav.join.href}>{viewer ? nav.open : nav.join.label}</CtaLink>
      </div>
    </article>
  );
}
