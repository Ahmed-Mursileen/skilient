import { Briefcase, EnvelopeSimple, GithubLogo, SealCheck } from "@phosphor-icons/react/dist/ssr";
import { howItWorks } from "@/content/marketing";
import { Section, SectionHeading } from "./section";

const ICONS = { email: EnvelopeSimple, github: GithubLogo, verified: SealCheck, recognised: Briefcase } as const;

/**
 * Landing section 4 (PRD 5.1): four steps in a horizontal scroll-snap rail. Native scrolling, no
 * animation; the rail takes focus so the arrow keys scroll it.
 */
export function HowItWorks() {
  return (
    <Section labelledBy="how-title" className="border-b border-border-muted">
      <SectionHeading id="how-title">{howItWorks.heading}</SectionHeading>
      <ol
        tabIndex={0}
        aria-labelledby="how-title"
        className="how-rail -mx-[var(--page-gutter)] mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--page-gutter)] pb-4 focus-visible:outline-offset-[-2px]"
        data-testid="how-rail"
      >
        {howItWorks.steps.map((step) => {
          const Icon = ICONS[step.icon];
          return (
            <li
              key={step.title}
              className="flex w-[80%] shrink-0 snap-start flex-col gap-4 border-t-2 border-text-primary pt-6 pr-6 sm:w-[46%] lg:w-[30%]"
            >
              <Icon aria-hidden weight="bold" className="size-7 text-primary" />
              <h3 className="font-display text-[1.625rem] leading-[1.15] tracking-[-0.015em]">{step.title}</h3>
              <p className="text-body text-text-secondary">{step.text}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
