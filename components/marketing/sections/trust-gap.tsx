import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { trustGap } from "@/content/marketing";
import { Section, SectionHeading } from "./section";

function Source({ text, href }: { text: string; href: string }) {
  return (
    <a href={href} rel="noopener" className="inline-flex items-start gap-1 text-body-sm text-text-muted underline-offset-4 hover:text-text-primary hover:underline">
      <span>{text}</span>
      <ArrowUpRight aria-hidden weight="bold" className="mt-0.5 size-3.5 shrink-0" />
    </a>
  );
}

/** Landing section 3 (PRD 5.1): the trust gap, as an asymmetric stat sheet with each source. */
export function TrustGap() {
  const { lead, rest } = trustGap;
  return (
    <Section labelledBy="trust-title" className="border-b border-border-muted">
      <SectionHeading id="trust-title" className="max-w-[22ch]">
        {trustGap.heading}
      </SectionHeading>
      <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-12 md:gap-6">
        <figure className="flex flex-col gap-4 md:col-span-7">
          <p className="font-display text-[5.5rem] leading-none tracking-[-0.04em] text-primary sm:text-[8rem]">{lead.figure}</p>
          <figcaption className="flex max-w-[34ch] flex-col gap-3">
            <span className="text-h3 font-semibold">{lead.text}</span>
            <Source text={lead.source} href={lead.href} />
          </figcaption>
        </figure>
        <div className="flex flex-col gap-10 md:col-span-5 md:border-l md:border-border-default md:pl-8">
          {rest.map((s) => (
            <figure key={s.figure} className="flex flex-col gap-2">
              <p className="font-display text-h1 leading-none tabular-nums">{s.figure}</p>
              <figcaption className="flex flex-col gap-2">
                <span className="text-body-lg">{s.text}</span>
                <Source text={s.source} href={s.href} />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <p className="mt-12 max-w-[60ch] text-body-lg text-text-secondary">{trustGap.closing}</p>
    </Section>
  );
}
