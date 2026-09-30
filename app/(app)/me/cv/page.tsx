import { FirstVisitTip } from "@/components/learn/first-visit-tip";
import type { Metadata } from "next";
import { CvExport } from "@/components/cv/cv-export";
import { CvPaper } from "@/components/cv/cv-paper";
import { CvSettingsForm } from "@/components/cv/cv-settings-form";
import { CvVersions } from "@/components/cv/cv-versions";
import { ShareLinks } from "@/components/cv/share-links";
import { EmptyState, ErrorState } from "@/components/ui";
import { qrDataUri } from "@/lib/cv/qr";
import { siteUrl } from "@/lib/cv/site";
import { verifyUrl } from "@/lib/cv/document";
import { getMyCv } from "@/lib/data/cv";
import { formatCode } from "@/supabase/functions/_shared/cv/sign.ts";

export const metadata: Metadata = { title: "Your verified CV", robots: { index: false } };

/**
 * /me/cv (PRD 5.18, screen spec "My CV"): the signed CV as it reads today, and the controls
 * rail: sections and order, share links (Spark+), versions, PDF export (Pro) and views.
 */
export default async function MyCvPage() {
  const cv = await getMyCv();
  if (cv.state === "not_eligible") {
    return (
      <main className="mx-auto w-full max-w-[680px] px-[var(--page-gutter)] py-8">
        <h1 className="font-display text-h1">Your verified CV</h1>
        <EmptyState className="mt-6" title="Your CV starts after onboarding" description="Verified CVs are for students who finished onboarding." />
      </main>
    );
  }
  if (cv.state === "unavailable") {
    return (
      <main className="mx-auto w-full max-w-[680px] px-[var(--page-gutter)] py-8">
        <h1 className="font-display text-h1">Your verified CV</h1>
        <ErrorState
          className="mt-6"
          title="We couldn't prepare your CV"
          description="Signing your first CV didn't work just now. Reload the page in a minute."
        />
      </main>
    );
  }

  const site = siteUrl();
  const latest = cv.latest;
  const qr = latest.snapshot && !latest.revoked ? await qrDataUri(verifyUrl(site, latest.code)) : undefined;
  return (
    <main className="mx-auto grid w-full max-w-[1200px] gap-8 px-[var(--page-gutter)] py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <FirstVisitTip id="cv" />
        <div>
          <h1 className="font-display text-h1">Your verified CV</h1>
          <p className="mt-1 text-body text-text-secondary">
            Built from your verified work only and signed by Skilient, so anyone can check it with its code. Code{" "}
            <span className="font-mono">{formatCode(latest.code)}</span>, issued {latest.issuedLabel}.
          </p>
        </div>
        {latest.revoked || !latest.snapshot ? (
          <EmptyState
            title="Your newest version is revoked"
            description="Anyone who checks its code sees Revoked, and your share links say the CV is no longer available. Issue it again under a new code from Versions."
          />
        ) : (
          <CvPaper snapshot={latest.snapshot} code={latest.code} issuedAt={latest.issuedAt} siteUrl={site} qrDataUri={qr} />
        )}
      </div>

      <aside className="flex flex-col gap-6" aria-label="CV controls">
        <section aria-labelledby="refresh-h" className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="refresh-h" className="text-h3">
            Updates
          </h2>
          <p className="mt-2 text-body-sm text-text-secondary">
            Your CV refreshes on {cv.nextRefreshLabel} with the month&rsquo;s new work, if anything changed. Each refresh gets a new code;
            older codes show Superseded.
          </p>
          <p className="mt-2 text-body-sm text-text-secondary" data-testid="cv-views">
            Views through your links: {cv.views.last30} in the last 30 days, {cv.views.total} in all.
          </p>
        </section>

        <section aria-labelledby="settings-h" className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="settings-h" className="mb-3 text-h3">
            What your CV shows
          </h2>
          <CvSettingsForm initial={cv.settings} applyLabel={cv.nextRefreshLabel} />
        </section>

        <section aria-labelledby="links-h" className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="links-h" className="mb-3 text-h3">
            Share links
          </h2>
          <ShareLinks links={cv.links} canShare={cv.canShare} paused={cv.settings.visibility === "private"} />
        </section>

        <section aria-labelledby="export-h" className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="export-h" className="mb-3 text-h3">
            PDF
          </h2>
          {latest.revoked ? (
            <p className="text-body-sm text-text-secondary">Issue your CV again before exporting a PDF.</p>
          ) : (
            <CvExport recordId={latest.id} canExport={cv.rights.pdfExport} canUseTemplates={cv.rights.templates} />
          )}
        </section>

        <section aria-labelledby="versions-h" className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="versions-h" className="mb-3 text-h3">
            Versions
          </h2>
          <CvVersions versions={cv.versions} />
        </section>
      </aside>
    </main>
  );
}
