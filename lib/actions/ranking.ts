"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Leaderboard opt-out (PRD 5.17): off every board; the tier still shows on the profile and
 * cards. The SQL function only ever changes the caller's own profile.
 */
export async function setLeaderboardOptOut(optOut: boolean): Promise<ActionResult<boolean>> {
  const ctx = await actionContext("ranking.leaderboard_opt_out");
  const parsed = z.boolean().safeParse(optOut);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Choose on or off.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<boolean>(ctx, session.supabase, session.userId, "set_leaderboard_opt_out", { p_out: parsed.data }, [
    "/settings/privacy",
    "/leaderboard",
  ]);
}
