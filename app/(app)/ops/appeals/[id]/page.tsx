import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppealClaimButton, DecideAppealForm } from "@/components/ops/appeal-forms";
import { AuditDiff } from "@/components/ops/audit-diff";
import { Badge } from "@/components/ui";
import { getOpsAppeal } from "@/lib/data/sanctions";
import { APPEAL_STATUS_LABELS, decisionReason, decisionTitle } from "@/lib/ops/appeals";
import { ROLE_LABELS } from "@/lib/ops/nav";

export const metadata: Metadata = { title: "Appeal" };

const DECISION_LINKS: Partial<Record<string, (id: string) => string>> = {
  report_case: (id) => `/ops/reports/${id}`,
  credential: (id) => `/ops/evidence/credentials/${id}`,
  code_check: (id) => `/ops/evidence/code-checks/${id}`,
};

/** /ops/appeals/[id] (screen spec 3.11): the original decision and the appeal; decide (never the original staff member). */
export default async function OpsAppealPage({ params }: PageProps<"/ops/appeals/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await getOpsAppeal(id);
  if (!a) notFound();
  const reason = decisionReason(a.summary);
  const link = DECISION_LINKS[a.type]?.(a.decisionId);
  return (
    <main className="flex flex-col gap-5">
      <p>
        <Link href={"/ops/appeals" as Route} className="text-body-sm underline underline-offset-4">
          All appeals
        </Link>
      </p>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h1">Appeal</h1>
        <p className="text-body-sm text-text-secondary">
          Filed {a.filedLabel} by {a.appellantName ?? "a deleted account"}
          {a.orgName ? ` for ${a.orgName}` : ""}
          {a.filedByStaff ? " (by email, filed by staff)" : ""}. Decided by: {ROLE_LABELS[a.deciderRole]}.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="orig-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="orig-h" className="text-h3">
            Original decision
          </h2>
          <p className="text-body font-semibold">{decisionTitle(a.type, a.summary).replace("your ", "their ")}</p>
          <p className="text-body-sm text-text-secondary">Made by {a.mineOriginally ? "you" : (a.originalStaffName ?? "former staff")}</p>
          {reason ? <p className="text-body">Reason: {reason}</p> : null}
          {typeof a.summary.excerpt === "string" && a.summary.excerpt ? (
            <blockquote className="rounded-md border-l-2 border-border-strong bg-bg-subtle px-3 py-2 text-body-sm break-words">{a.summary.excerpt}</blockquote>
          ) : null}
          {link ? (
            <Link href={link as Route} className="text-body-sm underline underline-offset-4">
              Open the decision
            </Link>
          ) : null}
        </section>
        <section aria-labelledby="appeal-h" className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="appeal-h" className="text-h3">
            Their appeal
          </h2>
          <p className="text-body break-words whitespace-pre-wrap" data-testid="appeal-body">
            {a.body}
          </p>
        </section>
      </div>

      <section aria-labelledby="decide-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="appeal-decision">
        <h2 id="decide-h" className="sr-only">
          Decision
        </h2>
        {a.status !== "pending" ? (
          <>
            <p className="text-body">
              <Badge tone={a.status === "overturned" ? "success" : "neutral"}>{APPEAL_STATUS_LABELS[a.status]}</Badge> {a.decidedLabel} by {a.decidedByName ?? "former staff"}. Final.
            </p>
            {a.decisionReason ? <p className="text-body">Reason: {a.decisionReason}</p> : null}
            {a.outcome && Object.keys(a.outcome).length ? (
              <details className="text-body-sm">
                <summary className="cursor-pointer underline underline-offset-4">What changed</summary>
                <div className="mt-2">
                  <AuditDiff before={null} after={a.outcome} />
                </div>
              </details>
            ) : null}
          </>
        ) : a.mineOriginally ? (
          <p className="text-body" role="note">
            You made the original decision, so another staff member must decide this appeal.
          </p>
        ) : a.claimedBy && !a.claimedByMe ? (
          <p className="text-body">{a.claimedBy} is deciding this appeal.</p>
        ) : (
          <>
            <AppealClaimButton id={a.id} claimed={a.claimedByMe} />
            {a.claimedByMe ? <DecideAppealForm id={a.id} /> : <p className="text-body-sm text-text-secondary">Claim the appeal to decide it.</p>}
          </>
        )}
      </section>
    </main>
  );
}
