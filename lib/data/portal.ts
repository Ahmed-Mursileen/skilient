import "server-only";

import { cache } from "react";
import type { Tier } from "@/components/ui/tier-badge";
import { pktDate } from "@/lib/format/time";
import type { TipId } from "@/lib/tips";
import { createClient } from "@/lib/supabase/server";
import { getMyScore } from "@/lib/data/ranking";

/**
 * Student portal reads (PRD 5.25, 5.27): the tour and tip state, the Home progress card
 * (next step, to-do count, getting-started checklist) and the Opportunities hub. Each is
 * one SQL function that answers only for the signed-in student.
 */

export interface TourState {
  started: boolean;
  step: number;
  completed: boolean;
  skipped: boolean;
}

export const getTourState = cache(async (tour: "student" | "faculty" | "recruiter" | "uni_admin"): Promise<TourState> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("tour_state", { p_tour: tour });
  const s = (data ?? {}) as Partial<TourState>;
  return { started: s.started === true, step: Number(s.step ?? 0), completed: s.completed === true, skipped: s.skipped === true };
});

export const getSeenTips = cache(async (): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tips_seen").select("tip_id");
  return new Set((data ?? []).map((t) => t.tip_id));
});

export async function tipSeen(id: TipId): Promise<boolean> {
  return (await getSeenTips()).has(id);
}

export interface NextAction {
  key: string;
  title: string;
  body: string;
  href: string;
}

export interface TodoCounts {
  total: number;
  requests: number;
  applications: number;
  invites: number;
  confirm: number;
  endorse: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  href: string;
  done: boolean;
  points: number | null;
  note: string | null;
}

export interface ProgressCard {
  /** Dismissed for today (Pakistan time). */
  dismissed: boolean;
  scored: boolean;
  tier: Tier | null;
  points: number;
  action: NextAction;
  todo: TodoCounts;
  checklist: { items: ChecklistItem[]; done: number; total: number; dismissed: boolean };
}

const NO_TODO: TodoCounts = { total: 0, requests: 0, applications: 0, invites: 0, confirm: 0, endorse: 0 };

export const getProgressCard = cache(async (userId: string): Promise<ProgressCard> => {
  const supabase = await createClient();
  const [action, todo, checklist, state, score] = await Promise.all([
    supabase.rpc("next_best_action"),
    supabase.rpc("todo_counts"),
    supabase.rpc("getting_started"),
    supabase.from("ui_state").select("key, value").eq("user_id", userId),
    getMyScore(),
  ]);
  if (action.error) throw new Error(`next_best_action: ${action.error.code}`);
  const ui = new Map((state.data ?? []).map((r) => [r.key, r.value]));
  const a = action.data as unknown as NextAction;
  const c = (checklist.data ?? { items: [], done: 0, total: 0 }) as unknown as { items: ChecklistItem[]; done: number; total: number };
  return {
    dismissed: ui.get("progress_card_dismissed_on") === pktDate(),
    scored: score.scored,
    tier: score.scored ? score.tier : null,
    points: score.scored ? score.total : 0,
    action: a,
    todo: { ...NO_TODO, ...((todo.data ?? {}) as Partial<TodoCounts>) },
    checklist: { ...c, dismissed: ui.get("checklist_dismissed") === true },
  };
});

export const OPPORTUNITY_TABS = [
  { key: "for_you", label: "For you" },
  { key: "jobs", label: "Jobs" },
  { key: "contact_requests", label: "Contact requests" },
  { key: "applications", label: "Applications" },
  { key: "competitions", label: "Competitions and hackathons" },
  { key: "job_fairs", label: "Job fairs" },
  { key: "ideas", label: "Project ideas" },
] as const;
export type OpportunityTab = (typeof OPPORTUNITY_TABS)[number]["key"];

export interface Opportunity {
  id: string;
  kind: string;
  title: string;
  orgName: string | null;
  detail: string | null;
  href: string;
  startsAt: string | null;
  /** Labelled "Sponsored" on the Jobs tab only. */
  sponsored: boolean;
}

export async function getOpportunities(tab: OpportunityTab): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("opportunities", { p_tab: tab });
  if (error) throw new Error(`opportunities: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    orgName: r.org_name,
    detail: r.detail,
    href: r.href,
    startsAt: r.starts_at,
    sponsored: r.sponsored === true,
  }));
}
