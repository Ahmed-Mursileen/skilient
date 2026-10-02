import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger, requestIdFrom } from "@/lib/log";
import { pktDayRange } from "@/lib/ops/diff";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/uni/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Form = z.object({
  reason: z.string().trim().min(3).max(2000),
  staff: z.uuid().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  target_type: z.string().trim().min(1).max(40).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
});

/**
 * POST /api/ops/audit/export (PRD 5.26): super admins download the filtered audit log as CSV.
 * ops_audit_export checks the role on two-factor and records the export before returning rows.
 * A POST form, so a prefetch or a link can't trigger it; auth cookies are SameSite=Lax.
 */
export async function POST(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const form = await req.formData();
  const entries = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  const parsed = Form.safeParse(entries);
  if (!parsed.success) return NextResponse.json({ error: "Give a reason for the export." }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const range = pktDayRange(parsed.data.from, parsed.data.to);
  const { data, error } = await supabase.rpc("ops_audit_export", {
    p_reason: parsed.data.reason,
    p_staff: parsed.data.staff ?? undefined,
    p_action: parsed.data.action ?? undefined,
    p_target_type: parsed.data.target_type ?? undefined,
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
  });
  if (error) {
    logger.info("ops.audit_export", { request_id: requestId, user_id: user.id, outcome: "refused", error_code: error.code });
    return NextResponse.json({ error: "Only super admins on two-factor can export the audit log." }, { status: 403 });
  }
  const rows = (data ?? []) as {
    id: string;
    created_at: string;
    staff_id: string;
    staff_name: string | null;
    action: string;
    target_type: string;
    target_id: string;
    reason: string;
    before: unknown;
    after: unknown;
  }[];
  logger.info("ops.audit_export", { request_id: requestId, user_id: user.id, outcome: "ok", rows: rows.length });
  const csv = toCsv([
    ["id", "created_at", "staff_id", "staff_name", "action", "target_type", "target_id", "reason", "before", "after"],
    ...rows.map((r) => [
      r.id,
      r.created_at,
      r.staff_id,
      r.staff_name ?? "",
      r.action,
      r.target_type,
      r.target_id,
      r.reason,
      r.before == null ? "" : JSON.stringify(r.before),
      r.after == null ? "" : JSON.stringify(r.after),
    ]),
  ]);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="skilient-audit-${day}.csv"`, "cache-control": "no-store" },
  });
}
