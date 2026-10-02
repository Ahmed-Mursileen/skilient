"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requestUniversity as copy } from "@/content/marketing";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, ok, type ActionResult } from "@/lib/actions/result";
import { sendEmail } from "@/lib/email/send";
import { universityRequestEmail } from "@/lib/email/templates";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createClient } from "@/lib/supabase/server";

/**
 * "Request it" from the landing email field (PRD 5.1). Signed out: Zod, a honeypot,
 * Turnstile, 5 requests per hour per IP and a network-wide cap, then the SQL function,
 * which refuses personal and live domains and stores only a hash of the email token.
 * One confirmation email per new request; a repeat request sends nothing.
 */

export interface RequestUniversityResult {
  status: "created" | "exists";
  university: string | null;
}

const schema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
  universityName: z.string().trim().max(200, "Keep the name under 200 characters.").optional(),
  consent: z.literal("on", { error: "Tick the box so we can email you when your university joins." }),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

const PER_IP = 5;
const ALL = 300;

export async function requestUniversity(_prev: ActionResult<RequestUniversityResult> | null, formData: FormData): Promise<ActionResult<RequestUniversityResult>> {
  const ctx = await actionContext("marketing.request_university");
  const values = Object.fromEntries(
    ["email", "universityName", "consent", "website", "turnstileToken"].map((k) => [k, formData.get(k) ?? undefined]),
  );
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    // A filled honeypot looks like success to the bot and does nothing.
    if (typeof values.website === "string" && values.website.length > 0) {
      ctx.done("refused", { error_code: "honeypot" });
      return ok({ status: "created", university: null });
    }
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
  const [ipOk, allOk] = await Promise.all([
    rateLimit(supabase, "uni_request", ctx.ip ?? "unknown", PER_IP, 3600),
    rateLimit(supabase, "uni_request_all", "all", ALL, 3600),
  ]);
  if (!ipOk || !allOk) {
    ctx.done("refused", { error_code: "rate_limited" });
    return fail("rate_limited", copy.rateLimited);
  }

  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase.rpc("request_university", {
    p_email: input.email,
    p_university_name: input.universityName ?? "",
    p_consent: true,
    p_token: token,
  });
  if (error) {
    if (error.code === "22023" || error.code === "55000") {
      ctx.done("refused", { error_code: error.code === "55000" ? "already_live" : "refused" });
      const field = /name/i.test(error.message) ? "universityName" : "email";
      return fail(error.code === "55000" ? "already_live" : "refused", error.message, { fields: { [field]: error.message } });
    }
    ctx.done("error", { error_code: error.code ?? "unknown" });
    return fail("unavailable", "We couldn't send your request. Try again in a minute.", { requestId: ctx.requestId });
  }
  const result = data as unknown as RequestUniversityResult;
  if (result.status === "created") {
    const link = (path: string) => `${ctx.origin}${path}?token=${encodeURIComponent(token)}`;
    await sendEmail(
      universityRequestEmail(input.email, {
        university: result.university,
        confirmUrl: link("/request-university/confirm"),
        unsubscribeUrl: link("/request-university/unsubscribe"),
      }),
      ctx.requestId,
    );
  }
  ctx.done("ok", { status: result.status });
  return ok(result);
}

const tokenSchema = z.string().min(32).max(200);

/** The unsubscribe page's button (a POST, so mail scanners following links can't unsubscribe anyone). */
export async function unsubscribeUniversityRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("marketing.unsubscribe_university_request");
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", copy.badLink);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_university_request", { p_token: parsed.data });
  if (error) {
    ctx.done("error", { error_code: error.code ?? "unknown" });
    return fail("unavailable", "We couldn't update your request. Try again in a minute.", { requestId: ctx.requestId });
  }
  if (!data) {
    ctx.done("refused", { error_code: "unknown_token" });
    return fail("not_found", copy.badLink);
  }
  ctx.done("ok");
  return ok(null);
}
