"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Peer endorsements (PRD 5.16). Each action validates its input, checks the session and
 * calls one SQL function that re-checks membership, blocks and every limit itself
 * (supabase/migrations/*_endorsements.sql). The endorser is always the signed-in user.
 */

const uuid = z.uuid();
const endorseInput = z.object({
  ventureId: uuid,
  endorseeId: uuid,
  items: z
    .array(z.object({ skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), evidenceId: uuid.nullable() }))
    .min(1, "Choose at least one skill.")
    .max(5, "Choose up to 5 skills.")
    .refine((items) => new Set(items.map((i) => i.skillId)).size === items.length, "Choose each skill once."),
  note: z.string().trim().max(280, "Keep the note under 280 characters.").optional(),
});
export type EndorseInput = z.input<typeof endorseInput>;

export async function endorse(input: EndorseInput): Promise<ActionResult<{ count: number }>> {
  const ctx = await actionContext("endorsements.endorse");
  const parsed = endorseInput.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    const message = parsed.error.issues[0]?.message ?? "Check your choices.";
    return fail("invalid_input", message.startsWith("Invalid") ? "Check your choices." : message);
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const v = parsed.data;
  if (v.endorseeId === session.userId) {
    ctx.done("refused", { error_code: "forbidden", user_id: session.userId });
    return fail("forbidden", "You can't endorse yourself.");
  }
  const result = await call<number>(
    ctx,
    session.supabase,
    session.userId,
    "endorse",
    {
      p_endorsee: v.endorseeId,
      p_venture: v.ventureId,
      p_items: v.items.map((i) => ({ skill: i.skillId, evidence: i.evidenceId })),
      p_note: v.note || null,
    },
    [`/ventures/${v.ventureId}/team`],
  );
  if (!result.ok) return result;
  // Write check: the function returns how many endorsements it stored.
  if (result.data !== v.items.length) {
    return fail("unavailable", "Something went wrong on our side. Try again.", { requestId: ctx.requestId });
  }
  return { ok: true, data: { count: result.data } };
}

/** The endorsee hides an endorsement they received (or shows it again). */
export async function hideEndorsement(id: string, hidden: boolean, username: string): Promise<ActionResult> {
  const ctx = await actionContext("endorsements.hide");
  const parsed = z.object({ id: uuid, hidden: z.boolean(), username: z.string().regex(/^[a-z0-9_]{3,30}$/) }).safeParse({ id, hidden, username });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That endorsement doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<boolean>(ctx, session.supabase, session.userId, "hide_endorsement", { p_id: id, p_hidden: hidden }, [
    `/profile/${parsed.data.username}`,
    `/profile/${parsed.data.username}/skills`,
  ]);
  return result.ok ? { ok: true, data: null } : result;
}
