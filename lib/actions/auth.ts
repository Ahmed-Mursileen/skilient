"use server";

import type { AuthError } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { actionContext, type ActionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import {
  clearPendingSignInCode,
  clearPendingVerification,
  pendingSignInCode,
  pendingVerification,
  setAgreementIntent,
  setPendingSignInCode,
  setPendingVerification,
} from "@/lib/auth/cookies";
import { emailDomain, normalizeEmail } from "@/lib/auth/email-domain";
import { homeFor, safeNext, type GateState } from "@/lib/auth/gate";
import { passwordSchema } from "@/lib/auth/password";
import { recordSignIn } from "@/lib/auth/sign-in-record";
import { sendEmail } from "@/lib/email/send";
import { signInAttemptsEmail } from "@/lib/email/templates";
import { isBreachedPassword } from "@/lib/security/hibp";
import { rateLimit } from "@/lib/security/rate-limit";
import { isLoopback } from "@/lib/security/request-meta";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Messages the before-user-created hook returns (supabase/migrations/*_identity.sql). */
const HOOK_MESSAGES = new Set([
  "Use your university email.",
  "Use your work email.",
  "Use your company email, not a university one.",
  "Your university isn't on Skilient yet.",
  "That university doesn't use this email domain.",
  "Use your university Google account.",
  "This kind of account can't sign up here yet.",
  "Start again from the Skilient signup page.",
]);

const UNAVAILABLE = "Something went wrong on our side. Try again in a minute.";
const BREACHED = "This password has appeared in a data breach. Choose a different one.";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

function formValues(formData: FormData, keys: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) {
    const v = formData.get(key);
    out[key] = typeof v === "string" ? v : undefined;
  }
  return out;
}

function authCode(error: AuthError | null | undefined): string {
  return error?.code ?? (error?.status ? `http_${error.status}` : "unknown");
}

async function gateState(supabase: Supabase): Promise<GateState | null> {
  const { data } = await supabase.rpc("my_gate_state");
  return (data as GateState | null) ?? null;
}

/** Where to send someone who just signed in: MFA step, their `next`, or their home. */
async function destinationAfterSignIn(supabase: Supabase, next: string | null): Promise<string> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return next ? `/signin/mfa?next=${encodeURIComponent(next)}` : "/signin/mfa";
  }
  const state = await gateState(supabase);
  if (!state) return "/feed";
  const home = homeFor(state);
  // A recruiter without two-factor goes straight to turning it on (PRD 5.20): the portal needs it.
  if ((home === "/recruit" || home === "/uni") && aal?.currentLevel !== "aal2") return "/settings/security?required=1";
  // `next` wins once nothing is left to do first; the agreement screen carries it along.
  if (next && home === "/feed") return next;
  if (next && home === "/agreement") return `/agreement?next=${encodeURIComponent(next)}`;
  return home;
}

/**
 * Generous per-network limit on sign-in, code and signup requests (decisions 2026-09-28):
 * 100 per 10 minutes per real client IP. A campus shares one Wi-Fi address, so this only
 * stops floods; per-account throttling does the real work. Local runs (no IP, or
 * loopback) have no network limit.
 */
async function networkAllowed(supabase: Supabase, ctx: ActionContext): Promise<boolean> {
  if (!ctx.ipHash || isLoopback(ctx.ip)) return true;
  return rateLimit(supabase, "auth_ip", ctx.ipHash, 100, 600);
}
const NETWORK_BUSY = "Too many sign-in attempts from this network. Wait a few minutes and try again.";

async function currentAgreementVersion(supabase: Supabase): Promise<number | null> {
  const { data } = await supabase
    .from("agreement_versions")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.version ?? null;
}

// ---------------------------------------------------------------------------
// Sign up (PRD 5.2, 5.27)
// ---------------------------------------------------------------------------

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name (2 to 60 characters).").max(60, "Keep your name under 60 characters."),
  email: emailSchema,
  password: passwordSchema,
  universityId: z.union([z.uuid(), z.literal("")]).optional(),
  acceptAgreement: z.literal("on", { error: "Accept the User Agreement and Privacy Notice to continue." }),
  turnstileToken: z.string().max(4096).optional(),
  // Faculty sign up here too (PRD 5.21) and then ask for the teacher role; nothing else is offered.
  // University officials too (PRD 5.23): an official email, then two-factor and the claim.
  role: z.enum(["student", "faculty", "university_admin"]).optional(),
});

export async function signUp(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_up");
  const parsed = signUpSchema.safeParse(
    formValues(formData, ["fullName", "email", "password", "universityId", "acceptAgreement", "turnstileToken", "role"]),
  );
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const input = parsed.data;
  const role = input.role === "faculty" || input.role === "university_admin" ? input.role : "student";

  const turnstile = await verifyTurnstile(input.turnstileToken, ctx.ip);
  if (!turnstile.ok) {
    ctx.done("refused", { error_code: `turnstile_${turnstile.reason}` });
    return fail("captcha", "Complete the check that you're human, then try again.", { requestId: ctx.requestId });
  }

  const supabase = await createClient();
  if (!(await networkAllowed(supabase, ctx))) {
    ctx.done("refused", { error_code: "network_rate_limited" });
    return fail("rate_limited", NETWORK_BUSY);
  }

  // Authoritative domain check (the form's check is only for fast feedback; the Auth hook repeats it).
  const domain = emailDomain(input.email);
  const [owners, personal] = await Promise.all([
    supabase.from("university_domains").select("university_id").eq("domain", domain ?? "").in("kind", role === "student" ? ["student", "both"] : ["faculty", "both"]),
    supabase.from("personal_email_domains").select("domain").eq("domain", domain ?? "").maybeSingle(),
  ]);
  if (owners.error || personal.error) {
    ctx.done("error", { error_code: "domain_lookup_failed" });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  if (personal.data) {
    ctx.done("refused", { error_code: "personal_email" });
    return fail("personal_email", "Use your university email.", { fields: { email: "Use your university email." } });
  }
  const ownerIds = [...new Set(owners.data.map((o) => o.university_id))];
  if (ownerIds.length === 0) {
    ctx.done("refused", { error_code: "unknown_domain" });
    return fail("unknown_domain", "Your university isn't on Skilient yet.", {
      fields: { email: "Your university isn't on Skilient yet." },
    });
  }
  const universityId = input.universityId || (ownerIds.length === 1 ? ownerIds[0] : undefined);
  if (!universityId || !ownerIds.includes(universityId)) {
    ctx.done("refused", { error_code: "choose_university" });
    return fail("choose_university", "Choose your university.", { fields: { universityId: "Choose your university." } });
  }

  if (await isBreachedPassword(input.password)) {
    ctx.done("refused", { error_code: "breached_password" });
    return fail("breached_password", BREACHED, { fields: { password: BREACHED } });
  }

  const agreementVersion = await currentAgreementVersion(supabase);
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${ctx.origin}/auth/confirm`,
      data: {
        full_name: input.fullName,
        university_id: universityId,
        role,
        agreement_version: agreementVersion ? String(agreementVersion) : undefined,
      },
    },
  });

  if (error) {
    const code = authCode(error);
    if (HOOK_MESSAGES.has(error.message)) {
      ctx.done("refused", { error_code: "hook_refused" });
      return fail("refused", error.message, { fields: { email: error.message } });
    }
    if (code === "weak_password") {
      ctx.done("refused", { error_code: code });
      const message = error.message.includes("pwned") || error.message.toLowerCase().includes("leak") ? BREACHED : "Choose a stronger password.";
      return fail(code, message, { fields: { password: message } });
    }
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
      ctx.done("refused", { error_code: code });
      return fail("rate_limited", "Too many attempts. Wait a few minutes and try again.");
    }
    if (code === "user_already_exists" || code === "email_exists") {
      ctx.done("refused", { error_code: "already_registered" });
      return fail("already_registered", "This email is already registered. Sign in instead.");
    }
    ctx.done("error", { error_code: code });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }

  // PRD 5.2: an empty identities array means the address is already registered.
  if (data.user && data.user.identities?.length === 0) {
    ctx.done("refused", { error_code: "already_registered" });
    return fail("already_registered", "This email is already registered. Sign in instead.");
  }

  await setPendingVerification(input.email);
  ctx.done("ok", { user_id: data.user?.id });
  redirect("/signup/verify");
}

// ---------------------------------------------------------------------------
// Recruiter sign up (PRD 5.20): a company email, never a webmail or university address
// ---------------------------------------------------------------------------

const recruiterSignUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name (2 to 60 characters).").max(60, "Keep your name under 60 characters."),
  email: emailSchema,
  password: passwordSchema,
  acceptAgreement: z.literal("on", { error: "Accept the User Agreement and Privacy Notice to continue." }),
  turnstileToken: z.string().max(4096).optional(),
});

export async function signUpRecruiter(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_up_recruiter");
  const parsed = recruiterSignUpSchema.safeParse(formValues(formData, ["fullName", "email", "password", "acceptAgreement", "turnstileToken"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const input = parsed.data;

  const turnstile = await verifyTurnstile(input.turnstileToken, ctx.ip);
  if (!turnstile.ok) {
    ctx.done("refused", { error_code: `turnstile_${turnstile.reason}` });
    return fail("captcha", "Complete the check that you're human, then try again.", { requestId: ctx.requestId });
  }

  const supabase = await createClient();
  if (!(await networkAllowed(supabase, ctx))) {
    ctx.done("refused", { error_code: "network_rate_limited" });
    return fail("rate_limited", NETWORK_BUSY);
  }

  // The form's check is only for fast feedback; the Auth hook repeats it.
  const domain = emailDomain(input.email);
  const [personal, university] = await Promise.all([
    supabase.from("personal_email_domains").select("domain").eq("domain", domain ?? "").maybeSingle(),
    supabase.from("university_domains").select("domain").eq("domain", domain ?? "").limit(1),
  ]);
  if (personal.error || university.error) {
    ctx.done("error", { error_code: "domain_lookup_failed" });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  if (personal.data) {
    ctx.done("refused", { error_code: "personal_email" });
    return fail("personal_email", "Use your work email.", { fields: { email: "Use your work email: webmail addresses can't create a recruiter account." } });
  }
  if (university.data.length > 0) {
    ctx.done("refused", { error_code: "university_email" });
    return fail("university_email", "Use your company email, not a university one.", { fields: { email: "Use your company email, not a university one." } });
  }

  if (await isBreachedPassword(input.password)) {
    ctx.done("refused", { error_code: "breached_password" });
    return fail("breached_password", BREACHED, { fields: { password: BREACHED } });
  }

  const agreementVersion = await currentAgreementVersion(supabase);
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${ctx.origin}/auth/confirm`,
      data: {
        full_name: input.fullName,
        role: "recruiter",
        agreement_version: agreementVersion ? String(agreementVersion) : undefined,
      },
    },
  });

  if (error) {
    const code = authCode(error);
    if (HOOK_MESSAGES.has(error.message)) {
      ctx.done("refused", { error_code: "hook_refused" });
      return fail("refused", error.message, { fields: { email: error.message } });
    }
    if (code === "weak_password") {
      ctx.done("refused", { error_code: code });
      const message = error.message.includes("pwned") || error.message.toLowerCase().includes("leak") ? BREACHED : "Choose a stronger password.";
      return fail(code, message, { fields: { password: message } });
    }
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
      ctx.done("refused", { error_code: code });
      return fail("rate_limited", "Too many attempts. Wait a few minutes and try again.");
    }
    if (code === "user_already_exists" || code === "email_exists") {
      ctx.done("refused", { error_code: "already_registered" });
      return fail("already_registered", "This email is already registered. Sign in instead.");
    }
    ctx.done("error", { error_code: code });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  if (data.user && data.user.identities?.length === 0) {
    ctx.done("refused", { error_code: "already_registered" });
    return fail("already_registered", "This email is already registered. Sign in instead.");
  }

  await setPendingVerification(input.email);
  ctx.done("ok", { user_id: data.user?.id });
  redirect("/signup/verify");
}

// ---------------------------------------------------------------------------
// Email verification: 6-digit code (this tab) or link (/auth/confirm)
// ---------------------------------------------------------------------------

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") });

export async function verifyEmailCode(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.verify_code");
  const email = await pendingVerification();
  if (!email) {
    ctx.done("refused", { error_code: "no_pending_signup" });
    return fail("no_pending_signup", "This page has expired. Sign in, or sign up again.");
  }
  const parsed = codeSchema.safeParse(formValues(formData, ["code"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter the 6-digit code from the email.", { fields: fieldErrors(parsed.error.issues) });
  }

  const supabase = await createClient();
  if (!(await rateLimit(supabase, "otp_verify", email, 5, 15 * 60))) {
    ctx.done("refused", { error_code: "too_many_attempts" });
    return fail("too_many_attempts", "Too many attempts. Send a new code or wait 15 minutes.");
  }

  const { data, error } = await supabase.auth.verifyOtp({ email, token: parsed.data.code, type: "email" });
  if (error || !data.user) {
    const code = authCode(error);
    ctx.done("refused", { error_code: code });
    if (code === "otp_expired") return fail("expired", "This code has expired or is wrong. Check it, or send a new one.");
    return fail("invalid_code", "That code isn't right. Check the email and try again.");
  }

  await recordSignIn(supabase, ctx, "otp", data.user.email);
  await clearPendingVerification();
  ctx.done("ok", { user_id: data.user.id });
  redirect((await destinationAfterSignIn(supabase, null)) as Route);
}

export async function resendVerificationCode(): Promise<ActionResult> {
  const ctx = await actionContext("auth.resend_code");
  const email = await pendingVerification();
  if (!email) {
    ctx.done("refused", { error_code: "no_pending_signup" });
    return fail("no_pending_signup", "This page has expired. Sign in, or sign up again.");
  }
  const supabase = await createClient();
  // PRD 5.27: resend limited to 3 per hour.
  if (!(await rateLimit(supabase, "otp_resend", email, 3, 3600))) {
    ctx.done("refused", { error_code: "rate_limited" });
    return fail("rate_limited", "You can resend the code 3 times an hour. Try again later.");
  }
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${ctx.origin}/auth/confirm` },
  });
  if (error) {
    const code = authCode(error);
    ctx.done(code.startsWith("over_") ? "refused" : "error", { error_code: code });
    return code.startsWith("over_")
      ? fail("rate_limited", "Wait a minute before asking for another code.")
      : fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  ctx.done("ok");
  return ok(null);
}

// ---------------------------------------------------------------------------
// Password sign-in, throttled without lockout (PRD 5.2, 10; decisions 2026-09-28)
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(128, "Enter your password."),
  turnstileToken: z.string().max(4096).optional(),
  next: z.string().max(512).optional(),
});

interface SigninStatus {
  failures: number;
  captcha_required: boolean;
  retry_after_seconds: number;
}

const waitMessage = (seconds: number) =>
  `Too many wrong passwords. Wait ${seconds} second${seconds === 1 ? "" : "s"} and try again, or sign in with an emailed code.`;

export async function signIn(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_in");
  const parsed = signInSchema.safeParse(formValues(formData, ["email", "password", "turnstileToken", "next"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter your email and password.", { fields: fieldErrors(parsed.error.issues) });
  }
  const input = parsed.data;
  const supabase = await createClient();
  if (!(await networkAllowed(supabase, ctx))) {
    ctx.done("refused", { error_code: "network_rate_limited" });
    return fail("rate_limited", NETWORK_BUSY);
  }

  const { data: statusData, error: statusError } = await supabase.rpc("signin_status", {
    p_email: input.email,
    p_ip_hash: ctx.ipHash ?? "",
  });
  if (statusError) {
    ctx.done("error", { error_code: "signin_status_failed" });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  const status = statusData as unknown as SigninStatus;
  // Never a lockout: at most a wait of seconds, and the emailed code always works.
  if (status.retry_after_seconds > 0) {
    ctx.done("refused", { error_code: "slow_down" });
    return fail("slow_down", waitMessage(status.retry_after_seconds), {
      hints: { captcha: status.captcha_required, retryAfter: status.retry_after_seconds },
    });
  }
  if (status.captcha_required) {
    const turnstile = await verifyTurnstile(input.turnstileToken, ctx.ip);
    if (!turnstile.ok) {
      ctx.done("refused", { error_code: `turnstile_${turnstile.reason}` });
      return fail("captcha_required", "Complete the check that you're human, then sign in.", { hints: { captcha: true } });
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error || !data.user) {
    const code = authCode(error);
    if (code === "email_not_confirmed") {
      await setPendingVerification(input.email);
      ctx.done("refused", { error_code: code });
      return fail("email_not_confirmed", "Confirm your email first. We can send you a new code.", {
        hints: { verify: true },
      });
    }
    if (code === "user_banned") {
      ctx.done("refused", { error_code: code });
      return fail("suspended", "This account is suspended. Check your email for the reason and how to appeal.");
    }
    if (code === "invalid_credentials") {
      const { data: failed } = await supabase.rpc("signin_failed", { p_email: input.email, p_ip_hash: ctx.ipHash ?? "" });
      const f = (failed ?? {}) as { captcha_required?: boolean; retry_after_seconds?: number; notify?: boolean };
      if (f.notify) {
        const urls = { codeUrl: `${ctx.origin}/signin/code`, resetUrl: `${ctx.origin}/forgot-password` };
        after(() => sendEmail(signInAttemptsEmail(input.email, urls), ctx.requestId));
      }
      const wait = f.retry_after_seconds ?? 0;
      ctx.done("refused", { error_code: wait > 0 ? "slow_down" : code });
      if (wait > 0) {
        return fail("slow_down", waitMessage(wait), { hints: { captcha: !!f.captcha_required, retryAfter: wait } });
      }
      return fail("invalid_credentials", "That email and password don't match.", {
        hints: { captcha: !!f.captcha_required },
      });
    }
    if (code.startsWith("over_")) {
      ctx.done("refused", { error_code: code });
      return fail("rate_limited", "Too many attempts. Wait a few minutes, or sign in with an emailed code.");
    }
    ctx.done("error", { error_code: code });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }

  await recordSignIn(supabase, ctx, "password", data.user.email);
  ctx.done("ok", { user_id: data.user.id });
  redirect((await destinationAfterSignIn(supabase, safeNext(input.next))) as Route);
}

// ---------------------------------------------------------------------------
// Sign in with an emailed code (decisions 2026-09-28): always available, even while
// password sign-in is slowed, so nobody can lock a student out.
// ---------------------------------------------------------------------------

const requestCodeSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().max(4096).optional(),
  next: z.string().max(512).optional(),
});

export async function requestSignInCode(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_in_code_request");
  const parsed = requestCodeSchema.safeParse(formValues(formData, ["email", "turnstileToken", "next"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter a valid email address.", { fields: fieldErrors(parsed.error.issues) });
  }
  const input = parsed.data;
  // Turnstile keeps bots from using this to flood inboxes.
  const turnstile = await verifyTurnstile(input.turnstileToken, ctx.ip);
  if (!turnstile.ok) {
    ctx.done("refused", { error_code: `turnstile_${turnstile.reason}` });
    return fail("captcha", "Complete the check that you're human, then try again.", { requestId: ctx.requestId });
  }
  const supabase = await createClient();
  if (!(await networkAllowed(supabase, ctx))) {
    ctx.done("refused", { error_code: "network_rate_limited" });
    return fail("rate_limited", NETWORK_BUSY);
  }
  if (!(await rateLimit(supabase, "signin_code", input.email, 5, 3600))) {
    ctx.done("refused", { error_code: "rate_limited" });
    return fail("rate_limited", "We've sent 5 codes to this address in the last hour. Use the newest one, or try again later.");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${ctx.origin}/auth/confirm` },
  });
  // Same answer whether or not the account exists (unknown addresses get no email).
  const code = error ? authCode(error) : null;
  if (code && code !== "otp_disabled" && code !== "user_not_found" && !code.startsWith("over_")) {
    ctx.done("error", { error_code: code });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  await setPendingSignInCode(input.email);
  ctx.done("ok", { error_code: code ?? undefined });
  const next = safeNext(input.next);
  redirect((next ? `/signin/code?next=${encodeURIComponent(next)}` : "/signin/code") as Route);
}

const signInCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
  next: z.string().max(512).optional(),
});

export async function verifyEmailSignInCode(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_in_code_verify");
  const email = await pendingSignInCode();
  if (!email) {
    ctx.done("refused", { error_code: "no_pending_code" });
    return fail("no_pending_code", "This code request has expired. Ask for a new code.");
  }
  const parsed = signInCodeSchema.safeParse(formValues(formData, ["code", "next"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter the 6-digit code from the email.", { fields: fieldErrors(parsed.error.issues) });
  }
  const supabase = await createClient();
  if (!(await rateLimit(supabase, "signin_code_verify", email, 5, 15 * 60))) {
    ctx.done("refused", { error_code: "too_many_attempts" });
    return fail("too_many_attempts", "Too many wrong codes. Ask for a new code.");
  }
  const { data, error } = await supabase.auth.verifyOtp({ email, token: parsed.data.code, type: "email" });
  if (error || !data.user) {
    ctx.done("refused", { error_code: authCode(error) });
    return fail("invalid_code", "That code is wrong or has expired. Check the newest email, or ask for a new code.");
  }
  await recordSignIn(supabase, ctx, "otp", data.user.email);
  await clearPendingSignInCode();
  ctx.done("ok", { user_id: data.user.id });
  redirect((await destinationAfterSignIn(supabase, safeNext(parsed.data.next))) as Route);
}

/** Resends to the address that already passed Turnstile (held in the httpOnly cookie). */
export async function resendSignInCode(): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_in_code_resend");
  const email = await pendingSignInCode();
  if (!email) {
    ctx.done("refused", { error_code: "no_pending_code" });
    return fail("no_pending_code", "This code request has expired. Ask for a new code.");
  }
  const supabase = await createClient();
  if (!(await networkAllowed(supabase, ctx)) || !(await rateLimit(supabase, "signin_code", email, 5, 3600))) {
    ctx.done("refused", { error_code: "rate_limited" });
    return fail("rate_limited", "We've sent 5 codes to this address in the last hour. Use the newest one, or try again later.");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${ctx.origin}/auth/confirm` },
  });
  const code = error ? authCode(error) : null;
  if (code?.startsWith("over_")) {
    ctx.done("refused", { error_code: code });
    return fail("rate_limited", "Wait a minute before asking for another code.");
  }
  if (code && code !== "otp_disabled" && code !== "user_not_found") {
    ctx.done("error", { error_code: code });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  ctx.done("ok");
  return ok(null);
}

export async function forgetSignInCode(): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_in_code_forget");
  await clearPendingSignInCode();
  ctx.done("ok");
  redirect("/signin/code");
}

// ---------------------------------------------------------------------------
// Google sign-in, university accounts only (PRD 5.27)
// ---------------------------------------------------------------------------

const googleSchema = z.object({
  next: z.string().max(512).optional(),
  email: z.string().max(254).optional(),
  acceptAgreement: z.literal("on").optional(),
});

export async function startGoogleSignIn(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.google_start");
  const parsed = googleSchema.safeParse(formValues(formData, ["next", "email", "acceptAgreement"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Try again from the sign-in page.");
  }
  const supabase = await createClient();

  if (parsed.data.acceptAgreement) {
    const version = await currentAgreementVersion(supabase);
    if (version) await setAgreementIntent(version);
  }

  const next = safeNext(parsed.data.next);
  const callback = new URL("/auth/callback", ctx.origin);
  if (next) callback.searchParams.set("next", next);
  // `hd` is only a hint for Google's account chooser; the Auth hook and /auth/callback enforce the domain.
  const hint = parsed.data.email ? emailDomain(normalizeEmail(parsed.data.email)) : null;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      queryParams: { hd: hint ?? "*", prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    ctx.done("error", { error_code: authCode(error) });
    return fail("unavailable", "Google sign-in isn't available right now. Use your email and password.", {
      requestId: ctx.requestId,
    });
  }
  ctx.done("ok");
  redirect(data.url as Route);
}

// ---------------------------------------------------------------------------
// Password reset (PRD 5.2)
// ---------------------------------------------------------------------------

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.password_reset_request");
  const parsed = z.object({ email: emailSchema }).safeParse(formValues(formData, ["email"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Enter a valid email address.", { fields: fieldErrors(parsed.error.issues) });
  }
  const supabase = await createClient();
  if (!(await networkAllowed(supabase, ctx))) {
    ctx.done("refused", { error_code: "network_rate_limited" });
    return fail("rate_limited", NETWORK_BUSY);
  }
  if (!(await rateLimit(supabase, "reset_email", parsed.data.email, 3, 3600))) {
    ctx.done("refused", { error_code: "rate_limited" });
    return fail("rate_limited", "Too many reset emails. Try again in an hour.");
  }
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${ctx.origin}/auth/confirm`,
  });
  // Same answer whether or not the account exists.
  if (error && !authCode(error).startsWith("over_")) {
    ctx.done("error", { error_code: authCode(error) });
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  ctx.done("ok");
  return ok(null);
}

const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords don't match." });

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("auth.password_reset");
  const parsed = resetSchema.safeParse(formValues(formData, ["password", "confirm"]));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Check the highlighted fields.", { fields: fieldErrors(parsed.error.issues) });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("expired", "This reset link has expired. Ask for a new one.");
  }
  if (await isBreachedPassword(parsed.data.password)) {
    ctx.done("refused", { error_code: "breached_password", user_id: user.id });
    return fail("breached_password", BREACHED, { fields: { password: BREACHED } });
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const code = authCode(error);
    ctx.done("refused", { error_code: code, user_id: user.id });
    if (code === "same_password") return fail(code, "Choose a password you haven't used here before.", { fields: { password: "Choose a new password." } });
    if (code === "weak_password") return fail(code, BREACHED, { fields: { password: BREACHED } });
    if (code === "reauthentication_needed" || code === "session_not_found") return fail("expired", "This reset link has expired. Ask for a new one.");
    return fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId });
  }
  // PRD 10: a password change ends every other session.
  await supabase.auth.signOut({ scope: "others" });
  await supabase.rpc("log_security_event", { p_kind: "password_changed", p_ip_hash: ctx.ipHash ?? "", p_user_agent: ctx.userAgent });
  ctx.done("ok", { user_id: user.id });
  redirect((await destinationAfterSignIn(supabase, null)) as Route);
}

// ---------------------------------------------------------------------------
// Sign out (PRD 5.2): the client then clears its state and hard-navigates to "/".
// ---------------------------------------------------------------------------

export async function signOut(): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_out");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  ctx.done(error ? "error" : "ok", { user_id: user?.id, error_code: error ? authCode(error) : undefined });
  return ok(null);
}

export async function signOutEverywhere(): Promise<ActionResult> {
  const ctx = await actionContext("auth.sign_out_everywhere");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "You're already signed out.");
  }
  await supabase.rpc("log_security_event", {
    p_kind: "signed_out_everywhere",
    p_ip_hash: ctx.ipHash ?? "",
    p_user_agent: ctx.userAgent,
  });
  const { error } = await supabase.auth.signOut({ scope: "global" });
  ctx.done(error ? "error" : "ok", { user_id: user.id, error_code: error ? authCode(error) : undefined });
  return error ? fail("unavailable", UNAVAILABLE, { requestId: ctx.requestId }) : ok(null);
}

// ---------------------------------------------------------------------------
// "This wasn't me" (PRD 10): from the new-device email, signed in or not.
// ---------------------------------------------------------------------------

export async function reportNotMe(formData: FormData): Promise<ActionResult> {
  const ctx: ActionContext = await actionContext("auth.not_me");
  const token = formValues(formData, ["token"]).token ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) {
    ctx.done("refused", { error_code: "invalid_token" });
    return fail("invalid_token", "This link isn't valid. Sign in and change your password from Settings.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("security_not_me", { p_token: token });
  const result = (data ?? {}) as { ok?: boolean; email?: string };
  if (error || !result.ok || !result.email) {
    ctx.done("refused", { error_code: error ? "rpc_failed" : "token_used_or_expired" });
    return fail("invalid_token", "This link has expired or was already used. Reset your password from the sign-in page.");
  }
  // Every session is already gone server-side; drop this browser's cookies too.
  await supabase.auth.signOut({ scope: "local" });
  await supabase.auth.resetPasswordForEmail(result.email, { redirectTo: `${ctx.origin}/auth/confirm` });
  ctx.done("ok");
  return ok(null);
}
