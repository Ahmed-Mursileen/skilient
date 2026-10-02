import type { Route } from "next";
import Link from "next/link";
import { preload } from "react-dom";
import { hero, emailField } from "@/content/marketing";
import { captures } from "@/lib/marketing/captures";
import { HeroFeedCapture } from "./hero-feed-capture";
import { UniEmailField, type InitialEmailState } from "./uni-email-field";

/**
 * Landing section 1 (PRD 5.1): headline, subline and the university email field on the left,
 * the University Feed on a phone on the right, cut by the section's bottom edge. The whole
 * hero, field included, fits 1280×720 and 390×844 (plan B6).
 */
export function Hero({
  home,
  siteKey,
  defaultEmail,
  initialState,
}: {
  home: string | null;
  siteKey: string | null;
  defaultEmail: string;
  initialState: InitialEmailState;
}) {
  // The first card on the phone is the page's largest image: fetch it early, for the device theme only.
  const first = captures.hero.postB;
  preload(first.light.avif, { as: "image", type: "image/avif", media: "(prefers-color-scheme: light)", fetchPriority: "high" });
  preload(first.dark.avif, { as: "image", type: "image/avif", media: "(prefers-color-scheme: dark)", fetchPriority: "high" });
  return (
    <section aria-labelledby="hero-title" className="border-b border-border-default">
      <div className="mx-auto grid max-w-page gap-8 px-[var(--page-gutter)] pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-6 lg:pt-16">
        <div id="join" className="flex flex-col gap-4 lg:col-span-8 lg:self-center lg:pb-16">
          <h1 id="hero-title" className="text-hero text-text-primary">
            {hero.headline}
          </h1>
          <p className="max-w-[54ch] text-body-lg text-text-secondary">{hero.subline}</p>
          <div className="mt-2 sm:mt-4">
            {home ? (
              <Link
                href={home as Route}
                className="inline-flex h-12 items-center rounded-md bg-primary px-6 text-body-lg font-semibold text-text-on-primary transition-[background-color,transform] duration-[120ms] ease-standard hover:bg-primary-hover active:scale-[0.98]"
                data-testid="hero-open"
              >
                {emailField.signedIn}
              </Link>
            ) : (
              <UniEmailField idPrefix="hero" siteKey={siteKey} defaultEmail={defaultEmail} initialState={initialState} />
            )}
          </div>
        </div>
        <div className="flex justify-center lg:col-span-4 lg:items-end lg:justify-end">
          <HeroFeedCapture shots={captures.hero} />
        </div>
      </div>
    </section>
  );
}
