"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { homeFor, safeNext, type GateState } from "@/lib/auth/gate";
import { sendEmail } from "@/lib/email/send";
import { backupCodeUsedEmail } from "@/lib/email/templates";
import { logger } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Two-factor with an authenticator app (TOTP), PRD 10: optional for students now,
 * required later for recruiters, university admins and staff (aal2 checks in proxy.ts
 * and is_staff()). Several authenticators may be added. Backup codes are our own
 * (private.mfa_backup_codes; decisions 2026-09-28): 10 single-use codes, stored hashed,
 * shown once when two-factor is first turned on, and regenerable.
 */

/** Adding a second authenticator is allowed; more than this is almost certainly a mistake. */
const MAX_AUTHENTICATORS = 5;

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");

export interface TotpEnrollment {
  factorId: string;
  /** SVG data URI rendered by Supabase; safe for <img src>. */
  qrCode: string;
  secret: string;
}

export async function startTotpEnrollment(): Promise<ActionResult<TotpEnrollment>> {
  const ctx = await actionContext("mfa.enroll_start");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Sign in again to set up two-factor.");
  }

  // Abandoned set-ups leave unverified factors behind; clear them first.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const verified = factors?.totp.filter((f) => f.status === "verified") ?? [];
  if (verified.length >= MAX_AUTHENTICATORS) {
    ctx.done("refused", { error_code: "too_many_factors", user_id: user.id });
    return fail("too_many_factors", `You can add up to ${MAX_AUTHENTICATORS} authenticators. Remove one first.`);
  }
  if (verified.length) {
    // Adding another authenticator needs this session to have passed two-factor.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      ctx.done("refused", { error_code: "aal2_required", user_id: user.id });
      return fail("aal2_required", "Sign out and back in with your authenticator code, then add another.");
    }
  }
  const names = new Set(verified.map((f) => f.friendly_name));
  let friendlyName = "Authenticator app";
  for (let n = 2; names.has(friendlyName); n++) friendlyName = `Authenticator app ${n}`;

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
  if (error || !data) {
    ctx.done("error", { error_code: error?.code ?? "unknown", user_id: user.id });
    return fail("unavailable", "Couldn't start two-factor set-up. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: user.id });
  return ok({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
}

/** Backup codes are returned only when this turned two-factor on (the first authenticator). */
export async function confirmTotpEnrollment(formData: FormData): Promise<ActionResult<{ backupCodes: string[] | null }>> {
  const ctx = await actionContext("mfa.enroll_confirm");
  const parsed = z
    .object({ factorId: z.uuid(), code: codeSchema })
    .safeParse({ factorId: formData.get("factorId"), code: formData.get("code") });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter the 6-digit code from your authenticator app.", { fields: fieldErrors(parsed.error.issues) });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Ownership: the factor must be one of this user's own.
  if (!user || !user.factors?.some((f) => f.id === parsed.data.factorId)) {
    ctx.done("refused", { error_code: "not_owner", user_id: user?.id });
    return fail("expired", "This set-up has expired. Start again.");
  }
  const first = !user.factors.some((f) => f.status === "verified" && f.id !== parsed.data.factorId);
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) {
    ctx.done("refused", { error_code: error.code ?? "verify_failed", user_id: user.id });
    return fail("invalid_code", "That code didn't work. Check your app's clock and try the newest code.", {
      fields: { code: "That code didn't work." },
    });
  }
  await supabase.rpc("log_security_event", { p_kind: "mfa_enrolled", p_ip_hash: ctx.ipHash ?? "", p_user_agent: ctx.userAgent });
  let backupCodes: string[] | null = null;
  if (first) {
    // The session is aal2 now, which the database requires to create codes.
    const { data: codes, error: codesError } = await supabase.rpc("create_mfa_backup_codes");
    if (codesError) logger.warn("mfa.backup_codes_failed", { request_id: ctx.requestId, action: ctx.action, outcome: "error", error_code: codesError.code ?? "unknown" });
    else backupCodes = codes;
  }
  ctx.done("ok", { user_id: user.id });
  return ok({ backupCodes });
}

/** Replaces the backup codes; the old ones stop working. Needs a two-factor session. */
export async function regenerateBackupCodes(): Promise<ActionResult<{ backupCodes: string[] }>> {
  const ctx = await actionContext("mfa.backup_codes_regenerate");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Sign in again to make new backup codes.");
  }
  if (!user.factors?.some((f) => f.status === "verified")) {
    ctx.done("refused", { error_code: "no_factor", user_id: user.id });
    return fail("no_factor", "Turn on two-factor first.");
  }
  const { data, error } = await supabase.rpc("create_mfa_backup_codes");
  if (error || !data) {
    const code = error?.code ?? "unknown";
    ctx.done(code === "42501" || code === "54000" ? "refused" : "error", { error_code: code, user_id: user.id });
    if (code === "42501") return fail("aal2_required", "Sign out and back in with your authenticator code, then try again.");
    if (code === "54000") return fail("rate_limited", "You've made new codes too often. Try again in an hour.");
    return fail("unavailable", "Couldn't make new backup codes. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: user.id });
  return ok({ backupCodes: data });
}

export async function removeTotpFactor(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("mfa.unenroll");
  const parsed = z.object({ factorId: z.uuid() }).safeParse({ factorId: formData.get("factorId") });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.factors?.some((f) => f.id === parsed.data.factorId)) {
    ctx.done("refused", { error_code: "not_owner", user_id: user?.id });
    return fail("not_found", "That authenticator isn't on your account.");
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (error) {
    ctx.done("refused", { error_code: error.code ?? "unenroll_failed", user_id: user.id });
    return fail("unavailable", "Couldn't turn two-factor off. Sign in again with your code, then retry.", { requestId: ctx.requestId });
  }
  await supabase.rpc("log_security_event", { p_kind: "mfa_unenrolled", p_ip_hash: ctx.ipHash ?? "", p_user_agent: ctx.userAgent });
  const othersLeft = user.factors.some((f) => f.status === "verified" && f.id !== parsed.data.factorId);
  if (!othersLeft) {
    // Two-factor is off: backup codes would be meaningless, so they go too.
    const { error: codesError } = await supabase.rpc("delete_mfa_backup_codes");
    if (codesError) logger.warn("mfa.backup_codes_delete_failed", { request_id: ctx.requestId, action: ctx.action, outcome: "error", error_code: codesError.code ?? "unknown" });
  }
  ctx.done("ok", { user_id: user.id });
  return ok(null);
}

/** Second step of sign-in when the account has two-factor on (/signin/mfa). */
export async function verifySignInCode(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("mfa.challenge");
  const parsed = z
    .object({ code: codeSchema, next: z.string().max(512).optional() })
    .safeParse({ code: formData.get("code"), next: formData.get("next") ?? undefined });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter the 6-digit code from your authenticator app.", { fields: fieldErrors(parsed.error.issues) });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Your sign-in expired. Sign in again.");
  }
  if (!(await rateLimit(supabase, "mfa_verify", user.id, 10, 15 * 60))) {
    ctx.done("refused", { error_code: "too_many_attempts", user_id: user.id });
    return fail("too_many_attempts", "Too many attempts. Wait 15 minutes and try again.");
  }
  const factors = user.factors?.filter((f) => f.factor_type === "totp" && f.status === "verified") ?? [];
  if (!factors.length) {
    ctx.done("refused", { error_code: "no_factor", user_id: user.id });
    return fail("no_factor", "Two-factor isn't set up on this account.");
  }
  // With several authenticators the code may come from any of them.
  let error: { code?: string } | null = null;
  for (const factor of factors) {
    ({ error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code }));
    if (!error) break;
  }
  if (error) {
    ctx.done("refused", { error_code: error.code ?? "verify_failed", user_id: user.id });
    return fail("invalid_code", "That code didn't work. Try the newest code in your app.", {
      fields: { code: "That code didn't work." },
    });
  }
  const { data: state } = await supabase.rpc("my_gate_state");
  const next = safeNext(parsed.data.next);
  const home = state ? homeFor(state as unknown as GateState) : "/feed";
  ctx.done("ok", { user_id: user.id });
  redirect((home === "/feed" && next ? next : home) as Route);
}

const backupCodeSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, "").toLowerCase())
  .pipe(z.string().regex(/^[0-9a-z]{10}$/, "Enter one of your 10-character backup codes."));

/**
 * Second step of sign-in with a backup code instead of the app. Supabase can only reach a
 * two-factor session through an authenticator, so a used code switches two-factor off
 * (the database removes the authenticators and the other codes), the owner is emailed,
 * and they're sent to set it up again.
 */
export async function redeemBackupCode(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("mfa.backup_code_use");
  const parsed = backupCodeSchema.safeParse(formData.get("backupCode"));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter one of your 10-character backup codes.", {
      fields: { backupCode: "Enter one of your 10-character backup codes." },
    });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Your sign-in expired. Sign in again.");
  }
  const { data: used, error } = await supabase.rpc("use_mfa_backup_code", { p_code: parsed.data });
  if (error) {
    const code = error.code ?? "unknown";
    ctx.done(code === "54000" ? "refused" : "error", { error_code: code, user_id: user.id });
    if (code === "54000") return fail("too_many_attempts", "Too many attempts. Wait 15 minutes and try again.");
    return fail("unavailable", "Couldn't check that code. Try again.", { requestId: ctx.requestId });
  }
  if (!used) {
    ctx.done("refused", { error_code: "invalid_code", user_id: user.id });
    return fail("invalid_code", "That backup code isn't right, or it was already used.", {
      fields: { backupCode: "That code didn't work." },
    });
  }
  if (user.email) {
    const email = backupCodeUsedEmail(user.email, `${ctx.origin}/settings/security`);
    after(() => sendEmail(email, ctx.requestId));
  }
  ctx.done("ok", { user_id: user.id });
  redirect("/settings/security?backup=used");
}
