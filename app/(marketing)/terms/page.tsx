import type { Metadata } from "next";
import { AgreementText } from "@/components/agreement/agreement-text";
import { legalPages } from "@/content/marketing";
import { getCurrentAgreement } from "@/lib/data/agreement";
import { logger } from "@/lib/log";

const copy = legalPages.terms;

export const metadata: Metadata = { title: copy.title, description: copy.description, robots: { index: false, follow: true } };

/** /terms (PRD 5.1): the current user agreement, the same text people accept at signup. */
export default async function TermsPage() {
  const agreement = await getCurrentAgreement().catch((err: unknown) => {
    logger.error("terms.agreement_unavailable", { action: "GET /terms", outcome: "error", error_code: String(err).slice(0, 80) });
    return null;
  });
  return (
    <article aria-labelledby="page-title" className="mx-auto flex max-w-[44rem] flex-col gap-6 px-[var(--page-gutter)] pt-12 pb-20 sm:pt-16">
      <header className="flex flex-col gap-2">
        <h1 id="page-title" className="font-display text-h1">
          {agreement?.title ?? copy.title}
        </h1>
        {agreement ? <p className="text-body-sm text-text-muted">{copy.version.replace("{version}", String(agreement.version))}</p> : null}
      </header>
      {agreement ? <AgreementText markdown={agreement.body} /> : <p className="text-body text-text-secondary">{copy.unavailable}</p>}
    </article>
  );
}
