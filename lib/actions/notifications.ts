"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Notifications (PRD 5.11): mark read and email preferences. The SQL functions act on the
 * caller's own rows only (auth.uid()) and raise when nothing matches.
 */

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const ctx = await actionContext("notifications.read");
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That notification doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "mark_notification_read", { p_id: parsed.data });
}

export async function markAllNotificationsRead(): Promise<ActionResult<number>> {
  const ctx = await actionContext("notifications.read_all");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<number>(ctx, session.supabase, session.userId, "mark_all_notifications_read", {}, ["/notifications"]);
}

const prefInput = z.object({
  category: z.string().regex(/^[a-z_]{2,40}$/),
  channel: z.enum(["instant_email", "digest", "off"]),
});

export async function setNotificationPref(category: string, channel: string): Promise<ActionResult> {
  const ctx = await actionContext("notifications.pref");
  const parsed = prefInput.safeParse({ category, channel });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Choose instant email, daily digest or off.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "set_notification_pref",
    { p_category: parsed.data.category, p_channel: parsed.data.channel }, ["/settings/notifications"]);
}
