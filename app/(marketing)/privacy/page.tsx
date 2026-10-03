import type { Metadata } from "next";
import { legalPages } from "@/content/marketing";

const copy = legalPages.privacy;

export const metadata: Metadata = { title: copy.title, description: copy.description, robots: { index: false, follow: true } };

/** /privacy (PRD 5.1): headings only until the policy is written (a launch blocker in the setup checklist). */
export default function PrivacyPage() {
  return (
    <article aria-labelledby="page-title" className="mx-auto flex max-w-[44rem] flex-col gap-6 px-[var(--page-gutter)] pt-12 pb-20 sm:pt-16">
      <h1 id="page-title" className="font-display text-h1">
        {copy.title}
      </h1>
      <p className="text-body-lg text-text-secondary">{copy.intro}</p>
      <ol className="flex list-decimal flex-col gap-3 pl-6 text-body" data-testid="privacy-headings">
        {copy.headings.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ol>
    </article>
  );
}
