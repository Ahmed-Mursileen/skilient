import { Certificate, SealCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CredentialForm } from "@/components/credentials/credential-form";
import { DeleteCredential } from "@/components/credentials/delete-credential";
import { Badge, EmptyState } from "@/components/ui";
import { CREDENTIAL_STATUS_LABELS } from "@/lib/credentials/constants";
import { getMyCredentials } from "@/lib/data/credentials";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Credentials" };

const TONE = { pending: "warning", approved: "verified", rejected: "error", expired: "neutral" } as const;

/**
 * /me/credentials (PRD 5.19, screen spec "Credentials"): the student's certificates with
 * their review status, and the upload form. Only approved, unexpired ones reach the profile
 * and the score; files are private to the student and the reviewer.
 */
export default async function CredentialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/me/credentials");
  const credentials = await getMyCredentials(user.id);

  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-8 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Credentials</h1>
        <p className="mt-1 text-body text-text-secondary">
          Certificates from courses, programmes and exams. A Skilient reviewer checks each one before it shows on your profile;
          the file stays private to you and the reviewer.
        </p>
      </div>

      <section aria-labelledby="yours" className="flex flex-col gap-3">
        <h2 id="yours" className="text-h3">
          Yours
        </h2>
        {credentials.length ? (
          <ul className="flex flex-col gap-3">
            {credentials.map((c) => (
              <li key={c.id} className="rounded-lg border border-border-default bg-bg-surface p-4" aria-label={c.title}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-semibold break-words">{c.title}</p>
                    <p className="text-body-sm text-text-secondary">
                      {c.issuer} · issued {c.issuedLabel}
                      {c.expiresLabel ? ` · expires ${c.expiresLabel}` : ""} · {c.fileType === "pdf" ? "PDF" : "Image"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TONE[c.status]}>{CREDENTIAL_STATUS_LABELS[c.status]}</Badge>
                    <DeleteCredential id={c.id} title={c.title} />
                  </div>
                </div>
                {c.recognised && c.status === "approved" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-body-sm">
                    <SealCheck aria-hidden weight="fill" className="size-4 text-verified" />
                    Recognised issuer: counts 1.5× in your score.
                  </p>
                ) : null}
                {c.status === "rejected" && c.reviewReason ? (
                  <p className="mt-2 text-body-sm">
                    <span className="font-semibold">Reviewer&apos;s note:</span> {c.reviewReason}
                  </p>
                ) : null}
                {c.status === "pending" ? (
                  <p className="mt-2 text-body-sm text-text-secondary">Sent {c.submittedLabel}. Reviews usually take up to 3 days.</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Certificate aria-hidden className="size-8" />}
            title="No credentials yet"
            description="Add a certificate below. Once approved it shows on your profile and counts toward your score."
          />
        )}
      </section>

      <section className="rounded-lg border border-border-default bg-bg-surface p-5">
        <CredentialForm />
      </section>
    </main>
  );
}
