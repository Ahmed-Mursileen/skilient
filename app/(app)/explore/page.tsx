import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddFriendButton } from "@/components/explore/add-friend-button";
import { ExploreControls } from "@/components/explore/explore-controls";
import { VentureCard } from "@/components/ventures/venture-card";
import { Avatar, EmptyState, Skeleton, SkillChip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { EXPLORE_PAGE, listUniversities, searchPeople, searchVentures, type ExploreFilters, type PersonResult } from "@/lib/data/explore";
import { listTaxonomy } from "@/lib/data/skills";
import { exploreHref, type ExploreState } from "@/lib/explore/href";

export const metadata: Metadata = { title: "Explore" };

const TABS = [
  { value: "people", label: "People" },
  { value: "projects", label: "Projects" },
  { value: "startups", label: "Startups" },
] as const;

const FRIENDSHIP_LABELS = { friends: "Friends", request_sent: "Request sent", request_received: "Wants to be friends" } as const;

/** /explore (PRD 5.10, screen spec 3.3): one search over people, projects and startups; the URL is the state. */
export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab = TABS.some((t) => t.value === one("tab")) ? (one("tab") as ExploreState["tab"]) : "people";
  const state: ExploreState = {
    q: one("q").slice(0, 100),
    tab,
    department: tab === "people" ? one("department").slice(0, 80) : "",
    batch: tab === "people" && /^(19|20)\d\d$/.test(one("batch")) ? one("batch") : "",
    skill: /^[a-z0-9][a-z0-9-]{0,39}$/.test(one("skill")) ? one("skill") : "",
    university: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(one("university")) ? one("university") : "",
  };
  const from = Math.min(Math.max(Number.parseInt(one("from"), 10) || 0, 0), 200);
  const [universities, skills] = await Promise.all([listUniversities(), listTaxonomy()]);

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Explore</h1>
        <p className="mt-1 text-body text-text-secondary">Find students, projects and startups across Pakistan&apos;s universities.</p>
      </div>
      <ExploreControls state={state} universities={universities} skills={skills.map((s) => ({ id: s.id, name: s.name }))} />
      <nav aria-label="Result type" className="border-b border-border-default">
        <ul className="-mb-px flex gap-1">
          {TABS.map((t) => (
            <li key={t.value}>
              <Link
                href={exploreHref(state, { tab: t.value })}
                aria-current={tab === t.value ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-body font-semibold",
                  tab === t.value ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense key={JSON.stringify({ ...state, from })} fallback={<ResultsSkeleton />}>
        <Results state={state} filters={{ q: state.q, department: state.department || null, batch: state.batch ? Number(state.batch) : null, skill: state.skill || null, university: state.university || null, from }} />
      </Suspense>
    </main>
  );
}

async function Results({ state, filters }: { state: ExploreState; filters: ExploreFilters }) {
  if (state.tab === "people" && filters.q.trim().length < 2) {
    return (
      <EmptyState
        icon={<MagnifyingGlass aria-hidden className="size-8" />}
        title="Search for someone"
        description="Type at least 2 letters of a name, username or department."
      />
    );
  }
  const outcome =
    state.tab === "people"
      ? { kind: "people" as const, ...(await searchPeople(filters)) }
      : { kind: "ventures" as const, ...(await searchVentures(state.tab === "startups" ? "startup" : "project", filters)) };
  if (!outcome.ok) {
    return (
      <p role="alert" className="rounded-md bg-bg-subtle px-4 py-3 text-body-sm">
        You&apos;re searching very fast. Wait a moment and try again.
      </p>
    );
  }
  const filtered = Boolean(state.department || state.batch || state.skill || state.university);
  if (!outcome.rows.length) {
    return (
      <EmptyState
        icon={<MagnifyingGlass aria-hidden className="size-8" />}
        title={filters.from ? "No more results" : "No results"}
        description={filtered ? "Try clearing the filters." : "Try other words, or part of a name."}
        action={
          filtered ? (
            <Link href={exploreHref(state, { department: "", batch: "", skill: "", university: "" })} className="text-body-sm font-semibold underline underline-offset-4">
              Clear filters
            </Link>
          ) : undefined
        }
      />
    );
  }
  const next = outcome.rows.length === EXPLORE_PAGE && filters.from + EXPLORE_PAGE <= 200;
  const nextHref = `${exploreHref(state)}${exploreHref(state).includes("?") ? "&" : "?"}from=${filters.from + EXPLORE_PAGE}` as Route;
  return (
    <div className="flex flex-col gap-4">
      {outcome.kind === "people" ? (
        <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface" data-testid="people-results">
          {outcome.rows.map((p) => (
            <PersonRow key={p.userId} person={p} />
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="venture-results">
          {outcome.rows.map((v) => (
            <li key={v.id}>
              <VentureCard venture={v} />
            </li>
          ))}
        </ul>
      )}
      {next ? (
        <Link href={nextHref} className="self-center text-body-sm font-semibold underline underline-offset-4">
          Next {EXPLORE_PAGE}
        </Link>
      ) : null}
    </div>
  );
}

function PersonRow({ person: p }: { person: PersonResult }) {
  const meta = [p.department, p.batch ? `Batch ${p.batch}` : null, p.university].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 px-4 py-3" data-testid="person-result">
      <Avatar name={p.name} src={p.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${p.username}` as Route} className="text-body font-semibold underline-offset-4 hover:underline">
          {p.name}
        </Link>
        <p className="truncate text-caption text-text-secondary">
          @{p.username}
          {meta ? ` · ${meta}` : ""}
        </p>
        {p.skills.length ? (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Skills">
            {p.skills.map((s) => (
              <li key={s}>
                <SkillChip name={s} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="shrink-0" data-testid="friendship">
        {p.friendship === "none" ? (
          <AddFriendButton username={p.username} name={p.name} />
        ) : p.friendship === "request_received" ? (
          <Link href="/friends" className="text-caption font-semibold underline underline-offset-4">
            {FRIENDSHIP_LABELS.request_received}
          </Link>
        ) : (
          <span className="text-caption font-semibold text-text-secondary">{FRIENDSHIP_LABELS[p.friendship]}</span>
        )}
      </div>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading results">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
