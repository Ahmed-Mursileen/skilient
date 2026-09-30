"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { FEEDBACK_STATUSES } from "@/lib/feedback/constants";

/** Feedback triage (PRD 5.27, 5.26): any staff role, on a two-factor session; SQL re-checks it and audits each change. */

export async function claimFeedback(id: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.feedback_claim");
  const parsed = z.object({ id: z.uuid(), claim: z.boolean() }).safeParse({ id, claim });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That feedback doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "claim_feedback", { p_id: id, p_claim: claim }, ["/ops/feedback", `/ops/feedback/${id}`]);
}

export async function respondFeedback(id: string, status: string, reply: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.feedback_respond");
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(FEEDBACK_STATUSES), reply: z.string().trim().max(2000, "Keep the reply under 2,000 characters.") })
    .safeParse({ id, status, reply });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose a status.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "respond_feedback",
    { p_id: id, p_status: parsed.data.status, p_reply: parsed.data.reply },
    ["/ops/feedback", `/ops/feedback/${id}`, "/feedback"],
  );
}
