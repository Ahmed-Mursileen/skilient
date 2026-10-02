import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { faq } from "@/content/marketing";
import { Section, SectionHeading } from "./section";

/**
 * Landing section 13 (PRD 5.1): native details/summary, so it works and is keyboard-operable
 * without JavaScript; opening animates its height in CSS (250 ms), instantly under reduced motion.
 */
export function Faq() {
  return (
    <Section labelledBy="faq-title" className="border-b border-border-muted">
      <div className="grid gap-8 md:grid-cols-12 md:gap-6">
        <SectionHeading id="faq-title" className="md:col-span-3">
          {faq.heading}
        </SectionHeading>
        <div className="border-t border-border-default md:col-span-8 md:col-start-5">
          {faq.items.map((item) => (
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
  );
}
