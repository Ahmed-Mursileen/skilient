"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { ANSWER_MAX } from "@/lib/code-checks/constants";

/**
 * Code checks (PRD 5.5). Each action checks the session and calls one SQL function that
 * re-checks ownership, the skill's level, the 30-day rule and the 10-minute window itself.
 */

const uuid = z.uuid();
const answers = z.object({
  what: z.string().max(ANSWER_MAX).optional(),
  why: z.string().max(ANSWER_MAX).optional(),
  change: z.string().max(ANSWER_MAX).optional(),
});

export async function requestCodeCheck(skillId: string): Promise<ActionResult> {
  const ctx = await actionContext("code_checks.request");
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(skillId)) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That skill isn't recognised.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(ctx, session.supabase, session.userId, "request_code_check", { p_skill: skillId });
  if (!result.ok) return result;
  redirect(`/me/code-checks/${result.data}` as Route);
}

export async function startCodeCheck(id: string): Promise<ActionResult> {
  const ctx = await actionContext("code_checks.start");
  if (!uuid.safeParse(id).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That code check doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(ctx, session.supabase, session.userId, "start_code_check", { p_id: id }, [`/me/code-checks/${id}`]);
  return result.ok ? ok(null) : result;
}

/** Saves the answers as the student types; `submit` hands them in. */
export async function saveCodeCheck(id: string, input: z.input<typeof answers>, submit: boolean): Promise<ActionResult<{ status: string }>> {
  const ctx = await actionContext(submit ? "code_checks.submit" : "code_checks.save");
  const parsed = z.object({ id: uuid, answers, submit: z.boolean() }).safeParse({ id, answers: input, submit });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", `Keep each answer under ${ANSWER_MAX.toLocaleString("en")} characters.`);
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(
    ctx,
    session.supabase,
    session.userId,
    "save_code_check",
    { p_id: id, p_answers: parsed.data.answers, p_submit: submit },
    submit ? [`/me/code-checks/${id}`] : [],
  );
  return result.ok ? ok({ status: result.data }) : result;
}
