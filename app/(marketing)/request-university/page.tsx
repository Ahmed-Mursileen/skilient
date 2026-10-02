import type { Metadata } from "next";
import Link from "next/link";
import { UniversityRequestForm } from "@/components/marketing/university-request-form";
import { requestUniversity as copy } from "@/content/marketing";
import { detectUniversity, normalizeEmail, universityLabel } from "@/lib/auth/email-domain";
import { loadDomainDirectory } from "@/lib/data/universities";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: copy.title, description: copy.intro };

/**
 * /request-university (PRD 5.1): the full-page version of the request sheet, and where the
 * email field lands without JavaScript. A known university is named; otherwise the visitor types it.
 */
export default async function RequestUniversityPage({ searchParams }: PageProps<"/request-university">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? normalizeEmail(sp.email).slice(0, 254) : "";
  const detection = email ? detectUniversity(email, await loadDomainDirectory().catch(() => ({ domains: {}, personal: [] }))) : null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] pt-12 pb-24 sm:pt-16">
      <h1 className="font-display text-h1">{copy.title}</h1>
      {detection?.kind === "match" ? (
        <p className="text-body-lg">
          {universityLabel(detection.universities)} is already on Skilient.{" "}
          <Link href={`/signup?email=${encodeURIComponent(email)}`} className="font-semibold underline underline-offset-4">
            Join now
          </Link>
        </p>
      ) : (
        <>
          <p className="max-w-[56ch] text-body-lg text-text-secondary">{copy.intro}</p>
          <UniversityRequestForm
            defaultEmail={email}
            university={detection?.kind === "not_live" ? universityLabel(detection.universities) : null}
            siteKey={turnstileSiteKey()}
            idPrefix="page"
          />
        </>
      )}
    </div>
  );
}
