"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, paymentRequired, signedIn } from "@/lib/actions/rpc";
import { siteUrl } from "@/lib/cv/site";
import { CV_SECTIONS } from "@/lib/cv/types";
import { sha256Hex } from "@/lib/security/hash";

/**
 * /me/cv actions (PRD 5.18; decisions.md 2026-10-01). Every SQL function acts on the
 * caller's own CV only; share links need Spark (checked in SQL); re-issue and Pro refresh go
 * through the cv-sign Edge Function, which signs with a key only it can read.
 */

const uuid = z.uuid();

const settingsSchema = z.object({
  sections: z.array(z.enum(CV_SECTIONS)).min(1, "Keep at least one section.").max(CV_SECTIONS.length),
  showPercentile: z.boolean(),
  showEmail: z.boolean(),
  visibility: z.enum(["private", "link", "recruiters"]),
});

export async function saveCvSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  const ctx = await actionContext("cv.settings");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success || new Set(parsed.data.sections).size !== parsed.data.sections.length) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.success ? "Each section can appear once." : (parsed.error.issues[0]?.message ?? "Check your choices."));
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const d = parsed.data;
  return call(ctx, session.supabase, session.userId, "save_cv_settings", {
    p_sections: d.sections,
    p_show_percentile: d.showPercentile,
    p_show_email: d.showEmail,
    p_visibility: d.visibility,
  }, ["/me/cv"]);
}

const linkSchema = z.object({
  label: z.string().trim().max(60, "Keep the label under 60 characters.").optional(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]),
});

/** The token is 32 random bytes made here; only its hash is stored, so the link is shown once. */
export async function createShareLink(input: z.input<typeof linkSchema>): Promise<ActionResult<{ url: string }>> {
  const ctx = await actionContext("cv.share_link_create");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose how long the link lasts.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const token = randomBytes(32).toString("base64url");
  const created = await call<string>(ctx, session.supabase, session.userId, "create_share_link", {
    p_token_hash: sha256Hex(token),
    p_label: parsed.data.label ?? "",
    p_days: parsed.data.days,
  }, ["/me/cv"]);
  if (!created.ok) return created;
  const { data: profile } = await session.supabase.from("profiles").select("username").eq("user_id", session.userId).single();
  return ok({ url: `${siteUrl()}/cv/${profile?.username ?? "me"}?t=${token}` });
}

export async function revokeShareLink(id: string): Promise<ActionResult> {
  const ctx = await actionContext("cv.share_link_revoke");
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That link doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "revoke_share_link", { p_id: parsed.data }, ["/me/cv"]);
}

export async function revokeCvVersion(id: string): Promise<ActionResult> {
  const ctx = await actionContext("cv.revoke");
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That version doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "revoke_cv", { p_record: parsed.data }, ["/me/cv"]);
}

const SIGN_REFUSALS: Record<number, [string, string]> = {
  403: ["forbidden", "Refreshing any time is a Student Pro feature. Your CV refreshes on the 1st of each month."],
  409: ["not_now", "Only your newest version can be re-issued, after you revoke it."],
  429: ["rate_limited", "You've done that too often today. Try again tomorrow."],
};

async function signAs(action: "reissue" | "refresh", name: string): Promise<ActionResult<{ code: string | null }>> {
  const ctx = await actionContext(name);
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  if (action === "refresh") {
    const refused = await paymentRequired(ctx, session.supabase, session.userId, "cv.refresh_on_demand");
    if (refused) return refused;
  }
  const { data, error } = await session.supabase.functions.invoke<{ code: string | null }>("cv-sign", { body: { action } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    const refusal = SIGN_REFUSALS[status];
    if (refusal) {
      ctx.done("refused", { error_code: refusal[0], user_id: session.userId });
      return fail(refusal[0], refusal[1]);
    }
    ctx.done("error", { error_code: String(status || "unknown"), user_id: session.userId });
    return fail("unavailable", "We couldn't sign your CV just now. Try again in a minute.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: session.userId });
  revalidatePath("/me/cv");
  return ok({ code: data?.code ?? null });
}

/** The revoked newest version's content, signed again under a new code (no data refresh). */
export async function reissueCv(): Promise<ActionResult<{ code: string | null }>> {
  return signAs("reissue", "cv.reissue");
}

/** Student Pro: a new version with today's data (registry key cv.refresh_on_demand). */
export async function refreshCv(): Promise<ActionResult<{ code: string | null }>> {
  return signAs("refresh", "cv.refresh");
}
