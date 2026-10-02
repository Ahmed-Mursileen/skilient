import "server-only";

import { dayLabel, eventTime } from "@/lib/format/time";
import { isRefusal, rpcJson } from "@/lib/data/rpc-json";

/**
 * /ops/config and /ops/metrics reads (PRD 5.26). One SQL function each, any staff role on a
 * two-factor session; only super admins (settings, prices) and trust reviewers (skills) write.
 */

export interface ConfigKeyRow {
  key: string;
  area: string;
  description: string;
  applies: "now" | "next_nightly";
  version: number | null;
  effective: string | null;
  reason: string | null;
  staffName: string | null;
  versions: number;
}

export async function getConfigKeys(): Promise<ConfigKeyRow[]> {
  const raw = await rpcJson<
    { key: string; area: string; description: string; applies: "now" | "next_nightly"; version: number | null; effective_at: string | null; reason: string | null; staff_name: string | null; versions: number }[]
  >("ops_config_keys");
  return raw.map((r) => ({
    key: r.key,
    area: r.area,
    description: r.description,
    applies: r.applies,
    version: r.version,
    effective: r.effective_at ? dayLabel(r.effective_at) : null,
    reason: r.reason,
    staffName: r.staff_name,
    versions: r.versions,
  }));
}

export interface ConfigVersion {
  version: number;
  value: unknown;
  reason: string;
  staffName: string | null;
  when: string;
}

export interface ConfigDetail {
  key: string;
  area: string;
  description: string;
  applies: "now" | "next_nightly";
  current: unknown;
  versions: ConfigVersion[];
}

export async function getConfigDetail(key: string): Promise<ConfigDetail | null> {
  try {
    const r = await rpcJson<{
      key: string;
      area: string;
      description: string;
      applies: "now" | "next_nightly";
      current: unknown;
      versions: { version: number; value: unknown; reason: string; staff_name: string | null; effective_at: string }[];
    }>("ops_config_history", { p_key: key });
    return {
      key: r.key,
      area: r.area,
      description: r.description,
      applies: r.applies,
      current: r.current,
      versions: r.versions.map((v) => ({ version: v.version, value: v.value, reason: v.reason, staffName: v.staff_name, when: eventTime(v.effective_at) })),
    };
  } catch (err) {
    if (isRefusal(err, "P0002")) return null;
    throw err;
  }
}

export interface PlanRow {
  id: string;
  label: string;
  audience: string;
  tier: string;
  interval: string;
  pricePkr: number | null;
  priceUsd: number | null;
  selfServe: boolean;
  active: boolean;
  changes: number;
}

export async function getPlans(): Promise<PlanRow[]> {
  const raw = await rpcJson<
    { id: string; label: string; audience: string; tier: string; interval: string; price_pkr: number | null; price_usd: number | null; self_serve: boolean; active: boolean; changes: number }[]
  >("ops_plans");
  return raw.map((p) => ({
    id: p.id,
    label: p.label,
    audience: p.audience,
    tier: p.tier,
    interval: p.interval,
    pricePkr: p.price_pkr === null ? null : Number(p.price_pkr),
    priceUsd: p.price_usd === null ? null : Number(p.price_usd),
    selfServe: p.self_serve,
    active: p.active,
    changes: p.changes,
  }));
}

export interface SkillRow {
  id: string;
  name: string;
  category: string;
  parentId: string | null;
  detectors: boolean;
  retired: string | null;
  holders: number;
}

export async function getSkills(): Promise<SkillRow[]> {
  const raw = await rpcJson<{ id: string; name: string; category: string; parent_id: string | null; detectors: boolean; retired_at: string | null; holders: number }[]>("ops_skills");
  return raw.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    parentId: s.parent_id,
    detectors: s.detectors,
    retired: s.retired_at ? dayLabel(s.retired_at) : null,
    holders: s.holders,
  }));
}

export interface Metrics {
  refreshed: string;
  signups: { day: string; student: number; faculty: number; recruiter: number; official: number }[];
  evidence: { university: string; students: number; l2: number }[];
  contacts: { week: string; sent: number; accepted: number; declined: number }[];
  hires: { month: string; intern: number; full_time: number }[];
  mrr: { stream: string; currency: string; mrr: number; subscriptions: number }[];
  weeklyActives: { day: string; label: string; value: number }[];
  backlog: { at: string; label: string; value: number }[];
}

export async function getMetrics(): Promise<Metrics> {
  const r = await rpcJson<Record<string, unknown>>("ops_metrics");
  return {
    refreshed: eventTime(String(r.refreshed)),
    signups: (r.signups as Metrics["signups"]) ?? [],
    evidence: (r.evidence as Metrics["evidence"]) ?? [],
    contacts: (r.contacts as Metrics["contacts"]) ?? [],
    hires: (r.hires as Metrics["hires"]) ?? [],
    mrr: ((r.mrr as Metrics["mrr"]) ?? []).map((m) => ({ ...m, mrr: Number(m.mrr) })),
    weeklyActives: (r.weekly_actives as Metrics["weeklyActives"]) ?? [],
    backlog: (r.backlog as Metrics["backlog"]) ?? [],
  };
}
