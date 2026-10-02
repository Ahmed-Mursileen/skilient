import "server-only";

import { ageLabel, dayLabel } from "@/lib/format/time";
import { rpcJson } from "@/lib/data/rpc-json";
import type { StaffRole } from "@/lib/ops/nav";

/**
 * Ops shell reads (PRD 5.26): the inbox, staff roles and the audit log. Each is one SQL
 * function that checks the caller's staff role on a two-factor session.
 */

export interface InboxQueue {
  queue: string;
  total: number;
  unclaimed: number;
  mine: number;
  overdue: number;
  oldestAge: string;
  slaHours: number;
  claimable: boolean;
}

export interface InboxItem {
  queue: string;
  id: string;
  title: string;
  detail: string | null;
  age: string;
  href: string;
  claimable: boolean;
  overdue: boolean;
  claimedBy: string | null;
  claimedByMe: boolean;
}

interface RawInbox {
  queues: { queue: string; total: number; unclaimed: number; mine: number; overdue: number; oldest: string; sla_hours: number; claimable: boolean }[];
  items: {
    queue: string;
    id: string;
    title: string;
    detail: string | null;
    waiting_since: string;
    href: string;
    claimable: boolean;
    overdue: boolean;
    claimed_by_name: string | null;
    claimed_by_me: boolean | null;
  }[];
}

export async function getInbox(queue: string | null): Promise<{ queues: InboxQueue[]; items: InboxItem[] }> {
  const raw = await rpcJson<RawInbox>("ops_inbox", { p_queue: queue });
  const now = new Date();
  return {
    queues: raw.queues.map((q) => ({
      queue: q.queue,
      total: q.total,
      unclaimed: q.unclaimed,
      mine: q.mine,
      overdue: q.overdue,
      oldestAge: ageLabel(q.oldest, now),
      slaHours: q.sla_hours,
      claimable: q.claimable,
    })),
    items: raw.items.map((i) => ({
      queue: i.queue,
      id: i.id,
      title: i.title,
      detail: i.detail,
      age: ageLabel(i.waiting_since, now),
      href: i.href,
      claimable: i.claimable,
      overdue: i.overdue,
      claimedBy: i.claimed_by_name,
      claimedByMe: i.claimed_by_me === true,
    })),
  };
}

export interface StaffMember {
  userId: string;
  name: string;
  email: string;
  roles: StaffRole[];
  since: string;
  isMe: boolean;
  twoFactor: boolean;
}

export async function getStaff(): Promise<StaffMember[]> {
  const raw = await rpcJson<{ user_id: string; name: string | null; email: string; roles: StaffRole[]; since: string; is_me: boolean; two_factor: boolean }[]>(
    "ops_staff",
  );
  return raw.map((s) => ({
    userId: s.user_id,
    name: s.name ?? s.email,
    email: s.email,
    roles: s.roles,
    since: dayLabel(s.since),
    isMe: s.is_me,
    twoFactor: s.two_factor,
  }));
}

export interface AuditFilters {
  staff?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

export interface AuditRow {
  id: string;
  staffId: string;
  staffName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  when: string;
}

const stamp = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

export async function getAudit(filters: AuditFilters, before: string | null, limit = 50): Promise<AuditRow[]> {
  const raw = await rpcJson<
    { id: string; staff_id: string; staff_name: string | null; action: string; target_type: string; target_id: string; reason: string; before: unknown; after: unknown; created_at: string }[]
  >("ops_audit_search", {
    p_staff: filters.staff ?? null,
    p_action: filters.action ?? null,
    p_target_type: filters.targetType ?? null,
    p_target_id: filters.targetId ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_before: before,
    p_limit: limit,
  });
  return raw.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff_name ?? "Former staff",
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    before: r.before,
    after: r.after,
    createdAt: r.created_at,
    when: stamp.format(new Date(r.created_at)),
  }));
}

export async function getAuditFilterOptions(): Promise<{ actions: string[]; targetTypes: string[]; staff: { id: string; name: string }[] }> {
  const raw = await rpcJson<{ actions: string[]; target_types: string[]; staff: { id: string; name: string }[] }>("ops_audit_filters");
  return { actions: raw.actions, targetTypes: raw.target_types, staff: raw.staff };
}
