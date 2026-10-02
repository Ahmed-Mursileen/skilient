import "server-only";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import type { ActionContext } from "@/lib/actions/context";
import { fail, ok, type ActionError, type ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared plumbing for actions that call one SQL function (ventures, friends, ...). The
 * function re-checks the caller, ownership and limits itself and raises when it changes
 * nothing, so a successful call is the write check. Its refusals carry a message written
 * for the student; anything else becomes a generic error with the request id.
 */

export type Supabase = Awaited<ReturnType<typeof createClient>>;

/** SQL refusals carry a message written for the student; everything else is generic. */
export const REFUSALS: Record<string, string> = {
  "42501": "forbidden",
  P0002: "not_found",
  "23505": "duplicate",
  "23514": "limit",
  "55000": "not_now",
  "22023": "invalid_input",
  "54000": "rate_limited",
  // Paid features (lib/billing): the plan doesn't include it, or its allowance is used up.
  PT402: "payment_required",
};

export function sentence(message: string): string {
  const text = message.trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}` : "That didn't work.";
}

export async function signedIn(ctx: ActionContext): Promise<{ supabase: Supabase; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return null;
  }
  return { supabase, userId: user.id };
}

export const NO_SESSION = fail("no_session", "Your session expired. Sign in again to continue.");

/** Calls one SQL function and turns its outcome into an ActionResult. */
export async function call<T = null>(
  ctx: ActionContext,
  supabase: Supabase,
  userId: string,
  fn: string,
  args: Record<string, unknown>,
  revalidate: string[] = [],
): Promise<ActionResult<T>> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const code = REFUSALS[error.code ?? ""];
    if (code) {
      ctx.done("refused", { error_code: code, user_id: userId });
      return fail(code, code === "rate_limited" ? "You're doing that too often. Try again later." : sentence(error.message));
    }
    ctx.done("error", { error_code: error.code ?? "unknown", user_id: userId });
    return fail("unavailable", "Something went wrong on our side. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: userId });
  for (const path of revalidate) revalidatePath(path as Route);
  return ok(data as T);
}

/**
 * `requireEntitlement(key)` for paid actions (PRD 4b.4): asks Postgres whether the caller's subject holds the
 * key. Returns the typed refusal (code `payment_required`, which the UI turns into the upgrade sheet), or null.
 */
export async function paymentRequired(ctx: ActionContext, supabase: Supabase, userId: string, key: string): Promise<ActionError | null> {
  const { error } = await supabase.rpc("require_entitlement", { p_key: key });
  if (!error) return null;
  const code = REFUSALS[error.code ?? ""];
  if (code) {
    ctx.done("refused", { error_code: code, user_id: userId, entitlement: key });
    return fail(code, sentence(error.message));
  }
  ctx.done("error", { error_code: error.code ?? "unknown", user_id: userId, entitlement: key });
  return fail("unavailable", "Something went wrong on our side. Try again.", { requestId: ctx.requestId });
}
