"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Reports (PRD 5.12). Visibility, ownership, one report per person and target, the 60 s
 * cooldown and the attached-message rules are all checked in SQL (`submit_report`).
 */

const TARGETS = ["post", "comment", "message", "profile", "venture"] as const;
const REPORT_REASONS = ["spam", "harassment", "inappropriate", "misinformation", "impersonation", "other"] as const;

export async function submitReport(input: {
  targetType: (typeof TARGETS)[number];
  targetId: string;
  reason: (typeof REPORT_REASONS)[number];
  detail?: string;
  messageIds?: string[];
}): Promise<ActionResult> {
  const ctx = await actionContext("report.submit");
  const parsed = z
    .object({
      targetType: z.enum(TARGETS),
      targetId: z.uuid(),
      reason: z.enum(REPORT_REASONS),
      detail: z.string().trim().max(500, "Details are up to 500 characters.").optional(),
      messageIds: z.array(z.uuid()).max(10, "Attach up to 10 earlier messages.").optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const d = parsed.data;
  return call(ctx, session.supabase, session.userId, "submit_report", {
    p_type: d.targetType,
    p_target: d.targetId,
    p_reason: d.reason,
    p_detail: d.detail || undefined,
    p_messages: d.messageIds ?? [],
  });
}
