import "server-only";

import { TIERS, type Tier } from "@/components/ui/tier-badge";
import { dayLabel } from "@/lib/format/time";
import { COMPONENT_INFO, COMPONENT_KEYS, REQUIREMENT_LABELS, type ComponentKey, type Scope } from "@/lib/ranking/labels";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Leaderboards and the score page (PRD 5.17). Everything comes from the last nightly run, so
 * ranks don't reorder between runs. Others see rank, tier and weekly change; points only on
 * the owner's own score page.
 */

function asTier(t: string | null | undefined): Tier | null {
  return t && (TIERS as readonly string[]).includes(t) ? (t as Tier) : null;
}

export const BOARD_PAGE = 50;

export interface BoardFilters {
  scope: Scope;
  department: string | null;
  batch: number | null;
  after: number;
}

export interface BoardRow {
  position: number;
  rank: number;
  weeklyChange: number | null;
  username: string | null;
  name: string;
  university: string | null;
  avatarUrl: string | null;
  tier: Tier | null;
  isMe: boolean;
}

export async function getLeaderboard(f: BoardFilters): Promise<BoardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard", {
    p_scope: f.scope,
    p_department: f.scope === "university" ? (f.department ?? undefined) : undefined,
    p_batch: f.scope === "university" ? (f.batch ?? undefined) : undefined,
    p_after: f.after,
  });
  if (error) throw new Error(`leaderboard failed: ${error.code}`);
  return (data ?? []).map((r) => ({
    position: Number(r.place),
    rank: Number(r.rank),
    weeklyChange: r.weekly_change === null ? null : Number(r.weekly_change),
    username: r.username,
    name: r.full_name,
    university: r.university_name,
    avatarUrl: publicImageUrl("avatars", r.avatar_path),
    tier: asTier(r.tier),
    isMe: r.is_me ?? false,
  }));
}

export interface BoardMe {
  optedOut: boolean;
  scored: boolean;
  ranked: boolean;
  held: boolean;
  total: number | null;
  tier: Tier | null;
  rank: number | null;
  weeklyChange: number | null;
  size: number;
}

export async function getLeaderboardMe(f: BoardFilters): Promise<BoardMe> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard_me", {
    p_scope: f.scope,
    p_department: f.scope === "university" ? (f.department ?? undefined) : undefined,
    p_batch: f.scope === "university" ? (f.batch ?? undefined) : undefined,
  });
  if (error) throw new Error(`leaderboard_me failed: ${error.code}`);
  const m = (data ?? {}) as Record<string, unknown>;
  return {
    optedOut: m.opted_out === true,
    scored: m.scored === true,
    ranked: m.ranked === true,
    held: m.held === true,
    total: m.total === null || m.total === undefined ? null : Number(m.total),
    tier: asTier(m.tier as string | null),
    rank: m.rank === null || m.rank === undefined ? null : Number(m.rank),
    weeklyChange: m.weekly_change === null || m.weekly_change === undefined ? null : Number(m.weekly_change),
    size: Number(m.size ?? 0),
  };
}

export async function getLeaderboardFilters(): Promise<{ departments: string[]; batches: number[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard_filters");
  if (error) throw new Error(`leaderboard_filters failed: ${error.code}`);
  const f = (data ?? {}) as { departments?: string[]; batches?: number[] };
  return { departments: f.departments ?? [], batches: f.batches ?? [] };
}

// ---------------------------------------------------------------------------
// /me/score
// ---------------------------------------------------------------------------

export interface EvidenceLine {
  label: string;
  detail?: string;
  points: number;
  href?: string;
  external?: boolean;
}

export interface ComponentView {
  key: ComponentKey;
  label: string;
  layer: string;
  hint: string;
  points: number;
  max: number;
  /** Change since the last Sunday snapshot, if there was one. */
  delta: number | null;
  lines: EvidenceLine[];
  empty: string;
}

export interface ScoreView {
  scored: boolean;
  ranked: boolean;
  tier: Tier | null;
  tierMet: Tier | null;
  total: number;
  proof: number;
  weekDelta: number | null;
  lastWeekLabel: string | null;
  updatedLabel: string | null;
  formulaVersion: number | null;
  heldTotal: number | null;
  /** The day the student fell below their tier; it drops 14 days later if still below. */
  belowSinceLabel: string | null;
  dropLabel: string | null;
  components: ComponentView[];
  adjustments: EvidenceLine[];
  adjustmentsTotal: number;
  decay: { weeks: number; percent: number; inactiveDays: number; examDays: number; lastActiveLabel: string | null } | null;
  exam: { startsLabel: string; endsLabel: string } | null;
  next: { tier: Tier | null; needs: string[] };
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function getMyScore(): Promise<ScoreView> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_score");
  if (error) throw new Error(`my_score failed: ${error.code}`);
  const s = (data ?? {}) as Json;
  const next = (s.next ?? {}) as Json;
  const needs = arr(next.needs).map((n) => {
    const f = REQUIREMENT_LABELS[String(n.key)];
    return f ? f(num(n.have), num(n.need)) : String(n.key);
  });
  const nextView = { tier: asTier(next.next as string | null), needs };
  if (s.scored !== true) {
    return {
      scored: false, ranked: false, tier: null, tierMet: null, total: 0, proof: 0, weekDelta: null, lastWeekLabel: null,
      updatedLabel: null, formulaVersion: null, heldTotal: null, belowSinceLabel: null, dropLabel: null, components: [],
      adjustments: [], adjustmentsTotal: 0, decay: null, exam: null, next: nextView,
    };
  }

  const c = (s.components ?? {}) as Json;
  const names = (s.names ?? {}) as Record<string, Record<string, unknown>>;
  const nameOf = (kind: string, id: unknown) => names[kind]?.[String(id)];
  const lastWeek = (s.last_week ?? null) as Json | null;
  const lastPoints = (lastWeek?.components ?? {}) as Json;
  const part = (k: string) => (c[k] ?? {}) as Json;

  const work = part("work");
  const prs = (work.prs ?? {}) as Json;
  const workLines: EvidenceLine[] = [
    ...arr(work.ventures).map((v) => ({
      label: String(nameOf("ventures", v.venture_id) ?? "A completed venture"),
      detail: `${v.creator ? "Creator (×1.3)" : "Member"} · complexity ${num(v.complexity).toFixed(2)} · your share ${Math.round(num(v.share) * 100)}%`,
      points: num(v.points),
      href: `/ventures/${String(v.venture_id)}`,
    })),
    ...(num(prs.count) > 0
      ? [{ label: `${num(prs.count)} merged pull ${num(prs.count) === 1 ? "request" : "requests"} to other people's repositories`, detail: "10 each, up to 200", points: num(prs.points) }]
      : []),
  ];

  const skills = part("skills");
  const skillLines: EvidenceLine[] = arr(skills.items).map((k) => ({
    label: String(nameOf("skills", k.skill_id) ?? k.skill_id),
    detail: `L${num(k.level)}`,
    points: num(k.points),
  }));
  if (skills.bonus === true) skillLines.push({ label: `Spans ${num(skills.categories)} categories`, detail: "+10% on the skills above", points: 0 });

  const endorsementLines: EvidenceLine[] = arr(part("endorsements").items).map((e) => {
    const who = nameOf("people", e.endorser_id) as { name?: string; username?: string | null } | undefined;
    const flags = [
      `weight ${num(e.weight).toFixed(1)}`,
      e.mutual ? "you endorsed each other (×0.5)" : null,
      e.ring ? "held for review" : null,
    ].filter(Boolean);
    return {
      label: `${who?.name ?? "A teammate"} for ${String(nameOf("skills", e.skill_id) ?? e.skill_id)}`,
      detail: flags.join(" · "),
      points: num(e.points),
      href: who?.username ? `/profile/${who.username}` : undefined,
    };
  });

  const credentialLines: EvidenceLine[] = arr(part("credentials").items).map((k) => ({
    label: String(nameOf("credentials", k.id) ?? "A credential"),
    detail: k.recognised ? "Recognised issuer (×1.5)" : undefined,
    points: num(k.points),
    href: "/me/credentials",
  }));

  const m = part("momentum");
  const content = (m.content ?? {}) as Json;
  const consistency = (m.consistency ?? {}) as Json;
  const citizenship = (m.citizenship ?? {}) as Json;
  const decay = (m.decay ?? {}) as Json;
  const posts = arr(content.posts);
  const momentumLines: EvidenceLine[] = [
    {
      label: `Content quality: ${posts.length} scored ${posts.length === 1 ? "post" : "posts"}`,
      detail: posts.length ? `average index ${num(content.average).toFixed(0)}` : "a post counts once 5 people answer its question, 3 of them not your friends",
      points: num(content.points),
    },
    ...posts.map((p) => ({
      label: `“${String(nameOf("posts", p.post_id) ?? "Post")}”`,
      detail: `index ${num(p.index).toFixed(0)}`,
      points: 0,
      href: `/post/${String(p.post_id)}`,
    })),
    { label: `Consistency: active in ${num(consistency.weeks)} of the last 12 weeks`, points: num(consistency.points) },
    {
      label: `Citizenship: ${num(citizenship.joins)} join ${num(citizenship.joins) === 1 ? "request" : "requests"} answered within 72 hours, ${num(citizenship.confirmations)} teammate ${num(citizenship.confirmations) === 1 ? "entry" : "entries"} confirmed`,
      points: num(citizenship.points),
    },
  ];

  const lines: Record<ComponentKey, EvidenceLine[]> = {
    work: workLines,
    skills: skillLines,
    endorsements: endorsementLines,
    credentials: credentialLines,
    momentum: momentumLines,
  };
  const empties: Record<ComponentKey, string> = {
    work: "Complete a venture with your team, or get a pull request merged into someone else's repository.",
    skills: "Connect GitHub and log contributions: skills at L2 and above count here.",
    endorsements: "Teammates on an in-progress or completed venture can endorse your skills.",
    credentials: "Add a certificate in Credentials; it counts once Skilient approves it.",
    momentum: "Post, log contributions and confirm your teammates' entries.",
  };
  const components: ComponentView[] = COMPONENT_KEYS.map((key) => ({
    key,
    ...COMPONENT_INFO[key],
    points: num(part(key).points),
    delta: lastWeek ? num(part(key).points) - num(lastPoints[key]) : null,
    lines: lines[key],
    empty: empties[key],
  }));

  const adjustments: EvidenceLine[] = arr(part("adjustments").items).map((a) =>
    a.kind === "penalty"
      ? { label: `Penalty (${String(a.severity)}) for a report that was upheld`, detail: dayLabel(String(a.created_at)), points: num(a.points), href: a.case_id ? `/moderation/${String(a.case_id)}` : undefined }
      : { label: "A fast gain that didn't stand after review", detail: dayLabel(String(a.created_at)), points: num(a.points) },
  );

  const belowSince = s.below_since ? String(s.below_since) : null;
  const decayWeeks = num(decay.weeks);
  return {
    scored: true,
    ranked: s.ranked === true,
    tier: asTier(s.tier as string | null),
    tierMet: asTier(s.tier_met as string | null),
    total: num(s.total),
    proof: num(s.proof),
    weekDelta: lastWeek ? num(s.total) - num(lastWeek.total) : null,
    lastWeekLabel: lastWeek ? dayLabel(String(lastWeek.week)) : null,
    updatedLabel: s.published_at ? dayLabel(String(s.published_at)) : null,
    formulaVersion: s.formula_version === undefined ? null : num(s.formula_version),
    heldTotal: s.held === true ? num(s.held_total) : null,
    belowSinceLabel: belowSince ? dayLabel(belowSince) : null,
    dropLabel: belowSince ? dayLabel(new Date(Date.parse(belowSince) + 14 * 86_400_000).toISOString()) : null,
    components,
    adjustments,
    adjustmentsTotal: num(part("adjustments").points),
    decay:
      decayWeeks > 0 || num(decay.exam_days) > 0
        ? {
            weeks: decayWeeks,
            percent: Math.round((1 - num(decay.factor)) * 100),
            inactiveDays: num(decay.inactive_days),
            examDays: num(decay.exam_days),
            lastActiveLabel: decay.last_active ? dayLabel(String(decay.last_active)) : null,
          }
        : null,
    exam: s.exam ? { startsLabel: dayLabel(String((s.exam as Json).starts_on)), endsLabel: dayLabel(String((s.exam as Json).ends_on)) } : null,
    next: nextView,
  };
}
