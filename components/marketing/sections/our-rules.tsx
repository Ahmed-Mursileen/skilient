import { rules } from "@/content/marketing";

/** Landing section 10 (PRD 5.1): the rules, on the page's one full-bleed vermillion field. */
export function OurRules() {
  return (
    <section aria-labelledby="rules-title" className="bg-primary text-text-on-primary" data-testid="our-rules">
      <div className="mx-auto max-w-page px-[var(--page-gutter)] py-16 sm:py-24">
        <h2 id="rules-title" className="sr-only">
          {rules.heading}
        </h2>
        <ul className="flex flex-col gap-2">
          {rules.lines.map((line) => (
            <li key={line} className="font-display text-[2.25rem] leading-[1.08] tracking-[-0.02em] sm:text-[3.5rem] lg:text-[4rem]">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
