"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { APPEAL_TYPES } from "@/lib/ops/appeals";

/** One appeal per decision, within 30 days (PRD 5.26). SQL checks the decision is the caller's own. */
export async function submitAppeal(type: string, decisionId: string, body: string): Promise<ActionResult<string>> {
  const ctx = await actionContext("appeals.submit");
  const parsed = z
    .object({
      type: z.enum(APPEAL_TYPES),
      decisionId: z.uuid(),
      body: z.string().trim().min(10, "Explain your appeal in at least 10 characters.").max(2000, "Keep it under 2,000 characters."),
    })
    .safeParse({ type, decisionId, body });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(
    ctx,
    session.supabase,
    session.userId,
    "submit_appeal",
    { p_type: parsed.data.type, p_id: parsed.data.decisionId, p_body: parsed.data.body },
    ["/appeals"],
  );
}
