"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, REFUSALS, sentence, signedIn } from "@/lib/actions/rpc";
import { signChatImages } from "@/lib/data/chat";
import { clockTime } from "@/lib/format/time";
import { removeContentImages, storeContentImages } from "@/lib/images/content-images";

/**
 * Chat (PRD 5.9, 5.28). Membership, blocks and the 30-a-minute limit are checked in SQL;
 * images are re-encoded here (EXIF/GPS stripped) into the private chat-media bucket.
 */

const uuid = z.uuid();

/** Profile "Message": opens (or creates) the DM and goes there. */
export async function openDm(username: string): Promise<ActionResult> {
  const ctx = await actionContext("chat.open_dm");
  const parsed = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).safeParse(username);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That person doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string>(ctx, session.supabase, session.userId, "get_or_create_dm", { p_username: parsed.data });
  if (!result.ok) return result;
  redirect(`/chat/${result.data}` as Route);
}

export interface SentMessage {
  id: string;
  createdAt: string;
  timeLabel: string;
  imageUrl: string | null;
}

export async function sendMessage(formData: FormData): Promise<ActionResult<SentMessage>> {
  const ctx = await actionContext("chat.send");
  const parsed = z
    .object({ thread: uuid, body: z.string().max(10_000, "Messages are up to 10,000 characters.") })
    .safeParse({ thread: formData.get("threadId"), body: formData.get("body") ?? "" });
  const image = formData.get("image");
  const file = image instanceof File && image.size > 0 ? image : null;
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Write a message.");
  }
  if (!parsed.data.body.trim() && !file) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Write a message or add an image.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { supabase, userId } = session;

  let media: { path: string; width: number; height: number } | null = null;
  if (file) {
    const stored = await storeContentImages(supabase, parsed.data.thread, [file], 1, "chat-media");
    if (!stored.ok) {
      ctx.done(stored.code === "upload_failed" ? "error" : "refused", { error_code: stored.code, user_id: userId });
      return fail(stored.code, stored.code === "upload_failed" ? "Couldn't send the image. Try again." : stored.message, { requestId: ctx.requestId });
    }
    media = stored.images[0];
  }
  const { data, error } = await supabase.rpc("send_message", {
    p_thread: parsed.data.thread,
    p_body: parsed.data.body,
    p_media: (media ?? undefined) as never,
  });
  if (error || !data) {
    const orphan = media ? await removeContentImages(supabase, [media.path], "chat-media") : false;
    const code = REFUSALS[error?.code ?? ""];
    if (code) {
      ctx.done("refused", { error_code: code, user_id: userId, orphan_left: orphan });
      return fail(code, code === "rate_limited" ? "You're sending messages too fast. Wait a moment." : sentence(error!.message));
    }
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: userId, orphan_left: orphan });
    return fail("unavailable", "Couldn't send your message. Try again.", { requestId: ctx.requestId });
  }
  const signed = media ? await signChatImages([media.path]) : new Map<string, string>();
  const now = new Date().toISOString();
  ctx.done("ok", { user_id: userId, image: Boolean(media) });
  return ok({ id: data, createdAt: now, timeLabel: clockTime(now), imageUrl: media ? (signed.get(media.path) ?? null) : null });
}

export async function editMessage(messageId: string, body: string): Promise<ActionResult> {
  const ctx = await actionContext("chat.edit");
  const parsed = z.object({ id: uuid, body: z.string().max(10_000) }).safeParse({ id: messageId, body });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Messages are up to 10,000 characters.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "edit_message", { p_message: parsed.data.id, p_body: parsed.data.body });
}

export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const ctx = await actionContext("chat.delete");
  if (!uuid.safeParse(messageId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That message doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<string | null>(ctx, session.supabase, session.userId, "delete_message", { p_message: messageId });
  if (result.ok && result.data) await removeContentImages(session.supabase, [result.data], "chat-media");
  return result.ok ? ok(null) : result;
}

export async function markThreadRead(threadId: string): Promise<ActionResult> {
  const ctx = await actionContext("chat.read");
  if (!uuid.safeParse(threadId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That chat doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "mark_thread_read", { p_thread: threadId });
}

export async function muteThread(threadId: string, hours: number): Promise<ActionResult> {
  const ctx = await actionContext("chat.mute");
  const parsed = z.object({ id: uuid, hours: z.number().int().min(0).max(8760) }).safeParse({ id: threadId, hours });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Choose how long to mute.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "mute_thread", { p_thread: parsed.data.id, p_hours: parsed.data.hours }, ["/chat"]);
}

/** Signed URLs for images that arrived over Realtime (members only, by storage policy). */
export async function signImages(paths: string[]): Promise<ActionResult<Record<string, string>>> {
  const ctx = await actionContext("chat.sign");
  const parsed = z.array(z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/)).min(1).max(20).safeParse(paths);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Nothing to show.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const signed = await signChatImages(parsed.data);
  ctx.done("ok", { user_id: session.userId, count: signed.size });
  return ok(Object.fromEntries(signed));
}
