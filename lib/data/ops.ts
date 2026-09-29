import "server-only";

import { cache } from "react";
import { ageLabel, shortTime } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

/**
 * /ops moderation reads (PRD 5.12, 5.26). Every read goes through a SQL function that
 * refuses anyone but a moderator on a two-factor session; staff never read chats except
 * the messages a reporter attached.
 */

export type ReportTarget = Enums["report_target"];
export type CaseStatus = Enums["report_case_status"];

/** A moderator with two-factor on (is_staff checks the aal2 claim). */
export const isModerator = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_staff", { p_role: "moderator" });
  return data === true;
});

export interface QueueRow {
  id: string;
  targetType: ReportTarget;
  reports: number;
  softSignal: boolean;
  reasons: string[];
  excerpt: string;
  ownerName: string | null;
  status: CaseStatus;
  claimedBy: string | null;
  claimedByMe: boolean;
  age: string;
}

export async function getQueue(status: "open" | "resolved"): Promise<QueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ops_queue", { p_status: status });
  if (error) throw new Error(`ops_queue failed: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    reports: r.reports,
    softSignal: r.soft_signal,
    reasons: r.reasons ?? [],
    excerpt: r.excerpt,
    ownerName: r.owner_name,
    status: r.status,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me ?? false,
    age: ageLabel(r.opened_at),
  }));
}

export interface CaseDetail {
  id: string;
  targetType: ReportTarget;
  snapshot: Record<string, unknown>;
  reportsCount: number;
  softSignal: boolean;
  status: CaseStatus;
  openedAge: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  claimedBy: string | null;
  claimedByMe: boolean;
  owner: { name: string; username: string | null; cases: number; actioned: number; warnings: number } | null;
  reports: { reason: string; detail: string | null; time: string; reporter: string; reporterReports: number; reporterUpheld: number }[];
  messages: { id: string; body: string; hadImage: boolean; time: string; reported: boolean; sender: string | null }[];
}

export async function getCase(id: string): Promise<CaseDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ops_case", { p_case: id });
  if (error) throw new Error(`ops_case failed: ${error.code}`);
  if (!data) return null;
  const c = data as Record<string, never>;
  const owner = c.owner as Record<string, unknown> | null;
  return {
    id: c.id,
    targetType: c.target_type,
    snapshot: (c.snapshot ?? {}) as Record<string, unknown>,
    reportsCount: c.reports_count,
    softSignal: c.soft_signal,
    status: c.status,
    openedAge: ageLabel(c.opened_at),
    resolvedAt: c.resolved_at ? shortTime(c.resolved_at) : null,
    resolvedBy: c.resolved_by ?? null,
    resolutionReason: c.resolution_reason ?? null,
    claimedBy: c.claimed_by ?? null,
    claimedByMe: c.claimed_by_me ?? false,
    owner: owner
      ? {
          name: String(owner.name),
          username: (owner.username as string | null) ?? null,
          cases: Number(owner.cases),
          actioned: Number(owner.actioned),
          warnings: Number(owner.warnings),
        }
      : null,
    reports: ((c.reports ?? []) as Record<string, unknown>[]).map((r) => ({
      reason: String(r.reason),
      detail: (r.detail as string | null) ?? null,
      time: shortTime(String(r.created_at)),
      reporter: String(r.reporter),
      reporterReports: Number(r.reporter_reports),
      reporterUpheld: Number(r.reporter_upheld),
    })),
    messages: ((c.messages ?? []) as Record<string, unknown>[]).map((m) => ({
      id: String(m.message_id),
      body: String(m.body ?? ""),
      hadImage: Boolean(m.had_image),
      time: shortTime(String(m.sent_at)),
      reported: Boolean(m.is_reported),
      sender: (m.sender as string | null) ?? null,
    })),
  };
}

export interface ModerationNotice {
  targetType: ReportTarget;
  excerpt: string;
  status: CaseStatus;
  reason: string | null;
}

/** For the person whose content was moderated: what and why (never who). */
export async function getMyModerationNotice(id: string): Promise<ModerationNotice | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_moderation_notice", { p_case: id });
  const row = data?.[0];
  return row ? { targetType: row.target_type, excerpt: row.excerpt, status: row.status, reason: row.reason } : null;
}
