"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { CREDENTIAL_BUCKET, CREDENTIAL_PDF_MAX_BYTES } from "@/lib/credentials/constants";
import { ImageRejected, reencodeToFit } from "@/lib/images/reencode";

/**
 * Credentials (PRD 5.19). Images come through here and are re-encoded by the server (EXIF and
 * GPS stripped, decisions.md 2026-09-28); PDFs (up to 5 MB, as-is) go from the browser
 * straight to the private bucket because Vercel refuses larger request bodies, and this
 * action checks the stored file before attaching it. submit_credential re-checks ownership,
 * type, size, dates and limits in SQL.
 */

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date.");

const fields = z
  .object({
    title: z.string().trim().min(2, "Name the credential.").max(120, "Keep the title under 120 characters."),
    issuer: z.string().trim().min(2, "Who issued it?").max(120, "Keep the issuer under 120 characters."),
    issuedOn: isoDate.refine((d) => d <= today(), "The issue date can't be in the future."),
    expiresOn: isoDate.or(z.literal("")).optional(),
    verifyUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full https:// link.")
      .optional(),
  })
  .refine((v) => !v.expiresOn || v.expiresOn > v.issuedOn, { path: ["expiresOn"], message: "The expiry date must be after the issue date." });
export type CredentialFields = z.input<typeof fields>;

function args(v: z.output<typeof fields>, path: string) {
  return {
    p: { title: v.title, issuer: v.issuer, issued_on: v.issuedOn, expires_on: v.expiresOn || null, verify_url: v.verifyUrl || null, path },
  };
}

/** An image certificate: re-encoded here, stored in the student's folder, then submitted. */
export async function submitCredentialImage(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("credentials.submit_image");
  const parsed = fields.safeParse({
    title: formData.get("title"),
    issuer: formData.get("issuer"),
    issuedOn: formData.get("issuedOn"),
    expiresOn: formData.get("expiresOn") ?? "",
    verifyUrl: formData.get("verifyUrl") ?? "",
  });
  const file = formData.get("file");
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  if (!(file instanceof File) || file.size === 0 || file.size > CREDENTIAL_PDF_MAX_BYTES) {
    ctx.done("refused", { error_code: "invalid_file" });
    return fail("invalid_file", "Choose an image under 5 MB.", { fields: { file: "Choose an image under 5 MB." } });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;

  let image: Buffer;
  try {
    image = (await reencodeToFit(Buffer.from(await file.arrayBuffer()))).data;
  } catch (err) {
    const tooLarge = err instanceof ImageRejected && err.reason === "too_large";
    ctx.done("refused", { error_code: "not_an_image", user_id: session.userId });
    const message = tooLarge ? "That image is too big (max 6,000 × 6,000 pixels)." : "That file isn't an image we can read. Use JPEG, PNG or WebP.";
    return fail("invalid_file", message, { fields: { file: message } });
  }
  // Ownership: the path is always the signed-in student's own folder.
  const path = `${session.userId}/${randomUUID()}.webp`;
  const upload = await session.supabase.storage.from(CREDENTIAL_BUCKET).upload(path, image, { contentType: "image/webp", upsert: false });
  if (upload.error) {
    ctx.done("error", { error_code: "upload_failed", user_id: session.userId });
    return fail("unavailable", "Couldn't upload the file. Try again.", { requestId: ctx.requestId });
  }
  const result = await call<string>(ctx, session.supabase, session.userId, "submit_credential", args(parsed.data, path), ["/me/credentials"]);
  if (!result.ok) {
    await session.supabase.storage.from(CREDENTIAL_BUCKET).remove([path]);
    return result;
  }
  return ok({ id: result.data });
}

/** A PDF the browser has already put in the student's folder: checked here, then submitted. */
export async function submitCredentialPdf(input: CredentialFields & { path: string }): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext("credentials.submit_pdf");
  const parsed = fields.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  // Ownership: only a fresh name in the caller's own folder.
  if (!new RegExp(`^${session.userId}/[0-9a-f-]{36}\\.pdf$`).test(input.path)) {
    ctx.done("refused", { error_code: "forbidden", user_id: session.userId });
    return fail("forbidden", "Upload the file again.");
  }
  // The bucket only takes application/pdf by its declared type; check the bytes really are one.
  const { data: blob, error } = await session.supabase.storage.from(CREDENTIAL_BUCKET).download(input.path);
  const head = blob ? Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString("latin1") : "";
  if (error || !blob || blob.size > CREDENTIAL_PDF_MAX_BYTES || head !== "%PDF-") {
    await session.supabase.storage.from(CREDENTIAL_BUCKET).remove([input.path]);
    ctx.done("refused", { error_code: "invalid_file", user_id: session.userId });
    return fail("invalid_file", "That file isn't a PDF we can accept (up to 5 MB).", { fields: { file: "Choose a PDF up to 5 MB." } });
  }
  const result = await call<string>(ctx, session.supabase, session.userId, "submit_credential", args(parsed.data, input.path), [
    "/me/credentials",
  ]);
  if (!result.ok) {
    await session.supabase.storage.from(CREDENTIAL_BUCKET).remove([input.path]);
    return result;
  }
  return ok({ id: result.data });
}

export async function deleteCredential(id: string): Promise<ActionResult> {
  const ctx = await actionContext("credentials.delete");
  if (!z.uuid().safeParse(id).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That credential doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<boolean>(ctx, session.supabase, session.userId, "delete_credential", { p_id: id }, ["/me/credentials"]);
  if (!result.ok) return result;
  revalidatePath("/profile/[username]", "layout");
  return ok(null);
}
