"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * /ops CV revocation (PRD 5.26; decisions.md 2026-10-01): trust reviewers on two-factor
 * revoke one version or all of a student's, with a reason; the SQL function checks the role,
 * writes ops_audit_log and tells the student.
 */
export async function opsRevokeCv(id: string, all: boolean, why: string): Promise<ActionResult<number>> {
  const ctx = await actionContext("ops.cv_revoke");
  const parsed = z
    .object({ id: z.uuid(), all: z.boolean(), why: z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.") })
    .safeParse({ id, all, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<number>(ctx, session.supabase, session.userId, "ops_revoke_cv", {
    p_record: parsed.data.id,
    p_all: parsed.data.all,
    p_reason: parsed.data.why,
  }, ["/ops/evidence"]);
}
