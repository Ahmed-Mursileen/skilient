import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimButton } from "@/components/ops/claim-button";
import { ResolveForm } from "@/components/ops/resolve-form";
import { getCase } from "@/lib/data/ops";
import { staffRoles } from "@/lib/data/ops-trust";
import { REASON_LABELS, STATUS_LABELS, TARGET_LABELS } from "@/lib/ops/labels";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Report" };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** /ops/reports/[id] (screen spec 3.11): content, attached messages only, history, action with a reason. */
export default async function OpsCasePage({ params }: PageProps<"/ops/reports/[id]">) {
  const { id } = await params;
  if (!(await staffRoles()).has("moderator")) notFound();
  const c = await getCase(id);
  if (!c) notFound();
  const s = c.snapshot;
  const author = text(s.author);
  const body = text(s.body) ?? text(s.bio);
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-caption font-semibold text-text-secondary uppercase">
            {TARGET_LABELS[c.targetType]} · {STATUS_LABELS[c.status]} · waiting {c.openedAge}
          </p>
          <h1 className="font-display text-h1">Report</h1>
        </div>

        <section aria-labelledby="content-h" className="rounded-lg border border-border-default bg-bg-surface p-4" data-testid="case-content">
          <h2 id="content-h" className="text-h4">
            Reported {TARGET_LABELS[c.targetType].toLowerCase()}
          </h2>
          <p className="mt-1 text-caption text-text-secondary">
            As it was when first reported{author ? `, by ${author}` : ""}
            {text(s.author_username) ? ` (@${s.author_username as string})` : ""}.
          </p>
          {text(s.title) ? <p className="mt-3 text-body font-semibold">{s.title as string}</p> : null}
          {body ? <p className="mt-2 text-body break-words whitespace-pre-wrap">{body}</p> : <p className="mt-2 text-body-sm text-text-secondary">No text.</p>}
          {s.had_image || Number(s.images) > 0 ? <p className="mt-2 text-caption text-text-secondary">Had an image (not kept for review).</p> : null}
        </section>

        {c.targetType === "message" ? (
          <section aria-labelledby="context-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="context-h" className="text-h4">
              Chat context the reporter attached
            </h2>
            <p className="mt-1 text-caption text-text-secondary">Only these messages are visible to staff. The rest of the chat is not.</p>
            <ol className="mt-3 flex flex-col gap-2" data-testid="case-messages">
              {c.messages.map((m) => (
                <li key={m.id} className={cn("rounded-md px-3 py-2", m.reported ? "border border-error bg-bg-subtle" : "bg-bg-subtle")}>
                  <span className="text-caption text-text-secondary">
                    {m.sender ?? "Former member"} · {m.time}
                    {m.reported ? " · reported" : ""}
                  </span>
                  <p className="text-body-sm break-words whitespace-pre-wrap">{m.body || (m.hadImage ? "Image" : "No text")}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section aria-labelledby="reports-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="reports-h" className="text-h4">
            Reports ({c.reportsCount}){c.softSignal ? " and a survey signal" : ""}
          </h2>
          {c.softSignal ? (
            <p className="mt-1 text-body-sm text-text-secondary">At least 3 readers who aren&apos;t friends of the author crossed &ldquo;Appropriate&rdquo;.</p>
          ) : null}
          <ul className="mt-3 divide-y divide-border-muted" data-testid="case-reports">
            {c.reports.map((r, i) => (
              <li key={i} className="py-2">
                <p className="text-body-sm">
                  <span className="font-semibold">{REASON_LABELS[r.reason] ?? r.reason}</span> · {r.reporter} · {r.time}
                </p>
                {r.detail ? <p className="text-body-sm text-text-secondary">&ldquo;{r.detail}&rdquo;</p> : null}
                <p className="text-caption text-text-secondary">
                  Has reported {r.reporterReports} {r.reporterReports === 1 ? "thing" : "things"}; {r.reporterUpheld} upheld.
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        {c.owner ? (
          <section aria-labelledby="owner-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="owner-h" className="text-h4">
              Owner
            </h2>
            <p className="mt-1 text-body-sm">
              {c.owner.username ? (
                <Link href={`/profile/${c.owner.username}` as Route} className="underline underline-offset-4">
                  {c.owner.name}
                </Link>
              ) : (
                c.owner.name
              )}
            </p>
            <p className="text-caption text-text-secondary" data-testid="owner-history">
              {c.owner.cases} other reported {c.owner.cases === 1 ? "item" : "items"}, {c.owner.actioned} actioned, {c.owner.warnings}{" "}
              {c.owner.warnings === 1 ? "warning" : "warnings"}.
            </p>
          </section>
        ) : null}
        <section aria-labelledby="decide-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="decide-h" className="text-h4">
            Decision
          </h2>
          {c.status !== "open" ? (
            <p className="mt-2 text-body-sm" data-testid="case-outcome">
              {STATUS_LABELS[c.status]} by {c.resolvedBy ?? "staff"}, {c.resolvedAt}. Reason: {c.resolutionReason}
            </p>
          ) : c.claimedByMe ? (
            <div className="mt-2 flex flex-col gap-3">
              <ResolveForm caseId={c.id} targetType={c.targetType} />
              <ClaimButton caseId={c.id} claimed />
            </div>
          ) : c.claimedBy ? (
            <p className="mt-2 text-body-sm">{c.claimedBy} is working on this case.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-body-sm text-text-secondary">Claim the case so nobody else works on it at the same time.</p>
              <ClaimButton caseId={c.id} claimed={false} />
            </div>
          )}
        </section>
      </aside>
    </main>
  );
}
