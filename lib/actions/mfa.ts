"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { homeFor, safeNext, type GateState } from "@/lib/auth/gate";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Two-factor with an authenticator app (TOTP), PRD 10: optional for students now,
 * required later for recruiters, university admins and staff (aal2 checks in proxy.ts
 * and is_staff()). Recovery codes are not part of Supabase Auth; see decisions.md.
 */

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
  if (factors?.totp.some((f) => f.status === "verified")) {
    ctx.done("refused", { error_code: "already_enrolled", user_id: user.id });
    return fail("already_enrolled", "Two-factor is already on for this account.");
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
  if (error || !data) {
    ctx.done("error", { error_code: error?.code ?? "unknown", user_id: user.id });
    return fail("unavailable", "Couldn't start two-factor set-up. Try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: user.id });
  return ok({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
}

export async function confirmTotpEnrollment(formData: FormData): Promise<ActionResult> {
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
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) {
    ctx.done("refused", { error_code: error.code ?? "verify_failed", user_id: user.id });
    return fail("invalid_code", "That code didn't work. Check your app's clock and try the newest code.", {
      fields: { code: "That code didn't work." },
    });
  }
  await supabase.rpc("log_security_event", { p_kind: "mfa_enrolled", p_ip_hash: ctx.ipHash ?? "", p_user_agent: ctx.userAgent });
  ctx.done("ok", { user_id: user.id });
  return ok(null);
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
  const factor = user.factors?.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor) {
    ctx.done("refused", { error_code: "no_factor", user_id: user.id });
    return fail("no_factor", "Two-factor isn't set up on this account.");
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
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
