"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { FEEDBACK_BUCKET, FEEDBACK_MAX_BYTES, FEEDBACK_TYPES } from "@/lib/feedback/constants";
import { ImageRejected, reencodeToFit } from "@/lib/images/reencode";

/**
 * The feedback centre (PRD 5.27). The screenshot is re-encoded here (EXIF and GPS stripped),
 * stored in the student's own folder of the private `feedback` bucket with their session, and
 * attached by submit_feedback, which re-checks the caller, the file and the daily limit.
 * The page, device and app version are attached automatically; nothing else about the person.
 */

const fields = z.object({
  type: z.enum(FEEDBACK_TYPES),
  body: z.string().trim().min(3, "Say a little more (at least 3 characters).").max(2000, "Keep it under 2,000 characters."),
  page: z.string().max(200).optional(),
});

/** Path only, never a query string or a full URL. */
function cleanPage(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  return value.split(/[?#]/)[0].slice(0, 200);
}

export async function submitFeedback(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("feedback.submit");
  const parsed = fields.safeParse({ type: formData.get("type"), body: formData.get("body"), page: cleanPage(formData.get("page")) });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const file = formData.get("screenshot");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && file.size > FEEDBACK_MAX_BYTES) {
    ctx.done("refused", { error_code: "invalid_file" });
    return fail("invalid_file", "Choose an image under 5 MB.", { fields: { screenshot: "Choose an image under 5 MB." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;

  let path: string | null = null;
  if (hasFile) {
    let image: Buffer;
    try {
      image = (await reencodeToFit(Buffer.from(await file.arrayBuffer()))).data;
    } catch (err) {
      const tooLarge = err instanceof ImageRejected && err.reason === "too_large";
      ctx.done("refused", { error_code: "not_an_image", user_id: session.userId });
      const message = tooLarge ? "That image is too big (max 6,000 × 6,000 pixels)." : "That file isn't an image we can read. Use JPEG, PNG or WebP.";
      return fail("invalid_file", message, { fields: { screenshot: message } });
    }
    path = `${session.userId}/${randomUUID()}.webp`;
    const upload = await session.supabase.storage.from(FEEDBACK_BUCKET).upload(path, image, { contentType: "image/webp", upsert: false });
    if (upload.error) {
      ctx.done("error", { error_code: "upload_failed", user_id: session.userId });
      return fail("unavailable", "Couldn't upload the screenshot. Try again, or send it without.", { requestId: ctx.requestId });
    }
  }
  const result = await call<string>(
    ctx,
    session.supabase,
    session.userId,
    "submit_feedback",
    {
      p_type: parsed.data.type,
      p_body: parsed.data.body,
      p_screenshot: path,
      p_page: parsed.data.page ?? null,
      p_device: ctx.userAgent.slice(0, 200),
      p_version: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "dev").slice(0, 12),
    },
    ["/feedback"],
  );
  if (!result.ok) {
    if (path) await session.supabase.storage.from(FEEDBACK_BUCKET).remove([path]);
    return result;
  }
  return ok({ id: result.data });
}
