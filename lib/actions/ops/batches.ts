"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * An optional exception to the graduation rule (PRD 5.25): a university's own final-year batch
 * replaces the platform rule (1 September of the graduation year) for that university. Accounts staff only; SQL re-checks the role and the
 * two-factor session and writes the audit row with the reason.
 */
export async function setFinalYearBatch(universityId: string, batch: number | null, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.final_year_batch");
  const parsed = z
    .object({
      universityId: z.uuid(),
      batch: z.number().int().min(1980, "Enter a graduating year.").max(2100, "Enter a graduating year.").nullable(),
      why: z.string().trim().min(3, "Give a reason.").max(500, "Keep the reason under 500 characters."),
    })
    .safeParse({ universityId, batch, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the year and the reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "ops_set_final_year_batch",
    { p_university: parsed.data.universityId, p_batch: parsed.data.batch, p_reason: parsed.data.why },
    ["/ops/graduation"],
  );
}
