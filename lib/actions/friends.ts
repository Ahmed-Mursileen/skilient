"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Friends and blocks (PRD 5.8). Each action validates its input, checks the session and
 * calls one SQL function (supabase/migrations/*_friends_blocks.sql) that works from
 * auth.uid(), re-checks who may do what, and raises when nothing changes.
 */

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "Usernames are 3–30 letters, numbers or underscores.");
const requestId = z.uuid();

const REVALIDATE = ["/friends"];

function invalid(ctx: Awaited<ReturnType<typeof actionContext>>, message: string): ActionResult<never> {
  ctx.done("refused", { error_code: "invalid_input" });
  return fail("invalid_input", message, { fields: { username: message } });
}

export async function sendFriendRequest(rawUsername: string): Promise<ActionResult<{ status: "pending" | "accepted" }>> {
  const ctx = await actionContext("friends.send");
  const parsed = username.safeParse(rawUsername);
  if (!parsed.success) return invalid(ctx, parsed.error.issues[0]?.message ?? "Enter a username.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<{ request_id: string; status: "pending" | "accepted" | "declined" }[]>(
    ctx,
    session.supabase,
    session.userId,
    "send_friend_request",
    { p_username: parsed.data },
    REVALIDATE,
  );
  if (!result.ok) return result;
  const status = result.data[0]?.status === "accepted" ? "accepted" : "pending";
  return { ok: true, data: { status } };
}

export async function respondFriendRequest(id: string, accept: boolean): Promise<ActionResult> {
  const ctx = await actionContext(accept ? "friends.accept" : "friends.decline");
  const parsed = z.object({ id: requestId, accept: z.boolean() }).safeParse({ id, accept });
  if (!parsed.success) return invalid(ctx, "That request doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "respond_friend_request",
    { p_request: parsed.data.id, p_accept: parsed.data.accept }, REVALIDATE);
}

export async function cancelFriendRequest(id: string): Promise<ActionResult> {
  const ctx = await actionContext("friends.cancel");
  const parsed = requestId.safeParse(id);
  if (!parsed.success) return invalid(ctx, "That request doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "cancel_friend_request", { p_request: parsed.data }, REVALIDATE);
}

export async function unfriend(rawUsername: string): Promise<ActionResult> {
  const ctx = await actionContext("friends.unfriend");
  const parsed = username.safeParse(rawUsername);
  if (!parsed.success) return invalid(ctx, "That person doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "unfriend", { p_username: parsed.data }, REVALIDATE);
}

export async function blockUser(rawUsername: string): Promise<ActionResult> {
  const ctx = await actionContext("friends.block");
  const parsed = username.safeParse(rawUsername);
  if (!parsed.success) return invalid(ctx, "That person doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call(ctx, session.supabase, session.userId, "block_user", { p_username: parsed.data }, REVALIDATE);
  if (!result.ok) return result;
  // The blocked profile is gone for the blocker too; the Blocked tab is where to undo it.
  redirect("/friends?tab=blocked");
}

export async function unblockUser(rawUsername: string): Promise<ActionResult> {
  const ctx = await actionContext("friends.unblock");
  const parsed = username.safeParse(rawUsername);
  if (!parsed.success) return invalid(ctx, "That person doesn't exist.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "unblock_user", { p_username: parsed.data }, REVALIDATE);
}
