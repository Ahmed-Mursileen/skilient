"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Input } from "@/components/ui";
import { exploreHref, type ExploreState } from "@/lib/explore/href";

const selectClass =
  "h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 text-body-sm text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring";

/**
 * Search box and filters (PRD 5.10): typing waits 250 ms, then replaces the URL, so the
 * results are shareable and Back works; a newer search supersedes an in-flight one.
 */
export function ExploreControls({
  state,
  universities,
  skills,
}: {
  state: ExploreState;
  universities: { slug: string; name: string }[];
  skills: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ids = { q: useId(), dept: useId(), skill: useId(), uni: useId() };
  const [q, setQ] = useState(state.q);
  const [department, setDepartment] = useState(state.department);
  const [pending, startTransition] = useTransition();
  // The URL can change without us (Clear filters, Back): adopt it, unless it's just the
  // echo of what we pushed while the person kept typing.
  const [seen, setSeen] = useState(state);
  const [pushed, setPushed] = useState<{ q: string; department: string } | null>(null);
  if (seen !== state) {
    setSeen(state);
    const echo = pushed !== null && pushed.q.trim() === state.q && pushed.department.trim() === state.department;
    if (!echo) {
      setQ(state.q);
      setDepartment(state.department);
    }
  }

  const replace = (next: ExploreState) => {
    setPushed({ q: next.q, department: next.department });
    startTransition(() => router.replace(exploreHref(next), { scroll: false }));
  };
  const go = (change: Partial<ExploreState>) => replace({ ...state, q, department, ...change });

  useEffect(() => {
    if (q.trim() === state.q && department.trim() === state.department) return;
    const timer = setTimeout(() => {
      if (pathname !== "/explore") return;
      setPushed({ q, department });
      startTransition(() => router.replace(exploreHref({ ...state, q, department }), { scroll: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, department, state, pathname, router]);

  return (
    <div className="flex flex-col gap-3" role="search" aria-busy={pending || undefined}>
      <div className="relative">
        <label htmlFor={ids.q} className="sr-only">
          Search people, projects and startups
        </label>
        <MagnifyingGlass aria-hidden weight="bold" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted" />
        <Input
          id={ids.q}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, department or title"
          className="pl-10"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {state.tab === "people" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.dept} className="text-caption font-semibold text-text-secondary">
              Department
            </label>
            <Input id={ids.dept} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Any department" />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.skill} className="text-caption font-semibold text-text-secondary">
            Skill
          </label>
          <select id={ids.skill} className={selectClass} value={state.skill} onChange={(e) => go({ skill: e.target.value })}>
            <option value="">Any skill</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.uni} className="text-caption font-semibold text-text-secondary">
            University
          </label>
          <select id={ids.uni} className={selectClass} value={state.university} onChange={(e) => go({ university: e.target.value })}>
            <option value="">Any university</option>
            {universities.map((u) => (
              <option key={u.slug} value={u.slug}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
