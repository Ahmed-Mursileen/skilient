import type { Route } from "next";

/** Explore's state lives in the URL (PRD 5.10): shareable and Back-safe. */
export interface ExploreState {
  q: string;
  tab: "people" | "projects" | "startups" | "ideas";
  department: string;
  /** Graduation year ("" for any). */
  batch: string;
  skill: string;
  university: string;
}

export function exploreHref(s: ExploreState, change: Partial<ExploreState> = {}): Route {
  const next = { ...s, ...change };
  const p = new URLSearchParams();
  if (next.q.trim()) p.set("q", next.q.trim());
  if (next.tab !== "people") p.set("tab", next.tab);
  if (next.department.trim() && next.tab === "people") p.set("department", next.department.trim());
  if (next.batch && next.tab === "people") p.set("batch", next.batch);
  if (next.skill) p.set("skill", next.skill);
  if (next.university) p.set("university", next.university);
  const qs = p.toString();
  return (qs ? `/explore?${qs}` : "/explore") as Route;
}
