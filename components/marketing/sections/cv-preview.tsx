import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { CvPaper } from "@/components/cv/cv-paper";
import { verifiedCv } from "@/content/marketing";
import { formatCode } from "@/supabase/functions/_shared/cv/sign.ts";
import { FULL_SNAPSHOT } from "@/lib/cv/sample";
import { siteUrl } from "@/lib/cv/site";
import { Section, SectionHeading } from "./section";

/**
 * Landing section 8 (PRD 5.1): the verified CV as a document specimen. The real CV component
 * renders the sample snapshot (lib/cv/sample.ts), labelled as a sample; beside it the verify code
 * and the Verified Stamp's end state (no motion here: the hero has the page's one moment).
 */
export function CvPreview() {
  return (
    <Section labelledBy="cv-title" className="overflow-hidden border-b border-border-muted bg-bg-surface">
      <div className="grid gap-10 md:grid-cols-12 md:gap-6">
        <div className="flex flex-col gap-5 md:col-span-4">
          <SectionHeading id="cv-title">{verifiedCv.heading}</SectionHeading>
          <p className="text-body-lg text-text-secondary">{verifiedCv.body}</p>
          <div className="flex items-center gap-3 rounded-md border border-verified/40 bg-verified-subtle px-4 py-3">
            <ShieldCheck aria-hidden weight="fill" className="size-5 shrink-0 text-verified" />
            <div className="flex min-w-0 flex-col">
              <span className="text-body font-semibold">{verifiedCv.status}</span>
              <span className="text-body-sm font-semibold tracking-[0.06em] text-text-secondary tabular-nums">{formatCode(verifiedCv.sampleCode)}</span>
            </div>
          </div>
          <Link href="/verify" className="inline-flex items-center gap-1.5 self-start text-body font-semibold underline underline-offset-4">
            {verifiedCv.link}
            <ArrowRight aria-hidden weight="bold" className="cta-arrow size-4" />
          </Link>
        </div>
        <figure className="md:col-span-8 md:col-start-6">
          {/* An illustration of the document: one labelled image for assistive tech, so its own h1 isn't the page's. */}
          <div role="img" aria-label={verifiedCv.alt} className="cv-specimen relative max-h-[34rem] overflow-hidden md:max-h-[40rem]">
            <CvPaper snapshot={FULL_SNAPSHOT} code={verifiedCv.sampleCode} issuedAt="2026-09-01T09:00:00Z" siteUrl={siteUrl()} className="overflow-hidden" />
          </div>
          <figcaption className="mt-3 text-body-sm text-text-muted">{verifiedCv.caption}</figcaption>
        </figure>
      </div>
    </Section>
  );
}
