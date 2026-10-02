import { tiers } from "@/content/marketing";
import { cn } from "@/lib/cn";
import { Section, SectionHeading } from "./section";

const DOT: Record<(typeof tiers.ladder)[number]["id"], string> = {
  raw: "bg-tier-raw",
  spark: "bg-tier-spark",
  flare: "bg-tier-flare",
  shine: "bg-tier-shine",
  radiant: "bg-tier-radiant",
  luminary: "bg-tier-luminary",
};

/**
 * Landing section 7 (PRD 5.1): the tier ladder as a ruler. The one scroll-linked element: a
 * vermillion rule fills from Raw toward Luminary as the ladder passes through the viewport (CSS
 * scroll-driven animation; without support, or with reduced motion, it shows filled).
 */
export function TierLadder() {
  return (
    <Section labelledBy="tiers-title" className="border-b border-border-muted">
      <SectionHeading id="tiers-title" className="max-w-[22ch]">
        {tiers.heading}
      </SectionHeading>
      <p className="mt-5 max-w-[56ch] text-body-lg text-text-secondary">{tiers.body}</p>
      <div className="tier-ladder relative mt-12 md:mt-16" data-testid="tier-ladder">
        <div aria-hidden className="tier-track absolute bg-border-default" />
        <div aria-hidden className="tier-fill absolute bg-primary" />
        <ol className="relative grid gap-8 md:grid-cols-6 md:gap-4">
          {tiers.ladder.map((t) => (
            <li key={t.id} className="flex gap-4 md:flex-col md:gap-3">
              <span aria-hidden className={cn("tier-dot mt-1 size-4 shrink-0 rounded-full ring-4 ring-bg-page md:mt-0", DOT[t.id])} />
              <div className="flex flex-col gap-1">
                <span className="text-h3">{t.name}</span>
                <span className="text-body-sm text-text-secondary">{t.meaning}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
