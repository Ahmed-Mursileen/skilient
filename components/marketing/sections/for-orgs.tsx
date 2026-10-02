import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { forOrgs, isBuilt } from "@/content/marketing";
import { Section, SectionHeading } from "./section";

/**
 * Landing section 11 (PRD 5.1): recruiters, universities and faculty as full-width index rows
 * (not three equal cards; decisions 2026-10-02). A row links to its page once that page ships.
 */
export function ForOrgs() {
  return (
    <Section labelledBy="orgs-title" className="border-b border-border-muted">
      <SectionHeading id="orgs-title">{forOrgs.heading}</SectionHeading>
      <ul className="mt-8 border-t border-border-default">
        {forOrgs.rows.map((row) => (
          <li key={row.label} className="border-b border-border-default">
            <Link
              href={isBuilt(row.page) ? row.page : row.fallback}
              className="org-row group grid gap-1 py-6 sm:grid-cols-12 sm:items-baseline sm:gap-6 sm:py-8"
            >
              <span className="font-display text-h2 sm:col-span-4">{row.label}</span>
              <span className="text-body-lg text-text-secondary sm:col-span-7">{row.text}</span>
              <ArrowRight aria-hidden weight="bold" className="cta-arrow hidden size-6 justify-self-end text-primary sm:col-span-1 sm:block" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
