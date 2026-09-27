import type { Metadata } from "next";
import { AgreementText } from "@/components/agreement/agreement-text";
import { getCurrentAgreement } from "@/lib/data/agreement";
import { safeNext } from "@/lib/auth/gate";
import { createClient } from "@/lib/supabase/server";
import { AcceptAgreementForm } from "./accept-form";

export const metadata: Metadata = { title: "User Agreement" };

/**
 * Blocking agreement screen (PRD 5.27): a newly published version must be accepted at the
 * next sign-in, with a short "What changed"; Google signups accept here the first time.
 */
export default async function AgreementPage({ searchParams }: PageProps<"/agreement">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const agreement = await getCurrentAgreement();
  const supabase = await createClient();
  const { data: previous } = await supabase.from("agreement_acceptances").select("version").limit(1);
  const isUpdate = (previous?.length ?? 0) > 0;

  if (!agreement) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--page-gutter)] py-10">
        <h1 className="font-display text-h1">User Agreement</h1>
        <p className="mt-3 text-body text-text-secondary">There&apos;s no agreement to accept right now.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-10">
      <div>
        <h1 className="font-display text-h1">{isUpdate ? "We've updated our User Agreement" : agreement.title}</h1>
        <p className="mt-2 text-body text-text-secondary">
          {isUpdate
            ? "Read what changed, then accept to keep using Skilient."
            : "Accept the User Agreement and Privacy Notice to finish setting up your account."}
        </p>
      </div>
      {isUpdate && agreement.summary ? (
        <section aria-labelledby="changes" className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 id="changes" className="text-h4">
            What changed
          </h2>
          <p className="mt-2 text-body text-text-secondary">{agreement.summary}</p>
        </section>
      ) : null}
      <section
        aria-label={`${agreement.title}, version ${agreement.version}`}
        className="max-h-[50dvh] overflow-y-auto rounded-lg border border-border-default bg-bg-surface p-5"
        tabIndex={0}
      >
        <AgreementText markdown={agreement.body} />
      </section>
      <AcceptAgreementForm version={agreement.version} next={next} />
    </main>
  );
}
