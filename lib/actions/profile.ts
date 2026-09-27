"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { IMAGE_SPECS, ImageRejected, reencodeImage, type ImageKind } from "@/lib/images/reencode";
import { USERNAME_HINT } from "@/lib/profile/options";
import { formList, formText, profileSchema, usernameSchema } from "@/lib/profile/schema";
import { rateLimit } from "@/lib/security/rate-limit";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

function readProfileForm(formData: FormData) {
  return {
    fullName: formText(formData, "fullName"),
    username: formText(formData, "username"),
    bio: formText(formData, "bio"),
    department: formText(formData, "department"),
    programme: formText(formData, "programme"),
    graduationYear: formText(formData, "graduationYear"),
    campus: formText(formData, "campus"),
    visibility: formText(formData, "visibility"),
    recruiterVisible: formData.get("recruiterVisible") === "on",
    lookingFor: formList(formData, "lookingFor"),
  };
}

/** Settings → Profile (PRD 5.4). Owner only: RLS plus an explicit user_id match and a count check. */
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("profile.update");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Sign in again to save your profile.");
  }
  const parsed = profileSchema.safeParse(readProfileForm(formData));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input", user_id: user.id });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const p = parsed.data;
  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        full_name: p.fullName,
        username: p.username,
        bio: p.bio,
        department: p.department,
        programme: p.programme,
        graduation_year: p.graduationYear,
        campus: p.campus,
        visibility: p.visibility,
        recruiter_visible: p.recruiterVisible,
        looking_for: p.lookingFor,
      },
      { count: "exact" },
    )
    .eq("user_id", user.id);
  if (error?.code === "23505") {
    ctx.done("refused", { error_code: "username_taken", user_id: user.id });
    return fail("username_taken", "That username is taken.", { fields: { username: "That username is taken. Try another." } });
  }
  if (error || count !== 1) {
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: user.id });
    return fail("unavailable", "Couldn't save your profile. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: user.id });
  return ok(null);
}

/** Live username check (onboarding step 2, Settings). */
export async function checkUsername(value: string): Promise<ActionResult<{ available: boolean }>> {
  const parsed = usernameSchema.safeParse(value);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message ?? USERNAME_HINT);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("username_available", { p_username: parsed.data });
  if (error) {
    return error.code === "54000"
      ? fail("rate_limited", "Too many checks. Wait a minute.")
      : fail("unavailable", "Couldn't check right now.");
  }
  return ok({ available: data === true });
}

const imageKindSchema = z.enum(["avatar", "cover"]);

function imagePatch(kind: ImageKind, path: string | null): ProfileUpdate {
  return kind === "avatar" ? { avatar_path: path } : { cover_path: path };
}

/**
 * Upload a cropped avatar or cover (PRD 5.4): re-encoded server-side to WebP with no
 * metadata (PRD 10), written to the user's own folder, then the previous file is deleted
 * so no orphans remain.
 */
export async function setProfileImage(formData: FormData): Promise<ActionResult<{ url: string | null }>> {
  const ctx = await actionContext("profile.set_image");
  const kind = imageKindSchema.safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!kind.success || !(file instanceof File)) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Choose an image to upload.");
  }
  const spec = IMAGE_SPECS[kind.data];
  if (file.size === 0 || file.size > spec.maxBytes) {
    ctx.done("refused", { error_code: "too_large" });
    return fail("too_large", `Images must be under ${spec.maxBytes / 1024 / 1024} MB.`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Sign in again to change your photo.");
  }
  if (!(await rateLimit(supabase, "profile_image", user.id, 30, 3600))) {
    ctx.done("refused", { error_code: "rate_limited", user_id: user.id });
    return fail("rate_limited", "Too many uploads. Try again in an hour.");
  }

  let webp: Buffer;
  try {
    webp = await reencodeImage(Buffer.from(await file.arrayBuffer()), kind.data);
  } catch (err) {
    const reason = err instanceof ImageRejected ? err.reason : "not_an_image";
    ctx.done("refused", { error_code: reason, user_id: user.id });
    return fail(
      reason,
      reason === "too_large" ? "That image is too big (max 6,000 × 6,000 pixels)." : "That file isn't an image we can read. Try a JPEG or PNG.",
    );
  }

  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("avatar_path, cover_path")
    .eq("user_id", user.id)
    .single();
  if (readError) {
    ctx.done("error", { error_code: readError.code, user_id: user.id });
    return fail("unavailable", "Couldn't update your photo. Try again.", { requestId: ctx.requestId });
  }

  const bucket = supabase.storage.from(spec.bucket);
  const path = `${user.id}/${randomUUID()}.webp`;
  const upload = await bucket.upload(path, webp, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (upload.error) {
    ctx.done("error", { error_code: "upload_failed", user_id: user.id });
    return fail("unavailable", "Couldn't upload your photo. Try again.", { requestId: ctx.requestId });
  }

  const { error, count } = await supabase
    .from("profiles")
    .update(imagePatch(kind.data, path), { count: "exact" })
    .eq("user_id", user.id);
  if (error || count !== 1) {
    await bucket.remove([path]);
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: user.id });
    return fail("unavailable", "Couldn't save your photo. Try again.", { requestId: ctx.requestId });
  }

  const previous = kind.data === "avatar" ? current.avatar_path : current.cover_path;
  if (previous && previous !== path) await bucket.remove([previous]);
  ctx.done("ok", { user_id: user.id, kind: kind.data });
  return ok({ url: publicImageUrl(spec.bucket, path) });
}

export async function removeProfileImage(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("profile.remove_image");
  const kind = imageKindSchema.safeParse(formData.get("kind"));
  if (!kind.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Sign in again to change your photo.");
  }
  const { data: current } = await supabase.from("profiles").select("avatar_path, cover_path").eq("user_id", user.id).single();
  const previous = kind.data === "avatar" ? current?.avatar_path : current?.cover_path;
  const { error, count } = await supabase
    .from("profiles")
    .update(imagePatch(kind.data, null), { count: "exact" })
    .eq("user_id", user.id);
  if (error || count !== 1) {
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: user.id });
    return fail("unavailable", "Couldn't remove your photo. Try again.", { requestId: ctx.requestId });
  }
  if (previous) await supabase.storage.from(IMAGE_SPECS[kind.data].bucket).remove([previous]);
  ctx.done("ok", { user_id: user.id, kind: kind.data });
  return ok(null);
}
