import { cvCss, type CvTemplate } from "@/lib/cv/document";
import type { CvSnapshotV1 } from "@/lib/cv/types";
import { cn } from "@/lib/cn";
import { CvDocument } from "./cv-document";

/**
 * The CV as a sheet of paper (PRD 5.18): the same document and template CSS the PDF prints, so
 * the web CV and the PDF always read the same. It stays light in dark mode, like a printed page.
 */
export function CvPaper({
  snapshot,
  code,
  issuedAt,
  template = "standard",
  siteUrl,
  qrDataUri,
  className,
}: {
  snapshot: CvSnapshotV1;
  code: string;
  issuedAt: string;
  template?: CvTemplate;
  siteUrl: string;
  qrDataUri?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border-default bg-white p-6 text-[#0e0d0b] shadow-2 sm:p-10", className)} data-testid="cv-paper">
      <style>{cvCss(template)}</style>
      <CvDocument snapshot={snapshot} code={code} issuedAt={issuedAt} template={template} siteUrl={siteUrl} qrDataUri={qrDataUri} />
    </div>
  );
}
