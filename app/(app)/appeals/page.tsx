import { Scales } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { AppealButton } from "@/components/appeals/appeal-button";
import { Badge, EmptyState } from "@/components/ui";
import { getMyAppealable, getMyAppeals, getMyRestriction } from "@/lib/data/sanctions";
import { APPEAL_STATUS_LABELS, decisionReason, decisionTitle } from "@/lib/ops/appeals";

export const metadata: Metadata = { title: "Appeals" };

/**
 * /appeals (PRD 5.26): decisions about you (or an organisation you administer) that you can still
 * appeal, for 30 days, once each; and the appeals you sent. Never names the staff involved.
 */
export default async function AppealsPage() {
  const [restriction, appealable, appeals] = await Promise.all([getMyRestriction(), getMyAppealable(), getMyAppeals()]);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">Appeals</h1>
        <p className="text-body text-text-secondary">
          If you think a Skilient decision about you is wrong, appeal it within 30 days. A different staff member reviews it; you can appeal each
          decision once, and that review is final.
        </p>
        {restriction ? (
          <p className="text-body" data-testid="appeals-restriction">
            Your account is {restriction.kind === "ban" ? "banned" : "suspended"}
            {restriction.untilLabel ? ` until ${restriction.untilLabel}` : ""}.
          </p>
        ) : null}
      </header>

      <section aria-labelledby="open-h" className="flex flex-col gap-3">
        <h2 id="open-h" className="text-h2 font-display">
          Decisions you can appeal
        </h2>
        {appealable.length ? (
          <ul className="flex flex-col gap-3">
            {appealable.map((a) => {
              const title = decisionTitle(a.type, a.summary);
              const reason = decisionReason(a.summary);
              return (
                <li key={`${a.type}:${a.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="appealable">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-body font-semibold">{title}</p>
                    {reason ? <p className="text-body-sm break-words">Reason given: {reason}</p> : null}
                    <p className="text-caption text-text-secondary">
                      Decided {a.decidedLabel} · appeal by {a.deadlineLabel}
                    </p>
                  </div>
                  <AppealButton type={a.type} id={a.id} title={title} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Scales aria-hidden className="size-8" />} title="Nothing to appeal" description="Decisions about your account or content appear here for 30 days." />
        )}
      </section>

      {appeals.length ? (
        <section aria-labelledby="sent-h" className="flex flex-col gap-3">
          <h2 id="sent-h" className="text-h2 font-display">
            Your appeals
          </h2>
          <ul className="flex flex-col gap-3">
            {appeals.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="my-appeal">
                <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
                  {decisionTitle(a.type, a.summary)}
                  <Badge tone={a.status === "overturned" ? "success" : a.status === "pending" ? "info" : "neutral"}>{APPEAL_STATUS_LABELS[a.status]}</Badge>
                </p>
                <p className="text-body-sm break-words whitespace-pre-wrap text-text-secondary">{a.body}</p>
                <p className="text-caption text-text-secondary">
                  Sent {a.filedLabel}
                  {a.decidedLabel ? ` · decided ${a.decidedLabel}` : ""}
                </p>
                {a.decisionReason ? <p className="text-body-sm">Reviewer&apos;s reason: {a.decisionReason}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
