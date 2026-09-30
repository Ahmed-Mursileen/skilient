"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Account deletion (PRD 5.25): asking starts a 14-day cooling-off in which the account can
 * only reach the page that cancels it; after that the account-deletion job removes it. The
 * person types their own username to confirm; the server compares it with the profile, never
 * with anything the browser claims.
 */

export async function requestAccountDeletion(confirmation: string): Promise<ActionResult<{ deleteAfter: string }>> {
  const ctx = await actionContext("account.request_deletion");
  const parsed = z.string().trim().min(1, "Type your username to confirm.").max(60).safeParse(confirmation);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Type your username to confirm.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data: profile } = await session.supabase.from("profiles").select("username").eq("user_id", session.userId).maybeSingle();
  if (!profile?.username || profile.username !== parsed.data.toLowerCase()) {
    ctx.done("refused", { error_code: "confirmation_mismatch", user_id: session.userId });
    return fail("invalid_input", "That doesn't match your username.", { fields: { confirmation: "That doesn't match your username." } });
  }
  const result = await call<string>(ctx, session.supabase, session.userId, "request_account_deletion", {});
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return ok({ deleteAfter: result.data });
}

export async function cancelAccountDeletion(): Promise<ActionResult> {
  const ctx = await actionContext("account.cancel_deletion");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call(ctx, session.supabase, session.userId, "cancel_account_deletion", {});
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
