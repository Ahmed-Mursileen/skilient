import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlagResolveForm, TrustClaimButton } from "@/components/ops/trust-forms";
import { getFlagCase, staffRoles } from "@/lib/data/ops-trust";
import { FLAG_LABELS } from "@/lib/ops/labels";

export const metadata: Metadata = { title: "GitHub flag" };

/** One GitHub review flag (PRD 5.5 anti-gaming): the held commits, then clear or uphold once claimed. */
export default async function OpsFlagPage({ params }: PageProps<"/ops/evidence/flags/[id]">) {
  const { id } = await params;
  if (!(await staffRoles()).has("trust_reviewer")) notFound();
  const f = await getFlagCase(Number(id));
  if (!f) notFound();
  const open = f.status === "open";
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-caption font-semibold text-text-secondary uppercase">
            GitHub flag · {f.status} · waiting {f.age}
          </p>
          <h1 className="font-display text-h1">{FLAG_LABELS[f.kind] ?? f.kind}</h1>
          <p className="mt-1 text-body text-text-secondary">
            {f.student} · {f.key}
          </p>
        </div>
        <section aria-labelledby="commits-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="commits-h" className="text-h4">
            Commits held ({f.commits.length})
          </h2>
          <ul className="mt-2 divide-y divide-border-muted">
            {f.commits.map((c) => (
              <li key={`${c.repo}:${c.sha}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-sm">
                <span className="text-text-secondary">{c.dateLabel}</span>
                <span className="font-mono text-code-sm break-all">{c.repo}</span>
                <a href={`https://github.com/${c.repo}/commit/${c.sha}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono text-code-sm underline underline-offset-4">
                  {c.sha.slice(0, 7)}
                  <ArrowSquareOut aria-hidden className="size-3.5" />
                  <span className="sr-only">{" (opens GitHub)"}</span>
                </a>
                <span>{c.lines} lines</span>
                <span className="text-text-secondary">{c.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <aside>
        {open ? (
          <section aria-labelledby="decide-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="decide-h" className="text-h4">
              Decide
            </h2>
            <p className="text-body-sm text-text-secondary">
              {f.claimedByMe ? "You're reviewing this." : f.claimedBy ? `${f.claimedBy} is reviewing this.` : "Claim it to review."}
            </p>
            {!f.claimedBy || f.claimedByMe ? <TrustClaimButton kind="flag" id={String(f.id)} claimed={f.claimedByMe} /> : null}
            {f.claimedByMe ? <FlagResolveForm id={f.id} /> : null}
          </section>
        ) : (
          <p className="text-body-sm text-text-secondary">This flag is resolved.</p>
        )}
      </aside>
    </main>
  );
}
