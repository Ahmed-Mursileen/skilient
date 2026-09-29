"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * /ops ranking actions (PRD 5.13, 5.26). Ranking flags: trust reviewers claim, then clear or
 * uphold with a reason. Exam periods: accounts staff add and remove them with a reason. Each
 * SQL function re-checks the role and the two-factor session and writes ops_audit_log.
 */

const uuid = z.uuid();
const reason = z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.");
const isoDate = z.iso.date("Enter a date.");

export async function claimRankingFlag(id: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.ranking_flag_claim");
  const parsed = z.object({ id: uuid, claim: z.boolean() }).safeParse({ id, claim });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That flag doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "claim_ranking_flag", { p_id: parsed.data.id, p_claim: parsed.data.claim }, [
    `/ops/evidence/ranking/${parsed.data.id}`,
    "/ops/evidence",
  ]);
}

export async function reviewRankingFlag(id: string, uphold: boolean, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.ranking_flag_review");
  const parsed = z.object({ id: uuid, uphold: z.boolean(), why: reason }).safeParse({ id, uphold, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose a decision and give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "review_ranking_flag",
    { p_id: parsed.data.id, p_uphold: parsed.data.uphold, p_reason: parsed.data.why },
    [`/ops/evidence/ranking/${parsed.data.id}`, "/ops/evidence"],
  );
}

export async function addExamPeriod(input: { university: string; starts: string; ends: string; why: string }): Promise<ActionResult<string>> {
  const ctx = await actionContext("ops.exam_period_add");
  const parsed = z
    .object({ university: z.uuid("Choose a university."), starts: isoDate, ends: isoDate, why: reason })
    .refine((v) => v.ends >= v.starts, { message: "The last day must be on or after the first.", path: ["ends"] })
    .safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the dates and give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(
    ctx,
    session.supabase,
    session.userId,
    "add_exam_period",
    { p_university: parsed.data.university, p_starts: parsed.data.starts, p_ends: parsed.data.ends, p_reason: parsed.data.why },
    ["/ops/exam-periods"],
  );
}

export async function removeExamPeriod(id: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.exam_period_remove");
  const parsed = z.object({ id: uuid, why: reason }).safeParse({ id, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "remove_exam_period", { p_id: parsed.data.id, p_reason: parsed.data.why }, [
    "/ops/exam-periods",
  ]);
}
