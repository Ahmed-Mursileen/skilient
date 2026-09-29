import type { Metadata, Route } from "next";
import Link from "next/link";
import { EmptyState, TierBadge, tierLabel } from "@/components/ui";
import { getMyScore, type ComponentView, type EvidenceLine } from "@/lib/data/ranking";
import { points } from "@/lib/ranking/labels";

export const metadata: Metadata = { title: "Your score" };

function signed(n: number): string {
  if (n === 0) return "no change";
  return `${n > 0 ? "+" : "−"}${points(Math.abs(n))}`;
}

/**
 * /me/score (PRD 5.17, screen spec "Score breakdown"): the owner's score from the last nightly
 * run, every component with the evidence behind its points, this week's change, decay or an
 * exam pause, a held gain, and what the next tier needs.
 */
export default async function ScorePage() {
  const s = await getMyScore();
  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Your score</h1>
        <p className="mt-1 text-body text-text-secondary">
          Proof (verified work, skills, endorsements, credentials) never fades; Momentum does when you&rsquo;re inactive. Only you see
          your points. Scores update every night at about 3 AM.
        </p>
      </div>

      {!s.scored ? (
        <EmptyState
          title="No score yet"
          description="You'll get one after the next nightly run. To be ranked, log a contribution on a venture and ask a teammate to confirm it."
        />
      ) : (
        <>
          <section aria-labelledby="total-h" className="flex flex-col gap-3 rounded-lg border border-border-strong bg-bg-surface p-5" data-testid="score-total">
            <h2 id="total-h" className="sr-only">
              Total
            </h2>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <p className="font-display text-display tabular-nums">{points(s.total)}</p>
              <p className="text-body text-text-secondary">points</p>
              {s.tier ? <TierBadge tier={s.tier} /> : <span className="text-body-sm font-semibold text-text-secondary">Not ranked yet</span>}
            </div>
            <p className="text-body-sm text-text-secondary">
              {s.weekDelta !== null ? `This week: ${signed(s.weekDelta)} since ${s.lastWeekLabel}.` : "Your weekly change shows after your first Sunday."}
              {s.updatedLabel ? ` Updated ${s.updatedLabel}.` : ""}
            </p>
          </section>

          <Notices s={s} />

          <section aria-labelledby="next-h" className="rounded-lg border border-border-default bg-bg-surface p-5" data-testid="next-tier">
            <h2 id="next-h" className="text-h3">
              {s.next.tier ? `What ${tierLabel[s.next.tier]} needs` : "You're at the top tier"}
            </h2>
            {s.next.tier ? (
              s.next.needs.length ? (
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body">
                  {s.next.needs.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-body">You meet everything; it shows after the next nightly run.</p>
              )
            ) : null}
          </section>

          {s.components.map((c) => (
            <ComponentSection key={c.key} c={c} />
          ))}

          {s.adjustments.length ? (
            <section aria-labelledby="adj-h" className="rounded-lg border border-border-default bg-bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="adj-h" className="text-h3">
                  Adjustments
                </h2>
                <p className="text-h4 tabular-nums">{points(s.adjustmentsTotal)}</p>
              </div>
              <Evidence lines={s.adjustments} />
            </section>
          ) : null}

          <p className="text-caption text-text-secondary">
            Formula v{s.formulaVersion}. The same rules apply to every student;{" "}
            <Link href="/leaderboard" className="underline underline-offset-4">
              see the leaderboard
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}

function Notices({ s }: { s: Awaited<ReturnType<typeof getMyScore>> }) {
  const notes: { key: string; text: string }[] = [];
  if (s.heldTotal !== null) {
    notes.push({
      key: "held",
      text: `Your score rose quickly, to ${points(s.heldTotal)}, so a Skilient reviewer is checking it. Until then your score and tier stay where they were.`,
    });
  }
  if (s.exam) notes.push({ key: "exam", text: `Exam period (${s.exam.startsLabel} to ${s.exam.endsLabel}): Momentum doesn't fade on these days.` });
  if (s.decay && s.decay.weeks > 0) {
    notes.push({
      key: "decay",
      text: `Momentum is fading: ${s.decay.inactiveDays} days since your last activity${s.decay.lastActiveLabel ? ` (${s.decay.lastActiveLabel})` : ""}${
        s.decay.examDays ? `, not counting ${s.decay.examDays} exam days` : ""
      }, so it's down ${s.decay.percent}%. A post, a contribution or confirming a teammate's entry restarts the clock.`,
    });
  }
  if (s.belowSinceLabel && s.tier && s.tierMet !== s.tier) {
    notes.push({
      key: "below",
      text: `You've been below ${tierLabel[s.tier]} since ${s.belowSinceLabel}. If you're still below on ${s.dropLabel}, your tier drops to ${
        s.tierMet ? tierLabel[s.tierMet] : "the highest one you meet"
      }.`,
    });
  }
  if (!s.ranked) {
    notes.push({ key: "unranked", text: "Not ranked yet: log a contribution on a venture and ask a teammate to confirm it." });
  }
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-2" data-testid="score-notices">
      {notes.map((n) => (
        <li key={n.key} className="rounded-md border border-border-default bg-bg-subtle px-4 py-3 text-body-sm">
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function ComponentSection({ c }: { c: ComponentView }) {
  const share = Math.min(100, Math.round((c.points / c.max) * 100));
  return (
    <section aria-labelledby={`c-${c.key}`} className="rounded-lg border border-border-default bg-bg-surface p-5" data-testid={`component-${c.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`c-${c.key}`} className="text-h3">
          {c.label} <span className="text-body-sm font-normal text-text-secondary">· {c.layer}</span>
        </h2>
        <p className="text-h4 tabular-nums">
          {points(c.points)} <span className="text-body-sm font-normal text-text-secondary">of {points(c.max)}</span>
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-2 text-body-sm text-text-secondary">
        {c.hint}
        {c.delta !== null && c.delta !== 0 ? ` This week: ${signed(c.delta)}.` : ""}
      </p>
      {c.lines.length ? <Evidence lines={c.lines} /> : <p className="mt-3 text-body-sm">{c.empty}</p>}
    </section>
  );
}

function Evidence({ lines }: { lines: EvidenceLine[] }) {
  return (
    <ul className="mt-3 divide-y divide-border-muted">
      {lines.map((l, i) => (
        <li key={`${l.label}-${i}`} className="flex items-start justify-between gap-3 py-2 text-body-sm">
          <span className="min-w-0">
            {l.href ? (
              <Link href={l.href as Route} className="font-semibold underline-offset-4 hover:underline">
                {l.label}
              </Link>
            ) : (
              <span className="font-semibold">{l.label}</span>
            )}
            {l.detail ? <span className="block text-caption text-text-secondary">{l.detail}</span> : null}
          </span>
          {l.points ? <span className="shrink-0 tabular-nums">{points(l.points)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
