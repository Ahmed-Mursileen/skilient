import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CredentialReviewForm, TrustClaimButton } from "@/components/ops/trust-forms";
import { CREDENTIAL_STATUS_LABELS } from "@/lib/credentials/constants";
import { getCredentialCase, staffRoles } from "@/lib/data/ops-trust";

export const metadata: Metadata = { title: "Credential" };

/**
 * One credential for a trust reviewer (PRD 5.19): what the student entered, the file through
 * a 60-second signed URL, and the decision once claimed. Staff never download it elsewhere.
 */
export default async function OpsCredentialPage({ params }: PageProps<"/ops/evidence/credentials/[id]">) {
  const { id } = await params;
  if (!(await staffRoles()).has("trust_reviewer")) notFound();
  const c = await getCredentialCase(id);
  if (!c) notFound();
  const pending = c.status === "pending";
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-caption font-semibold text-text-secondary uppercase">
            Credential · {CREDENTIAL_STATUS_LABELS[c.status]} · waiting {c.age}
          </p>
          <h1 className="font-display text-h1 break-words">{c.title}</h1>
        </div>
        <dl className="grid gap-4 rounded-lg border border-border-default bg-bg-surface p-4 sm:grid-cols-2">
          <div>
            <dt className="text-label text-text-secondary uppercase">Student</dt>
            <dd className="mt-1 text-body">
              {c.student}
              {c.username ? <span className="text-text-secondary"> (@{c.username})</span> : null}
              {c.university ? <span className="block text-body-sm text-text-secondary">{c.university}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-label text-text-secondary uppercase">Issuer as entered</dt>
            <dd className="mt-1 text-body">{c.issuer}</dd>
          </div>
          <div>
            <dt className="text-label text-text-secondary uppercase">Dates</dt>
            <dd className="mt-1 text-body">
              Issued {c.issuedLabel}
              {c.expiresLabel ? `, expires ${c.expiresLabel}` : ", no expiry"}
            </dd>
          </div>
          <div>
            <dt className="text-label text-text-secondary uppercase">Verification link</dt>
            <dd className="mt-1 text-body break-all">
              {c.verifyUrl ? (
                <a href={c.verifyUrl} target="_blank" rel="noreferrer noopener nofollow" className="underline underline-offset-4">
                  {c.verifyUrl}
                  <span className="sr-only">{" (opens in a new tab)"}</span>
                </a>
              ) : (
                "None given"
              )}
            </dd>
          </div>
        </dl>
        <section aria-labelledby="file-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="file-h" className="text-h4">
            File ({c.fileType === "pdf" ? "PDF" : "image"}, {c.fileKb} KB)
          </h2>
          {!c.fileUrl ? (
            <p className="text-body-sm text-text-secondary">The file has been deleted.</p>
          ) : c.fileType === "image" ? (
            // A signed Supabase URL: next/image would proxy it through our server.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.fileUrl} alt={`The uploaded certificate: ${c.title}`} className="max-h-[70vh] w-auto rounded-md border border-border-default object-contain" />
          ) : null}
          {c.fileUrl ? (
            <a href={c.fileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 self-start text-body-sm font-semibold underline underline-offset-4">
              Open the file
              <ArrowSquareOut aria-hidden className="size-4" />
              <span className="sr-only">{" (opens in a new tab; the link works for one minute)"}</span>
            </a>
          ) : null}
          <p className="text-caption text-text-secondary">The link works for one minute; reload the page for a new one.</p>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        {pending ? (
          <section aria-labelledby="decide-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="decide-h" className="text-h4">
              Decide
            </h2>
            <p className="text-body-sm text-text-secondary">
              {c.claimedByMe ? "You're reviewing this." : c.claimedBy ? `${c.claimedBy} is reviewing this.` : "Claim it to review."}
            </p>
            {!c.claimedBy || c.claimedByMe ? <TrustClaimButton kind="credential" id={c.id} claimed={c.claimedByMe} /> : null}
            {c.claimedByMe ? <CredentialReviewForm id={c.id} issuers={c.issuers} suggested={c.suggestedIssuer} /> : null}
          </section>
        ) : (
          <section aria-labelledby="done-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="done-h" className="text-h4">
              {CREDENTIAL_STATUS_LABELS[c.status]}
            </h2>
            {c.reviewer ? <p className="text-body-sm">By {c.reviewer}</p> : null}
            {c.reviewReason ? <p className="text-body-sm">{c.reviewReason}</p> : null}
          </section>
        )}
      </aside>
    </main>
  );
}
