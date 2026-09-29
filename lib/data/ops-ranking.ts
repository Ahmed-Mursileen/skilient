import "server-only";

import { ageLabel, dayLabel } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/server";

/**
 * /ops ranking reads (PRD 5.13 anti-gaming, 5.26): ring and rapid-gain flags for trust
 * reviewers, exam periods for accounts staff. Every read goes through a SQL function that
 * checks the role and the two-factor session.
 */

export type RankingFlagKind = "ring" | "rapid_gain";
export type RankingFlagStatus = "open" | "cleared" | "upheld";

export interface RankingFlagRow {
  id: string;
  kind: RankingFlagKind;
  members: string[];
  gain: number | null;
  fromTotal: number | null;
  toTotal: number | null;
  endorsements: number;
  status: RankingFlagStatus;
  claimedBy: string | null;
  claimedByMe: boolean;
  age: string;
  reviewedLabel: string | null;
}

export async function getRankingFlagQueue(status: "open" | "reviewed"): Promise<RankingFlagRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ranking_flag_queue", { p_status: status });
  if (error) throw new Error(`ranking_flag_queue: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    members: r.member_names ?? [],
    gain: r.gain,
    fromTotal: r.from_total,
    toTotal: r.to_total,
    endorsements: r.endorsements,
    status: r.status,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me ?? false,
    age: ageLabel(r.created_at),
    reviewedLabel: r.reviewed_at ? dayLabel(r.reviewed_at) : null,
  }));
}

type Points = Partial<Record<"work" | "skills" | "endorsements" | "credentials" | "momentum" | "adjustments" | "total", number>>;

export interface RankingFlagCase {
  id: string;
  kind: RankingFlagKind;
  status: RankingFlagStatus;
  age: string;
  reviewedLabel: string | null;
  reason: string | null;
  reviewer: string | null;
  claimedBy: string | null;
  claimedByMe: boolean;
  /** The reviewer is one of the flagged students: they may look but not decide. */
  isMember: boolean;
  members: { userId: string; name: string; username: string | null; university: string | null; total: number | null; tier: string | null }[];
  endorsements: {
    id: string;
    endorser: string;
    endorsee: string;
    skill: string;
    venture: string;
    ventureStatus: string;
    deliverables: number;
    hidden: boolean;
    dateLabel: string;
  }[];
  gain: {
    reason: "gain" | "completions";
    fromTotal: number;
    toTotal: number;
    gain: number;
    exempt: number;
    completions: number;
    from: Points;
    to: Points;
  } | null;
}

interface CaseJson {
  id: string;
  kind: RankingFlagKind;
  status: RankingFlagStatus;
  created_at: string;
  reviewed_at: string | null;
  reason: string | null;
  reviewer_name: string | null;
  claimed_by_name: string | null;
  claimed_by_me: boolean | null;
  is_member: boolean;
  detail: {
    reason?: "gain" | "completions";
    from_total?: number;
    to_total?: number;
    gain?: number;
    exempt?: number;
    completions?: number;
    from?: Points;
    to?: Points;
  };
  members: { user_id: string; name: string; username: string | null; university: string | null; total: number | null; tier: string | null }[];
  endorsements: {
    id: string;
    endorser: string;
    endorsee: string;
    skill: string;
    venture: string;
    venture_status: string;
    deliverables: number;
    hidden: boolean;
    created_at: string;
  }[];
}

export async function getRankingFlagCase(id: string): Promise<RankingFlagCase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ranking_flag_case", { p_id: id });
  if (error) throw new Error(`ranking_flag_case: ${error.code}`);
  if (!data) return null;
  const c = data as unknown as CaseJson;
  const d = c.detail ?? {};
  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    age: ageLabel(c.created_at),
    reviewedLabel: c.reviewed_at ? dayLabel(c.reviewed_at) : null,
    reason: c.reason,
    reviewer: c.reviewer_name,
    claimedBy: c.claimed_by_name,
    claimedByMe: c.claimed_by_me ?? false,
    isMember: c.is_member,
    members: c.members.map((m) => ({
      userId: m.user_id,
      name: m.name,
      username: m.username,
      university: m.university,
      total: m.total,
      tier: m.tier,
    })),
    endorsements: c.endorsements.map((e) => ({
      id: e.id,
      endorser: e.endorser,
      endorsee: e.endorsee,
      skill: e.skill,
      venture: e.venture,
      ventureStatus: e.venture_status,
      deliverables: e.deliverables,
      hidden: e.hidden,
      dateLabel: dayLabel(e.created_at),
    })),
    gain:
      c.kind === "rapid_gain"
        ? {
            reason: d.reason ?? "gain",
            fromTotal: Number(d.from_total ?? 0),
            toTotal: Number(d.to_total ?? 0),
            gain: Number(d.gain ?? 0),
            exempt: Number(d.exempt ?? 0),
            completions: Number(d.completions ?? 0),
            from: d.from ?? {},
            to: d.to ?? {},
          }
        : null,
  };
}

export interface ExamPeriodRow {
  id: string;
  university: string;
  startsLabel: string;
  endsLabel: string;
  days: number;
  reason: string;
  addedBy: string | null;
  addedLabel: string;
  /** Today (PKT) falls inside it. */
  current: boolean;
  past: boolean;
}

const DAY_MS = 86_400_000;

/** Today's date in Pakistan as YYYY-MM-DD (exam periods are PKT calendar days). */
export function todayPkt(now = new Date()): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

export async function getExamPeriods(): Promise<ExamPeriodRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exam_period_list");
  if (error) throw new Error(`exam_period_list: ${error.code}`);
  const today = todayPkt();
  return (data ?? []).map((r) => ({
    id: r.id,
    university: r.university_name,
    startsLabel: dayLabel(r.starts_on),
    endsLabel: dayLabel(r.ends_on),
    days: Math.round((Date.parse(r.ends_on) - Date.parse(r.starts_on)) / DAY_MS) + 1,
    reason: r.reason,
    addedBy: r.created_by_name,
    addedLabel: dayLabel(r.created_at),
    current: r.starts_on <= today && today <= r.ends_on,
    past: r.ends_on < today,
  }));
}

/** Every university on the HEC list, for the exam-period picker. */
export async function getUniversityOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("universities").select("id, name").order("name");
  if (error) throw new Error(`universities: ${error.code}`);
  return data ?? [];
}
