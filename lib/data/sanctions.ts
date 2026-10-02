import "server-only";

import { cache } from "react";
import { dayLabel, eventTime } from "@/lib/format/time";
import { isRefusal, rpcJson } from "@/lib/data/rpc-json";
import type { AppealStatus, AppealType, SanctionKind } from "@/lib/ops/appeals";
import type { StaffRole } from "@/lib/ops/nav";

/**
 * Sanctions and appeals (PRD 5.26). Staff reads check the role in SQL on a two-factor session;
 * the user reads return only the signed-in account's own decisions, never who made them.
 */

export interface Restriction {
  id: string;
  kind: "suspend" | "ban";
  untilLabel: string | null;
}

/** The signed-in account's current suspension or ban, or null. */
export const getMyRestriction = cache(async (): Promise<Restriction | null> => {
  try {
    const r = await rpcJson<{ id: string; kind: "suspend" | "ban"; until: string | null } | null>("my_restriction");
    return r ? { id: r.id, kind: r.kind, untilLabel: r.until ? eventTime(r.until) : null } : null;
  } catch {
    return null;
  }
});

export interface Appealable {
  type: AppealType;
  id: string;
  summary: Record<string, unknown>;
  decidedLabel: string;
  deadlineLabel: string;
}

export async function getMyAppealable(): Promise<Appealable[]> {
  const raw = await rpcJson<{ type: AppealType; id: string; summary: Record<string, unknown>; decided_at: string; deadline: string }[]>("my_appealable");
  return raw.map((a) => ({ type: a.type, id: a.id, summary: a.summary, decidedLabel: dayLabel(a.decided_at), deadlineLabel: dayLabel(a.deadline) }));
}

export interface MyAppeal {
  id: string;
  type: AppealType;
  summary: Record<string, unknown>;
  body: string;
  status: AppealStatus;
  filedLabel: string;
  decidedLabel: string | null;
  decisionReason: string | null;
}

export async function getMyAppeals(): Promise<MyAppeal[]> {
  const raw = await rpcJson<
    { id: string; type: AppealType; summary: Record<string, unknown>; body: string; status: AppealStatus; created_at: string; decided_at: string | null; decision_reason: string | null }[]
  >("my_appeals");
  return raw.map((a) => ({
    id: a.id,
    type: a.type,
    summary: a.summary,
    body: a.body,
    status: a.status,
    filedLabel: dayLabel(a.created_at),
    decidedLabel: a.decided_at ? dayLabel(a.decided_at) : null,
    decisionReason: a.decision_reason,
  }));
}

export interface OpsSanction {
  id: string;
  kind: SanctionKind;
  untilLabel: string | null;
  perDay: number | null;
  reason: string;
  createdLabel: string;
  liftedLabel: string | null;
  liftReason: string | null;
  caseId: string | null;
  userId: string | null;
  userName: string | null;
  orgId: string | null;
  orgName: string | null;
  staffName: string | null;
  staffIsMe: boolean;
}

export async function getOpsSanctions(active: boolean): Promise<OpsSanction[]> {
  const raw = await rpcJson<
    {
      id: string;
      kind: SanctionKind;
      until: string | null;
      per_day: number | null;
      reason: string;
      created_at: string;
      lifted_at: string | null;
      lift_reason: string | null;
      case_id: string | null;
      user_id: string | null;
      user_name: string | null;
      org_id: string | null;
      org_name: string | null;
      staff_name: string | null;
      staff_is_me: boolean;
    }[]
  >("ops_sanctions", { p_active: active });
  return raw.map((r) => ({
    id: r.id,
    kind: r.kind,
    untilLabel: r.until ? eventTime(r.until) : null,
    perDay: r.per_day,
    reason: r.reason,
    createdLabel: dayLabel(r.created_at),
    liftedLabel: r.lifted_at ? dayLabel(r.lifted_at) : null,
    liftReason: r.lift_reason,
    caseId: r.case_id,
    userId: r.user_id,
    userName: r.user_name,
    orgId: r.org_id,
    orgName: r.org_name,
    staffName: r.staff_name,
    staffIsMe: r.staff_is_me,
  }));
}

export interface FoundAccount {
  userId: string;
  name: string | null;
  username: string | null;
  email: string;
  active: { id: string; kind: SanctionKind; until: string | null } | null;
}

export async function findAccount(query: string): Promise<FoundAccount | null> {
  const r = await rpcJson<{ user_id: string; name: string | null; username: string | null; email: string; active: FoundAccount["active"] } | null>(
    "ops_find_account",
    { p_query: query },
  );
  return r ? { userId: r.user_id, name: r.name, username: r.username, email: r.email, active: r.active } : null;
}

export interface OpsAppealRow {
  id: string;
  type: AppealType;
  summary: Record<string, unknown>;
  status: AppealStatus;
  filedLabel: string;
  decidedLabel: string | null;
  appellantName: string | null;
  deciderRole: StaffRole;
  claimedBy: string | null;
  claimedByMe: boolean;
  mineOriginally: boolean;
  stuck: boolean;
}

export async function getOpsAppeals(open: boolean): Promise<OpsAppealRow[]> {
  const raw = await rpcJson<
    {
      id: string;
      type: AppealType;
      summary: Record<string, unknown>;
      status: AppealStatus;
      created_at: string;
      decided_at: string | null;
      appellant_name: string | null;
      decider_role: StaffRole;
      claimed_by_name: string | null;
      claimed_by_me: boolean | null;
      mine_originally: boolean;
      stuck: boolean;
    }[]
  >("ops_appeals", { p_open: open });
  return raw.map((a) => ({
    id: a.id,
    type: a.type,
    summary: a.summary,
    status: a.status,
    filedLabel: dayLabel(a.created_at),
    decidedLabel: a.decided_at ? dayLabel(a.decided_at) : null,
    appellantName: a.appellant_name,
    deciderRole: a.decider_role,
    claimedBy: a.claimed_by_name,
    claimedByMe: a.claimed_by_me === true,
    mineOriginally: a.mine_originally,
    stuck: a.stuck,
  }));
}

export interface OpsAppeal {
  id: string;
  type: AppealType;
  decisionId: string;
  summary: Record<string, unknown>;
  body: string;
  status: AppealStatus;
  filedLabel: string;
  decidedLabel: string | null;
  decisionReason: string | null;
  outcome: Record<string, unknown> | null;
  deciderRole: StaffRole;
  appellantId: string;
  appellantName: string | null;
  orgName: string | null;
  originalStaffName: string | null;
  mineOriginally: boolean;
  claimedBy: string | null;
  claimedByMe: boolean;
  decidedByName: string | null;
  filedByStaff: boolean;
}

export async function getOpsAppeal(id: string): Promise<OpsAppeal | null> {
  try {
    const a = await rpcJson<{
      id: string;
      type: AppealType;
      decision_id: string;
      summary: Record<string, unknown>;
      body: string;
      status: AppealStatus;
      created_at: string;
      decided_at: string | null;
      decision_reason: string | null;
      outcome: Record<string, unknown> | null;
      decider_role: StaffRole;
      appellant_id: string;
      appellant_name: string | null;
      org_name: string | null;
      original_staff_name: string | null;
      mine_originally: boolean;
      claimed_by_name: string | null;
      claimed_by_me: boolean | null;
      decided_by_name: string | null;
      filed_by_staff: boolean;
    }>("ops_appeal_case", { p_id: id });
    return {
      id: a.id,
      type: a.type,
      decisionId: a.decision_id,
      summary: a.summary,
      body: a.body,
      status: a.status,
      filedLabel: dayLabel(a.created_at),
      decidedLabel: a.decided_at ? dayLabel(a.decided_at) : null,
      decisionReason: a.decision_reason,
      outcome: a.outcome,
      deciderRole: a.decider_role,
      appellantId: a.appellant_id,
      appellantName: a.appellant_name,
      orgName: a.org_name,
      originalStaffName: a.original_staff_name,
      mineOriginally: a.mine_originally,
      claimedBy: a.claimed_by_name,
      claimedByMe: a.claimed_by_me === true,
      decidedByName: a.decided_by_name,
      filedByStaff: a.filed_by_staff,
    };
  } catch (err) {
    if (isRefusal(err, "P0002", "42501", "22P02")) return null;
    throw err;
  }
}
