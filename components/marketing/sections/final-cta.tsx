import type { Route } from "next";
import Link from "next/link";
import { emailField, finalCta } from "@/content/marketing";
import { UniEmailField } from "../uni-email-field";

/** Landing section 14 (PRD 5.1): the page's one centred statement, and the email field again. */
export function FinalCta({ home, siteKey }: { home: string | null; siteKey: string | null }) {
  return (
    <section aria-labelledby="final-title" className="bg-bg-surface">
      <div className="mx-auto flex max-w-page flex-col items-center gap-6 px-[var(--page-gutter)] py-20 text-center sm:py-28">
        <h2 id="final-title" className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.025em] sm:text-[4rem]">
          {finalCta.heading}
        </h2>
        <p className="text-body-lg text-text-secondary">{finalCta.body}</p>
        <div className="flex w-full max-w-xl justify-center text-left">
          {home ? (
            <Link
              href={home as Route}
              className="inline-flex h-12 items-center rounded-md bg-primary px-6 text-body-lg font-semibold text-text-on-primary transition-[background-color,transform] duration-[120ms] ease-standard hover:bg-primary-hover active:scale-[0.98]"
            >
              {emailField.signedIn}
            </Link>
          ) : (
            <UniEmailField idPrefix="final" siteKey={siteKey} />
          )}
        </div>
      </div>
    </section>
  );
}
