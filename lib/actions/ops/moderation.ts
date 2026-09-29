"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Moderator actions (PRD 5.12, 5.26). Each SQL function re-checks the staff role and the
 * two-factor session, requires the case to be claimed by the caller, and writes the
 * change and its ops_audit_log row in one transaction.
 */

const uuid = z.uuid();

export async function claimCase(caseId: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.claim");
  const parsed = z.object({ id: uuid, claim: z.boolean() }).safeParse({ id: caseId, claim });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That case doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "claim_case", { p_case: parsed.data.id, p_claim: parsed.data.claim }, [
    `/ops/reports/${parsed.data.id}`,
    "/ops",
  ]);
}

export async function resolveCase(caseId: string, action: "dismiss" | "remove" | "warn", reason: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.resolve");
  const parsed = z
    .object({ id: uuid, action: z.enum(["dismiss", "remove", "warn"]), reason: z.string().trim().min(3, "Give a reason.").max(2000) })
    .safeParse({ id: caseId, action, reason });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose an action and give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "resolve_case",
    { p_case: parsed.data.id, p_action: parsed.data.action, p_reason: parsed.data.reason },
    [`/ops/reports/${parsed.data.id}`, "/ops"],
  );
}
