import { CheckCircle, ClockCounterClockwise, Prohibit, Question, Warning } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CvPaper } from "@/components/cv/cv-paper";
import { PdfCheck } from "@/components/cv/pdf-check";
import { VerifyColumn } from "@/components/marketing/verify-column";
import { siteUrl } from "@/lib/cv/site";
import { STATUS_TEXT, type VerifyStatus } from "@/lib/cv/status";
import { verifyCode } from "@/lib/data/cv";
import { getCandidateForCode } from "@/lib/data/recruit";
import { cn } from "@/lib/cn";
import { formatCode } from "@/supabase/functions/_shared/cv/sign.ts";

export const metadata: Metadata = { title: "Verify a CV", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ICONS: Record<VerifyStatus, typeof CheckCircle> = {
  valid: CheckCircle,
  superseded: ClockCounterClockwise,
  outdated: ClockCounterClockwise,
  revoked: Prohibit,
  altered: Warning,
  not_found: Question,
};

const TONES: Record<VerifyStatus, string> = {
  valid: "border-verified bg-verified-subtle",
  superseded: "border-border-strong bg-bg-subtle",
  outdated: "border-border-strong bg-bg-subtle",
  revoked: "border-error bg-bg-surface",
  altered: "border-error bg-bg-surface",
  not_found: "border-border-strong bg-bg-subtle",
};

function StatusCard({ status, children }: { status: VerifyStatus; children?: React.ReactNode }) {
  const Icon = ICONS[status];
  return (
    <section aria-labelledby="status-h" className={cn("rounded-lg border-2 p-6", TONES[status])} data-testid="verify-status" data-status={status}>
      <div className="flex items-center gap-3">
        <Icon aria-hidden size={28} weight="fill" />
        <h1 id="status-h" className="font-display text-h2">
          {STATUS_TEXT[status].title}
        </h1>
      </div>
      <p className="mt-2 text-body">{STATUS_TEXT[status].body}</p>
      {children}
    </section>
  );
}

/**
 * /verify/[code] (PRD 5.18; decisions.md 2026-10-01): re-checks the record's Ed25519
 * signature with the key that signed it and shows Valid, Superseded, Outdated, Revoked,
 * Altered or Not found. Revoked shows only the code and dates. A PDF can be checked by its
 * hash (?pdf=). 30 lookups a minute per IP.
 */
export default async function VerifyPage({ params, searchParams }: PageProps<"/verify/[code]">) {
  const { code: raw } = await params;
  const pdf = (await searchParams).pdf;
  const result = await verifyCode(decodeURIComponent(raw), typeof pdf === "string" ? pdf.toLowerCase() : null);

  if (result.status === "rate_limited") {
    return (
      <VerifyColumn>
        <section className="rounded-lg border border-border-strong bg-bg-surface p-6" role="alert">
          <h1 className="font-display text-h2">Too many checks</h1>
          <p className="mt-2 text-body">You can check up to 30 CVs a minute. Try again in a minute.</p>
        </section>
      </VerifyColumn>
    );
  }
  if (result.status === "not_found") {
    return (
      <VerifyColumn>
        <StatusCard status="not_found">
          <p className="mt-4 text-body-sm">
            <Link href="/verify" className="font-semibold underline underline-offset-4">
              Enter a code again
            </Link>
          </p>
        </StatusCard>
      </VerifyColumn>
    );
  }
  if (result.status === "revoked") {
    return (
      <VerifyColumn>
        <StatusCard status="revoked">
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
            <dt className="text-text-secondary">Code</dt>
            <dd className="font-mono">{formatCode(result.code)}</dd>
            <dt className="text-text-secondary">Issued</dt>
            <dd>{result.issuedLabel}</dd>
            <dt className="text-text-secondary">Revoked</dt>
            <dd>{result.revokedLabel}</dd>
          </dl>
        </StatusCard>
      </VerifyColumn>
    );
  }

  // A signed-in recruiter whose organisation may open this student gets the contact entry point (PRD 5.20).
  const candidateId = result.status === "valid" || result.status === "superseded" ? await getCandidateForCode(result.code) : null;
  return (
    <VerifyColumn>
      <StatusCard status={result.status}>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          <dt className="text-text-secondary">Code</dt>
          <dd className="font-mono">{formatCode(result.code)}</dd>
          <dt className="text-text-secondary">Student</dt>
          <dd>{result.snapshot.person.name}</dd>
          <dt className="text-text-secondary">Issued</dt>
          <dd>{result.issuedLabel}</dd>
          <dt className="text-text-secondary">Valid until</dt>
          <dd>{result.expiresLabel}</dd>
          {result.supersededLabel ? (
            <>
              <dt className="text-text-secondary">Newer version</dt>
              <dd>issued {result.supersededLabel}</dd>
            </>
          ) : null}
          <dt className="text-text-secondary">Signature</dt>
          <dd>
            {result.signatureValid ? "Ed25519, checked" : "doesn't match the record"} · key <span className="font-mono">{result.keyId}</span>
          </dd>
          {result.pdfChecked ? (
            <>
              <dt className="text-text-secondary">Your PDF</dt>
              <dd data-testid="pdf-result">{result.pdfMatches ? "matches a PDF issued under this code" : "doesn't match any PDF issued under this code"}</dd>
            </>
          ) : null}
        </dl>
      </StatusCard>
      {candidateId ? (
        <div className="rounded-lg border border-border-default bg-bg-surface p-5" data-testid="recruiter-contact">
          <p className="text-body">
            You&apos;re signed in as a recruiter.{" "}
            <Link href={`/recruit/candidates/${candidateId}` as Route} className="font-semibold underline underline-offset-4">
              Open this candidate to shortlist or contact them
            </Link>
            .
          </p>
        </div>
      ) : null}
      <div className="rounded-lg border border-border-default bg-bg-surface p-5">
        <PdfCheck code={result.code} />
      </div>
      <CvPaper snapshot={result.snapshot} code={result.code} issuedAt={result.issuedAt} siteUrl={siteUrl()} />
    </VerifyColumn>
  );
}
