import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RankingFlagReviewForm } from "@/components/ops/ranking-forms";
import { TrustClaimButton } from "@/components/ops/trust-forms";
import { TierBadge, TIERS, type Tier } from "@/components/ui";
import { getRankingFlagCase } from "@/lib/data/ops-ranking";
import { staffRoles } from "@/lib/data/ops-trust";
import { COMPONENT_LABELS, RANKING_FLAG_LABELS, RANKING_FLAG_STATUS } from "@/lib/ops/labels";

export const metadata: Metadata = { title: "Ranking flag" };

const POINT_KEYS = ["work", "skills", "endorsements", "credentials", "momentum", "adjustments", "total"] as const;

function points(n: number | undefined): string {
  return n === undefined || n === null ? "–" : Number(n).toFixed(2);
}

/**
 * One ranking flag (PRD 5.13 anti-gaming): a ring's members and the endorsements between them,
 * or a fast gain with the score before and after; claim, then clear or uphold with a reason.
 */
export default async function OpsRankingFlagPage({ params }: PageProps<"/ops/evidence/ranking/[id]">) {
  const { id } = await params;
  if (!(await staffRoles()).has("trust_reviewer")) notFound();
  const f = await getRankingFlagCase(id);
  if (!f) notFound();
  const open = f.status === "open";
  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-caption font-semibold text-text-secondary uppercase">
            Ranking flag · {RANKING_FLAG_STATUS[f.status]} · {open ? `waiting ${f.age}` : `reviewed ${f.reviewedLabel}`}
          </p>
          <h1 className="font-display text-h1">{RANKING_FLAG_LABELS[f.kind]}</h1>
          <p className="mt-1 text-body text-text-secondary">
            {f.kind === "ring"
              ? "Every pair here endorsed each other within 180 days, through ventures with no outside evidence (no completed deliverable, no GitHub commits from the person endorsed). While open, these endorsements count 0."
              : f.gain?.reason === "completions"
                ? "More than 2 completed ventures in 7 days. While open, the published score and tier stay where they were."
                : "More than 150 points in a day that don't come from a completed venture. While open, the published score and tier stay where they were."}
          </p>
        </div>

        {f.status === "upheld" ? (
          <section aria-labelledby="cv-check-h" className="rounded-lg border-2 border-border-strong bg-bg-subtle p-4" data-testid="cv-check-prompt">
            <h2 id="cv-check-h" className="text-h4">
              Check their verified CVs
            </h2>
            <p className="mt-1 text-body-sm">
              This flag is upheld. A CV issued while it stood may show the gain. Look at each student&rsquo;s CVs and revoke any that
              shouldn&rsquo;t stand (decisions.md 2026-10-01).
            </p>
            <ul className="mt-2 flex flex-wrap gap-3 text-body-sm">
              {f.members
                .filter((m) => m.username)
                .map((m) => (
                  <li key={m.userId}>
                    <Link href={`/ops/evidence?tab=cvs&q=%40${m.username}` as Route} className="font-semibold underline underline-offset-4">
                      CVs of @{m.username}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="members-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
          <h2 id="members-h" className="text-h4">
            {f.members.length === 1 ? "Student" : `Students (${f.members.length})`}
          </h2>
          <ul className="mt-2 divide-y divide-border-muted" data-testid="flag-members">
            {f.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-sm">
                <span className="font-semibold">{m.name}</span>
                {m.username ? <span className="text-text-secondary">@{m.username}</span> : null}
                {m.university ? <span className="text-text-secondary">{m.university}</span> : null}
                {m.tier && (TIERS as readonly string[]).includes(m.tier) ? <TierBadge tier={m.tier as Tier} /> : null}
                {m.total !== null ? <span className="tabular-nums">{points(m.total)} points published</span> : null}
              </li>
            ))}
          </ul>
        </section>

        {f.gain ? (
          <section aria-labelledby="gain-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="gain-h" className="text-h4">
              The gain: +{points(f.gain.gain)}
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {f.gain.completions} completed {f.gain.completions === 1 ? "venture" : "ventures"} in the last 7 days
              {f.gain.exempt > 0 ? `; ${points(f.gain.exempt)} points came from new completions` : ""}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-body-sm" data-testid="gain-table">
                <thead className="text-caption text-text-secondary">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-semibold">Component</th>
                    <th scope="col" className="py-1 pr-3 text-right font-semibold">Published</th>
                    <th scope="col" className="py-1 text-right font-semibold">Held</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {POINT_KEYS.map((k) => (
                    <tr key={k} className={k === "total" ? "font-semibold" : undefined}>
                      <th scope="row" className="py-1 pr-3 font-normal">
                        {COMPONENT_LABELS[k]}
                      </th>
                      <td className="py-1 pr-3 text-right tabular-nums">{points(f.gain!.from[k])}</td>
                      <td className="py-1 text-right tabular-nums">{points(f.gain!.to[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {f.kind === "ring" ? (
          <section aria-labelledby="endorsements-h" className="rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="endorsements-h" className="text-h4">
              Endorsements ({f.endorsements.length})
            </h2>
            <ul className="mt-2 divide-y divide-border-muted">
              {f.endorsements.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-sm">
                  <span className="text-text-secondary">{e.dateLabel}</span>
                  <span>
                    <span className="font-semibold">{e.endorser}</span> endorsed <span className="font-semibold">{e.endorsee}</span> for {e.skill}
                  </span>
                  <span className="text-text-secondary">
                    via {e.venture} ({e.ventureStatus.replace("_", " ")}, {e.deliverables} {e.deliverables === 1 ? "deliverable" : "deliverables"})
                  </span>
                  {e.hidden ? <span className="text-caption text-text-secondary">hidden by the student</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!open && f.reason ? (
          <section aria-labelledby="outcome-h" className="rounded-lg border border-border-default bg-bg-subtle p-4" data-testid="flag-outcome">
            <h2 id="outcome-h" className="text-h4">
              {RANKING_FLAG_STATUS[f.status]}
              {f.reviewer ? ` by ${f.reviewer}` : " automatically"}
            </h2>
            <p className="mt-1 text-body-sm">{f.reason}</p>
          </section>
        ) : null}
      </div>
      <aside>
        {open ? (
          <section aria-labelledby="decide-h" className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
            <h2 id="decide-h" className="text-h4">
              Decide
            </h2>
            {f.isMember ? (
              <p className="text-body-sm text-text-secondary">This flag is about you, so another reviewer decides it.</p>
            ) : (
              <>
                <p className="text-body-sm text-text-secondary">
                  {f.claimedByMe ? "You're reviewing this." : f.claimedBy ? `${f.claimedBy} is reviewing this.` : "Claim it to review."}
                </p>
                {!f.claimedBy || f.claimedByMe ? <TrustClaimButton kind="ranking_flag" id={f.id} claimed={f.claimedByMe} /> : null}
                {f.claimedByMe ? <RankingFlagReviewForm id={f.id} kind={f.kind} /> : null}
              </>
            )}
          </section>
        ) : (
          <p className="text-body-sm text-text-secondary">This flag is closed.</p>
        )}
      </aside>
    </main>
  );
}
