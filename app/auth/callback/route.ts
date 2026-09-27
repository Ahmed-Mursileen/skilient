import { NextResponse, type NextRequest } from "next/server";
import { originFrom } from "@/lib/actions/context";
import { takeAgreementIntent } from "@/lib/auth/cookies";
import { homeFor, safeNext, type GateState } from "@/lib/auth/gate";
import { recordSignIn } from "@/lib/auth/sign-in-record";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { hashIp } from "@/lib/security/hash";
import { clientIp, userAgent } from "@/lib/security/request-meta";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GOOGLE_DOMAIN_MESSAGE = "Use your university Google account.";

/**
 * OAuth (Google) code exchange (PRD 5.2). Honours a validated same-origin `next`, and
 * re-checks the university domain on every sign-in, not only at account creation (5.27).
 */
export async function GET(request: NextRequest) {
  const started = performance.now();
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const url = request.nextUrl;
  const origin = originFrom(request.headers);
  const next = safeNext(url.searchParams.get("next"));
  const done = (outcome: "ok" | "refused" | "error", to: string, fields: Record<string, string | undefined> = {}) => {
    logger[outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info"]("auth.callback", {
      request_id: requestId,
      action: "GET /auth/callback",
      duration_ms: Math.round(performance.now() - started),
      outcome,
      ...fields,
    });
    return NextResponse.redirect(new URL(to, origin), 303);
  };

  // Provider or hook refusals come back as ?error=…&error_description=…
  const description = url.searchParams.get("error_description");
  if (url.searchParams.get("error") || description) {
    const refusedDomain = description?.includes(GOOGLE_DOMAIN_MESSAGE);
    return done("refused", `/signin?error=${refusedDomain ? "google_domain" : "google"}`, {
      error_code: url.searchParams.get("error_code") ?? url.searchParams.get("error") ?? "provider_error",
    });
  }

  const code = url.searchParams.get("code");
  if (!code) return done("refused", "/signin?error=google", { error_code: "no_code" });

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return done("refused", "/signin?error=google", { error_code: error.code ?? "exchange_failed" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: gate } = await supabase.rpc("my_gate_state");
  const state = gate as GateState | null;
  if (!user || !state?.has_profile || !state.email_allowed) {
    await supabase.auth.signOut({ scope: "local" });
    return done("refused", "/signin?error=google_domain", { error_code: "domain_not_allowed", user_id: user?.id });
  }

  // "I agree" ticked on /signup before choosing Google.
  const agreed = await takeAgreementIntent();
  if (agreed && !state.agreement_accepted && agreed === state.agreement_version) {
    const ip = hashIp(clientIp(request.headers));
    const { error: acceptError } = await supabase
      .from("agreement_acceptances")
      .insert({ user_id: user.id, version: agreed, ip_hash: ip }, { count: "exact" });
    if (!acceptError) state.agreement_accepted = true;
  }

  await recordSignIn(
    supabase,
    {
      requestId,
      ipHash: hashIp(clientIp(request.headers)),
      userAgent: userAgent(request.headers),
      origin,
      headers: request.headers,
    },
    "google",
    user.email,
  );

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return done("ok", next ? `/signin/mfa?next=${encodeURIComponent(next)}` : "/signin/mfa", { user_id: user.id });
  }
  const home = homeFor(state);
  const to = next && home === "/feed" ? next : next && home === "/agreement" ? `/agreement?next=${encodeURIComponent(next)}` : home;
  return done("ok", to, { user_id: user.id });
}
