import { Binoculars, LockSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { DeleteSavedSearchButton, SaveSearchForm } from "@/components/recruit/saved-search";
import { TalentFilterForm } from "@/components/recruit/talent-filter-form";
import { Avatar, Badge, Button, EmptyState, SkillChip, TierBadge } from "@/components/ui";
import type { SkillLevel } from "@/components/ui";
import { getMyOrg, exploreTalent, getOrgPlan, getSavedSearches, getTalentFacets, searchTalent, type TalentRow } from "@/lib/data/recruit";
import { isRefusal } from "@/lib/data/rpc-json";
import { filtersFromParams, filtersToParams } from "@/lib/recruit/constants";
import { publicImageUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Talent" };

const PAGE = 20;

/**
 * /recruit/search (PRD 5.20). Explore (free) shows tier, skills and levels, university, department,
 * batch and an activity band: no names, photos or links. Full results need the talent.full_profile
 * plan. Ordered by skill match, then recent activity, then tier: never by payment. Each search is audited.
 */
export default async function TalentSearchPage({ searchParams }: PageProps<"/recruit/search">) {
  const org = await getMyOrg();
  if (org?.status !== "verified") {
    return (
      <EmptyState
        icon={<LockSimple aria-hidden className="size-8" />}
        title="Talent search opens when you're verified"
        description="Until a Skilient reviewer verifies your organisation you can build your company page but see no talent data."
      />
    );
  }
  const sp = await searchParams;
  const filters = filtersFromParams(sp);
  const offset = Math.min(Math.max(Number(typeof sp.o === "string" ? sp.o : 0) || 0, 0), 200);
  const plan = await getOrgPlan();
  const full = plan.entitlements["talent.full_profile"] === true;
  const [facets, saved, page] = await Promise.all([
    getTalentFacets(),
    getSavedSearches(),
    (full ? searchTalent(filters, offset) : exploreTalent(filters, offset)).catch((err: unknown) => {
      if (isRefusal(err, "22023")) return null;
      throw err;
    }),
  ]);
  const query = filtersToParams(filters);
  const pageHref = (o: number) => {
    const q = new URLSearchParams(query);
    if (o > 0) q.set("o", String(o));
    const s = q.toString();
    return (s ? `/recruit/search?${s}` : "/recruit/search") as Route;
  };
  const hasFilters = query.size > 0;
  return (
    <main className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-6">
        <TalentFilterForm facets={facets} initial={filters} />
        <section aria-labelledby="saved-h" className="flex flex-col gap-3 border-t border-border-default pt-4">
          <h2 id="saved-h" className="text-h4">Saved searches</h2>
          {saved.entitled ? (
            <>
              {hasFilters ? <SaveSearchForm filters={filters} /> : <p className="text-body-sm text-text-muted">Set some filters to save a search.</p>}
              <ul className="flex flex-col gap-1" data-testid="saved-searches">
                {saved.items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <Link href={`/recruit/search?${filtersToParams(s.filters).toString()}` as Route} className="text-body-sm font-semibold underline-offset-4 hover:underline">
                      {s.name}
                    </Link>
                    <span className="flex items-center gap-1 text-caption text-text-secondary">
                      {s.frequency}
                      <DeleteSavedSearchButton id={s.id} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-body-sm text-text-muted">Saved searches email new matches daily or weekly. They come with the Starter plan and above.</p>
          )}
        </section>
      </aside>

      <section aria-labelledby="results-h" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 id="results-h" className="font-display text-h1">Talent</h1>
          <Badge tone={full ? "verified" : "neutral"} data-testid="search-mode">{full ? "Full results" : "Explore: anonymised"}</Badge>
        </div>
        {!full ? (
          <p className="rounded-md border border-border-default bg-bg-subtle px-3 py-2 text-body-sm" data-testid="explore-note">
            Explore shows tier, skills, university, department, batch and activity only. Names, photos and profiles open with a talent search plan; contact credits never reveal anyone, because a student reveals themselves by accepting your request.
          </p>
        ) : null}
        {page === null ? (
          <EmptyState title="Check your filters" description="One of the filters wasn't valid. Clear them and try again." />
        ) : page.results.length === 0 ? (
          <EmptyState
            icon={<Binoculars aria-hidden className="size-8" />}
            title="No students match these filters"
            description="Only students who opted in to recruiter visibility appear. Loosen a filter, or lower a minimum level."
            action={<Button asChild variant="secondary"><Link href={"/recruit/search" as Route}>Clear filters</Link></Button>}
          />
        ) : (
          <>
            <p className="text-body-sm text-text-secondary" data-testid="result-count">{page.total} {page.total === 1 ? "student" : "students"} match</p>
            <ul className="flex flex-col gap-3" data-testid="talent-results">
              {page.results.map((r, i) => (
                <ResultRow key={r.id ?? `${offset}-${i}`} row={r} />
              ))}
            </ul>
            <nav aria-label="Pages" className="flex items-center justify-between">
              {offset > 0 ? <Button asChild variant="secondary" size="sm"><Link href={pageHref(offset - PAGE)}>Previous</Link></Button> : <span />}
              {offset + PAGE < Math.min(page.total, 220) ? <Button asChild variant="secondary" size="sm"><Link href={pageHref(offset + PAGE)}>Next</Link></Button> : <span />}
            </nav>
          </>
        )}
      </section>
    </main>
  );
}

function ResultRow({ row }: { row: TalentRow }) {
  const inner = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {row.name ? <Avatar name={row.name} src={publicImageUrl("avatars", row.avatar_path ?? null)} size="sm" /> : null}
        <span className="text-h4">{row.name ?? "Student"}</span>
        {row.tier ? <TierBadge tier={row.tier} /> : null}
        {row.contacted ? <Badge>Contacted</Badge> : null}
      </div>
      <p className="text-body-sm text-text-secondary">
        {[row.university, row.department, row.batch ? `Batch ${row.batch}` : null, row.activity].filter(Boolean).join(" · ")}
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
        {row.skills.map((s) => (
          <li key={s.name}>
            <SkillChip name={s.name} level={s.level as SkillLevel} verified={s.code_check} aiAssisted={s.ai_assisted} />
          </li>
        ))}
      </ul>
      <p className="text-body-sm" data-testid="why-match">Why this match: {row.why || "it fits your filters"}.</p>
    </>
  );
  return (
    <li className="rounded-lg border border-border-default bg-bg-surface p-4" data-testid="talent-row">
      {row.id ? (
        <Link href={`/recruit/candidates/${row.id}` as Route} className="flex flex-col gap-2 rounded-md focus-visible:outline-2">
          {inner}
        </Link>
      ) : (
        <div className="flex flex-col gap-2">{inner}</div>
      )}
    </li>
  );
}
