import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ArtName } from "@/lib/marketing/art";
import { ArtImage } from "./art-image";

/**
 * Parts shared by /recruiters, /universities, /faculty, /pricing and /about
 * (docs/marketing-design-plan.md B7). Each page composes its own layout from these.
 */

export const ctaClass =
  "inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-body-lg font-semibold text-text-on-primary transition-[background-color,transform] duration-[120ms] ease-standard hover:bg-primary-hover active:scale-[0.98]";

/** The page's one call to action: a vermillion link (an anchor on the same page or a route). */
export function CtaLink({ href, children, testId, className }: { href: string; children: ReactNode; testId?: string; className?: string }) {
  const body = (
    <>
      {children}
      <ArrowRight aria-hidden weight="bold" className="cta-arrow size-5" />
    </>
  );
  return href.startsWith("#") ? (
    <a href={href} className={cn(ctaClass, className)} data-testid={testId}>
      {body}
    </a>
  ) : (
    <Link href={href as Route} className={cn(ctaClass, className)} data-testid={testId}>
      {body}
    </Link>
  );
}

/** An organisation page's opening: the headline and one CTA in 7 columns, the print in 5. */
export function OrgHero({
  headline,
  intro,
  art,
  cta,
  aside,
}: {
  headline: string;
  intro: string;
  art: Exclude<ArtName, "og-plate" | "about-corridor" | "about-desk">;
  cta: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="border-b border-border-muted">
      <div className="mx-auto grid max-w-page gap-10 px-[var(--page-gutter)] py-12 sm:py-16 md:grid-cols-12 md:items-center md:gap-6">
        <div className="flex flex-col gap-6 md:col-span-7">
          <h1 id="page-title" className="text-hero max-w-[16ch] text-text-primary">
            {headline}
          </h1>
          <p className="max-w-[56ch] text-body-lg text-text-secondary">{intro}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {cta}
            {aside}
          </div>
        </div>
        <div className="md:col-span-4 md:col-start-9">
          <ArtImage name={art} eager sizes="(min-width: 768px) 30vw, 16rem" className="mx-auto max-w-[16rem] md:max-w-none" />
        </div>
      </div>
    </section>
  );
}
