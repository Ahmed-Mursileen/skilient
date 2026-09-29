"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, REFUSALS, sentence, signedIn } from "@/lib/actions/rpc";
import { getFeed, listPosts, FEED_FILTERS, type PostPage } from "@/lib/data/posts";
import { removeContentImages, storeContentImages } from "@/lib/images/content-images";

/**
 * Posts (PRD 5.6, 5.28). Limits are enforced again in SQL (create_post and friends), so
 * calling these directly with bad input is refused either way. Images are re-encoded here
 * (EXIF/GPS stripped) and stored before the post is written; a refused post removes them.
 */

const uuid = z.uuid();
const httpsUrl = z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full https:// link.");
const body = z.string().trim().min(1, "Write something first.").max(2000, "Keep it under 2,000 characters.");

const postInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("general"), audience: z.enum(["university", "global"]), body }),
  z.object({ type: z.literal("invite"), audience: z.enum(["university", "global"]), body, ventureId: uuid }),
  z.object({ type: z.literal("announcement"), body, pinDays: z.number().int().min(0).max(7) }),
  z.object({
    type: z.literal("event"),
    audience: z.enum(["university", "global"]),
    body,
    startsAt: z.iso.datetime({ offset: true, message: "Pick a date and time." }),
    place: z.string().trim().max(120).optional(),
    url: httpsUrl.optional(),
  }).refine((e) => (e.place ?? "").length >= 2 || (e.url ?? "").length > 0, { message: "Add a place or a link.", path: ["place"] }),
  z.object({
    type: z.literal("poll"),
    audience: z.enum(["university", "global"]),
    body,
    options: z.array(z.string().trim().min(1, "Fill in every option.").max(80)).min(2, "Add at least 2 options.").max(4, "Up to 4 options."),
    days: z.number().int().min(1).max(7),
  }),
]);
export type CreatePostInput = z.input<typeof postInput>;

export async function createPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("posts.create");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    raw = null;
  }
  const parsed = postInput.safeParse(raw);
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const input = parsed.data;
  if (files.length && !["general", "invite", "event"].includes(input.type)) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Images go on general, invite and event posts.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { supabase, userId } = session;

  const stored = await storeContentImages(supabase, userId, files);
  if (!stored.ok) {
    ctx.done(stored.code === "upload_failed" ? "error" : "refused", { error_code: stored.code, user_id: userId });
    return fail(stored.code, stored.message, { requestId: ctx.requestId });
  }

  const p: Record<string, unknown> = { type: input.type, body: input.body, media: stored.images };
  if (input.type !== "announcement") p.audience = input.audience;
  if (input.type === "invite") p.venture_id = input.ventureId;
  if (input.type === "announcement") p.pin_days = input.pinDays;
  if (input.type === "event") p.event = { starts_at: input.startsAt, place: input.place || null, url: input.url || null };
  if (input.type === "poll") p.poll = { options: input.options, days: input.days };

  const { data, error } = await supabase.rpc("create_post", { p: p as never });
  if (error || !data) {
    const orphan = await removeContentImages(supabase, stored.images.map((i) => i.path));
    const code = REFUSALS[error?.code ?? ""];
    if (code) {
      ctx.done("refused", { error_code: code, user_id: userId, orphan_left: orphan });
      return fail(code, code === "rate_limited" ? "Wait 30 seconds between posts." : sentence(error!.message));
    }
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: userId, orphan_left: orphan });
    return fail("unavailable", "Couldn't publish your post. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: userId, type: input.type, images: stored.images.length });
  return ok({ id: data });
}

export async function editPost(postId: string, text: string): Promise<ActionResult> {
  const ctx = await actionContext("posts.edit");
  const parsed = z.object({ id: uuid, body }).safeParse({ id: postId, body: text });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Posts are 1 to 2,000 characters.", { fields: { body: "Posts are 1 to 2,000 characters." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "edit_post", { p_post: parsed.data.id, p_body: parsed.data.body });
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const ctx = await actionContext("posts.delete");
  if (!uuid.safeParse(postId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That post doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data, error } = await session.supabase.rpc("delete_post", { p_post: postId });
  if (error) {
    const code = REFUSALS[error.code ?? ""] ?? "unavailable";
    ctx.done(code === "unavailable" ? "error" : "refused", { error_code: code, user_id: session.userId });
    return fail(code, code === "unavailable" ? "Couldn't delete the post. Try again." : sentence(error.message), { requestId: ctx.requestId });
  }
  const orphan = await removeContentImages(session.supabase, data ?? []);
  ctx.done("ok", { user_id: session.userId, orphan_left: orphan });
  return ok(null);
}

export async function votePoll(postId: string, position: number): Promise<ActionResult> {
  const ctx = await actionContext("posts.vote");
  const parsed = z.object({ id: uuid, position: z.number().int().min(1).max(4) }).safeParse({ id: postId, position });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Pick one of the options.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "vote_poll", { p_post: parsed.data.id, p_position: parsed.data.position });
}

export async function rsvpEvent(postId: string, status: "going" | "interested" | null): Promise<ActionResult> {
  const ctx = await actionContext("posts.rsvp");
  const parsed = z.object({ id: uuid, status: z.enum(["going", "interested"]).nullable() }).safeParse({ id: postId, status });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Choose Going or Interested.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "rsvp_event", { p_post: parsed.data.id, p_status: parsed.data.status });
}

/** Next page for infinite scroll (reads only; RLS decides what comes back). */
export async function loadMorePosts(scope: string, filter: string, cursor: string, authorId?: string): Promise<ActionResult<PostPage>> {
  const ctx = await actionContext("posts.page");
  const parsed = z
    .object({
      scope: z.enum(["university", "global", "author"]),
      filter: z.enum(FEED_FILTERS),
      cursor: z.string().max(100),
      authorId: uuid.optional(),
    })
    .safeParse({ scope, filter, cursor, authorId });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page to load more.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  try {
    const { scope, filter, cursor, authorId } = parsed.data;
    const page = scope === "author" ? await listPosts({ scope, filter, cursor, authorId }) : await getFeed(scope, filter, cursor);
    ctx.done("ok", { user_id: session.userId, count: page.posts.length });
    return ok(page);
  } catch {
    ctx.done("error", { error_code: "list_failed", user_id: session.userId });
    return fail("unavailable", "Couldn't load more posts. Try again.", { requestId: ctx.requestId });
  }
}

// ---------------------------------------------------------------------------
// Comments, hides and mutes (slice 4)
// ---------------------------------------------------------------------------

export async function addComment(postId: string, parentId: string | null, text: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("comments.add");
  const parsed = z
    .object({ post: uuid, parent: uuid.nullable(), body: z.string().trim().min(1, "Write a comment.").max(1000, "Keep it under 1,000 characters.") })
    .safeParse({ post: postId, parent: parentId, body: text });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Comments are 1 to 1,000 characters.", { fields: { body: "Comments are 1 to 1,000 characters." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data, error } = await session.supabase.rpc("add_comment", {
    p_post: parsed.data.post,
    p_parent: parsed.data.parent as string,
    p_body: parsed.data.body,
  });
  if (error || !data) {
    const code = REFUSALS[error?.code ?? ""];
    if (code) {
      ctx.done("refused", { error_code: code, user_id: session.userId });
      return fail(code, code === "rate_limited" ? "Wait 10 seconds between comments." : sentence(error!.message));
    }
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: session.userId });
    return fail("unavailable", "Couldn't post your comment. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: session.userId });
  return ok({ id: data });
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const ctx = await actionContext("comments.delete");
  if (!uuid.safeParse(commentId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That comment doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "delete_comment", { p_comment: commentId });
}

export async function pinComment(commentId: string, pin: boolean): Promise<ActionResult> {
  const ctx = await actionContext("comments.pin");
  if (!uuid.safeParse(commentId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That comment doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "pin_comment", { p_comment: commentId, p_pin: pin === true });
}

export async function hidePost(postId: string, hide: boolean): Promise<ActionResult> {
  const ctx = await actionContext(hide ? "posts.hide" : "posts.unhide");
  if (!uuid.safeParse(postId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That post doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "hide_post", { p_post: postId, p_hide: hide === true });
}

export async function muteUser(username: string, mute: boolean): Promise<ActionResult> {
  const ctx = await actionContext(mute ? "users.mute" : "users.unmute");
  const parsed = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).safeParse(username);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That person doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  // No revalidation: refreshing the feed would drop the card before its Undo notice shows.
  return call(ctx, session.supabase, session.userId, "mute_user", { p_username: parsed.data, p_mute: mute === true });
}

// ---------------------------------------------------------------------------
// Micro-survey and qualified views (slice 5)
// ---------------------------------------------------------------------------

/** Qualified views (>= 60% on screen for >= 1.5 s), batched by the client every 10 s. */
export async function recordViews(postIds: string[]): Promise<ActionResult<number>> {
  const ctx = await actionContext("posts.views");
  const parsed = z.array(uuid).min(1).max(100).safeParse(postIds);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Nothing to record.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<number>(ctx, session.supabase, session.userId, "record_views", { p_ids: [...new Set(parsed.data)] });
}

export async function answerSurvey(postId: string, answer: boolean, latencyMs: number): Promise<ActionResult> {
  const ctx = await actionContext("survey.answer");
  const parsed = z
    .object({ id: uuid, answer: z.boolean(), latency: z.number().int().min(0).max(86_400_000) })
    .safeParse({ id: postId, answer, latency: Math.round(latencyMs) });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Answer yes or no.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "answer_survey", {
    p_post: parsed.data.id,
    p_answer: parsed.data.answer,
    p_latency_ms: parsed.data.latency,
  });
}

export interface InsightRow {
  dimension: string;
  label: string;
  ticks: number;
  crosses: number;
  weightedRate: number | null;
}

/** Paid (PRD 5.28): the author's full breakdown. Refused in SQL without the entitlement. */
export async function getPostInsights(postId: string): Promise<ActionResult<InsightRow[]>> {
  const ctx = await actionContext("survey.insights");
  if (!uuid.safeParse(postId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That post doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<{ dimension: string; label: string; ticks: number; crosses: number; weighted_rate: number | null }[]>(
    ctx, session.supabase, session.userId, "post_insights", { p_post: postId });
  if (!result.ok) return result.code === "forbidden" ? fail("upgrade", "Post insights come with Student Pro.") : result;
  return ok(result.data.map((r) => ({ dimension: r.dimension, label: r.label, ticks: r.ticks, crosses: r.crosses, weightedRate: r.weighted_rate })));
}
