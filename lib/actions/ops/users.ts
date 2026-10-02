"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, REFUSALS, sentence, signedIn } from "@/lib/actions/rpc";
import { sendEmail } from "@/lib/email/send";
import { mfaResetEmail } from "@/lib/email/templates";

/**
 * Staff actions on one account (PRD 5.26). SQL checks each role on a two-factor session and writes
 * ops_audit_log with the reason and the before/after.
 */

const reason = z.string().trim().min(3, "Give a reason.").max(500, "Keep the reason under 500 characters.");

export async function forceGithubResync(userId: string, why: string): Promise<ActionResult<number>> {
  const ctx = await actionContext("ops.user_github_resync");
  const parsed = z.object({ userId: z.uuid(), why: reason }).safeParse({ userId, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<number>(ctx, session.supabase, session.userId, "ops_github_resync", { p_user: userId, p_reason: parsed.data.why }, [`/ops/users/${userId}`]);
}

export async function recomputeSkills(userId: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.user_recompute_skills");
  const parsed = z.object({ userId: z.uuid(), why: reason }).safeParse({ userId, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "ops_recompute_skills", { p_user: userId, p_reason: parsed.data.why }, [`/ops/users/${userId}`]);
}

/** Starts a logged, read-only view (the user is told) and opens its first page. */
export async function startViewAs(userId: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.view_as_start");
  const parsed = z.object({ userId: z.uuid(), why: reason }).safeParse({ userId, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(ctx, session.supabase, session.userId, "ops_view_as_start", { p_user: userId, p_reason: parsed.data.why });
  if (!result.ok) return result;
  redirect(`/ops/users/${userId}/view/profile`);
}

/** Last resort (decisions 2026-09-28): super admins only, with how identity was checked; emails the user. */
export async function resetTwoFactor(userId: string, note: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.user_mfa_reset");
  const parsed = z
    .object({
      userId: z.uuid(),
      note: z.string().trim().min(20, "Write down how you checked who they are (at least 20 characters).").max(2000, "Keep the note under 2,000 characters."),
    })
    .safeParse({ userId, note });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data, error } = await session.supabase.rpc("ops_reset_mfa", { p_user: userId, p_identity_note: parsed.data.note });
  if (error || typeof data !== "string") {
    const code = error?.code && REFUSALS[error.code] ? REFUSALS[error.code] : "unavailable";
    ctx.done(code === "unavailable" ? "error" : "refused", { error_code: error?.code ?? "no_email", user_id: session.userId });
    return code === "unavailable"
      ? fail("unavailable", "Couldn't reset two-factor. Try again.", { requestId: ctx.requestId })
      : fail(code, sentence(error?.message ?? ""));
  }
  const email = mfaResetEmail(data, `${ctx.origin}/settings/security`);
  after(() => sendEmail(email, ctx.requestId));
  revalidatePath(`/ops/users/${userId}`);
  ctx.done("ok", { user_id: session.userId });
  return ok(null);
}
