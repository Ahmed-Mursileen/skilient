import type { Metadata, Route } from "next";
import Link from "next/link";
import { Avatar, Button, EmptyState, TierBadge } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { BOARD_PAGE, getLeaderboard, getLeaderboardFilters, getLeaderboardMe, type BoardFilters, type BoardMe } from "@/lib/data/ranking";
import { SCOPE_LABELS, weeklyChangeLabel, points, type Scope } from "@/lib/ranking/labels";

export const metadata: Metadata = { title: "Leaderboard" };

function parse(sp: Record<string, string | string[] | undefined>): BoardFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const scope: Scope = one("scope") === "global" ? "global" : "university";
  const batch = Number(one("batch"));
  const after = Number(one("after"));
  return {
    scope,
    department: scope === "university" ? one("department")?.slice(0, 80) || null : null,
    batch: scope === "university" && Number.isInteger(batch) && batch > 1980 && batch < 2100 ? batch : null,
    after: Number.isInteger(after) && after > 0 ? after : 0,
  };
}

function href(f: BoardFilters, patch: Partial<BoardFilters>): Route {
  const n = { ...f, ...patch };
  const q = new URLSearchParams();
  if (n.scope === "global") q.set("scope", "global");
  if (n.scope === "university" && n.department) q.set("department", n.department);
  if (n.scope === "university" && n.batch) q.set("batch", String(n.batch));
  if (n.after) q.set("after", String(n.after));
  const s = q.toString();
  return (s ? `/leaderboard?${s}` : "/leaderboard") as Route;
}

/**
 * /leaderboard (PRD 5.17, screen spec "Leaderboard"): university by default, with department and
 * batch filters, or global. Rank, tier and weekly change only; ties share a rank. The board
 * comes from the nightly run, so it doesn't reorder between visits.
 */
export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const f = parse(await searchParams);
  const [rows, me, filters] = await Promise.all([getLeaderboard(f), getLeaderboardMe(f), getLeaderboardFilters()]);
  const last = rows.at(-1);
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Leaderboard</h1>
        <p className="mt-1 text-body text-text-secondary">
          Ranked by verified work and recent activity, updated every night. Points stay private: only you see yours, on{" "}
          <Link href="/me/score" className="underline underline-offset-4">
            your score
          </Link>
          .
        </p>
      </div>

      <MyPlace me={me} />

      <nav aria-label="Leaderboard scope" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
            <li key={s}>
              <Link
                href={href({ scope: s, department: null, batch: null, after: 0 }, {})}
                aria-current={f.scope === s ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  f.scope === s ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {SCOPE_LABELS[s]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {f.scope === "university" ? (
        <form method="get" action="/leaderboard" className="flex flex-wrap items-end gap-3" aria-label="Filter the university board">
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label htmlFor="lb-department" className="text-body-sm font-semibold">
              Department
            </label>
            <select id="lb-department" name="department" defaultValue={f.department ?? ""} className={cn(controlBase, "h-10")}>
              <option value="">All departments</option>
              {filters.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[140px] flex-col gap-1">
            <label htmlFor="lb-batch" className="text-body-sm font-semibold">
              Batch
            </label>
            <select id="lb-batch" name="batch" defaultValue={f.batch ? String(f.batch) : ""} className={cn(controlBase, "h-10")}>
              <option value="">All batches</option>
              {filters.batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {f.department || f.batch ? (
            <Link href={href(f, { department: null, batch: null, after: 0 })} className="self-center text-body-sm underline underline-offset-4">
              Clear filters
            </Link>
          ) : null}
        </form>
      ) : null}

      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full text-left text-body-sm" data-testid="leaderboard">
            <caption className="sr-only">
              {SCOPE_LABELS[f.scope]} leaderboard{f.department ? `, ${f.department}` : ""}
              {f.batch ? `, batch ${f.batch}` : ""}
            </caption>
            <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
              <tr>
                <th scope="col" className="w-16 px-3 py-2 font-semibold">
                  Rank
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Student
                </th>
                <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">
                  This week
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {rows.map((r) => {
                const change = weeklyChangeLabel(r.weeklyChange);
                return (
                  <tr key={r.position} data-testid="leaderboard-row" className={r.isMe ? "bg-bg-subtle" : undefined}>
                    <td className="px-3 py-2 align-middle text-h4 tabular-nums">{r.rank}</td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {r.username ? (
                              <Link href={`/profile/${r.username}` as Route} className="font-semibold underline-offset-4 hover:underline">
                                {r.name}
                              </Link>
                            ) : (
                              <span className="font-semibold">{r.name}</span>
                            )}
                            {r.isMe ? <span className="text-text-secondary">(you)</span> : null}
                            {r.tier ? <TierBadge tier={r.tier} /> : null}
                          </p>
                          <p className="truncate text-caption text-text-secondary">
                            {r.username ? `@${r.username}` : ""}
                            {r.university ? ` · ${r.university}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-middle tabular-nums">
                      <span aria-hidden>{change.text}</span>
                      <span className="sr-only">{change.sr}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={f.after ? "That's everyone" : "No one on this board yet"}
          description={
            f.after
              ? "You've reached the end of the board."
              : "Students appear once a teammate confirms one of their contributions and the nightly run has scored them."
          }
        />
      )}
      <div className="flex flex-wrap justify-between gap-3">
        {f.after ? (
          <Link href={href(f, { after: Math.max(0, f.after - BOARD_PAGE) })} className="text-body-sm font-semibold underline underline-offset-4">
            Previous {BOARD_PAGE}
          </Link>
        ) : (
          <span />
        )}
        {rows.length === BOARD_PAGE && last ? (
          <Link href={href(f, { after: last.position })} className="text-body-sm font-semibold underline underline-offset-4">
            Next {BOARD_PAGE}
          </Link>
        ) : null}
      </div>
    </main>
  );
}

function MyPlace({ me }: { me: BoardMe }) {
  if (me.optedOut) {
    return (
      <p className="rounded-lg border border-border-default bg-bg-surface px-4 py-3 text-body-sm" data-testid="my-place">
        You&rsquo;ve left the leaderboards. Your tier still shows on your profile.{" "}
        <Link href="/settings/privacy" className="font-semibold underline underline-offset-4">
          Show me again
        </Link>
      </p>
    );
  }
  if (!me.ranked) {
    return (
      <p className="rounded-lg border border-border-default bg-bg-surface px-4 py-3 text-body-sm" data-testid="my-place">
        <span className="font-semibold">Not ranked yet.</span> Log a contribution on a venture and ask a teammate to confirm it; you&rsquo;re
        ranked from the next nightly run.{" "}
        <Link href="/me/score" className="underline underline-offset-4">
          Your score
        </Link>
      </p>
    );
  }
  const change = weeklyChangeLabel(me.weeklyChange);
  return (
    <section
      aria-label="Your place"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-strong bg-bg-surface px-4 py-3"
      data-testid="my-place"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-h3 tabular-nums">{me.rank ? `#${me.rank}` : "–"}</p>
        <p className="text-body-sm text-text-secondary">of {me.size} on this board</p>
        {me.tier ? <TierBadge tier={me.tier} /> : null}
        <p className="text-body-sm tabular-nums">
          <span aria-hidden>{change.text}</span>
          <span className="sr-only">{change.sr}</span>
        </p>
      </div>
      <Link href="/me/score" className="text-body-sm font-semibold underline underline-offset-4">
        {points(me.total)} points: see how
      </Link>
    </section>
  );
}
