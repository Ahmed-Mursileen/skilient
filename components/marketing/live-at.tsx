import { liveAt } from "@/content/marketing";
import type { LandingStats } from "@/lib/data/marketing";

const NUMBER_KEYS = ["verified_students", "ventures", "shipped_ventures"] as const;

/**
 * Landing section 2 (PRD 5.1): the universities already on Skilient, as text (logos need written
 * permission), and each live number once it passes 200. The database returns null below the
 * threshold, so a small number can't reach the page; with nothing to show, the section is absent.
 */
export function LiveAt({ stats }: { stats: LandingStats }) {
  const numbers = NUMBER_KEYS.filter((k) => typeof stats[k] === "number" && (stats[k] as number) >= 200);
  if (!stats.universities.length && !numbers.length) return null;
  return (
    <section aria-labelledby="live-at-title" className="border-b border-border-muted" data-testid="live-at">
      <div className="mx-auto flex max-w-page flex-col gap-8 px-[var(--page-gutter)] py-12 sm:py-16">
        {stats.universities.length ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:gap-8">
            <h2 id="live-at-title" className="shrink-0 text-h4 text-text-secondary">
              {liveAt.heading}
            </h2>
            <ul className="live-list flex flex-wrap items-baseline font-display text-h2 leading-snug">
              {stats.universities.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        ) : (
          <h2 id="live-at-title" className="sr-only">
            Skilient in numbers
          </h2>
        )}
        {numbers.length ? (
          <dl className="grid gap-6 sm:grid-cols-3" data-testid="live-numbers">
            {numbers.map((k) => (
              <div key={k} className="flex flex-col-reverse gap-1">
                <dt className="text-body text-text-secondary">{liveAt.numbers[k]}</dt>
                <dd className="font-display text-h1 tabular-nums">{(stats[k] as number).toLocaleString("en-PK")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
