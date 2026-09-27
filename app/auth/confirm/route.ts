import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { originFrom } from "@/lib/actions/context";
import { recordSignIn } from "@/lib/auth/sign-in-record";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { hashIp } from "@/lib/security/hash";
import { clientIp, userAgent } from "@/lib/security/request-meta";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Where each email link lands after verification (and on failure). */
const ROUTES: Partial<Record<EmailOtpType, { ok: string; failed: string }>> = {
  email: { ok: "/auth/confirmed", failed: "/auth/confirmed?error=expired" },
  signup: { ok: "/auth/confirmed", failed: "/auth/confirmed?error=expired" },
  recovery: { ok: "/reset-password", failed: "/forgot-password?error=expired" },
  email_change: { ok: "/feed", failed: "/signin?error=link_expired" },
};

/**
 * Email links (confirmation, password reset, email change) carry a token_hash, so they
 * work in any browser or device, not just the one that started the flow (PKCE).
 * Scanners that prefetch the link only spend the token; nothing else happens on GET.
 */
export async function GET(request: NextRequest) {
  const started = performance.now();
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const origin = originFrom(request.headers);
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const route = type ? ROUTES[type] : undefined;

  const finish = (outcome: "ok" | "refused", to: string, errorCode?: string, userId?: string) => {
    logger[outcome === "ok" ? "info" : "warn"]("auth.confirm", {
      request_id: requestId,
      action: "GET /auth/confirm",
      duration_ms: Math.round(performance.now() - started),
      outcome,
      error_code: errorCode,
      user_id: userId,
      link_type: type ?? undefined,
    });
    return NextResponse.redirect(new URL(to, origin), 303);
  };

  if (!tokenHash || !type || !route || !/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)) {
    return finish("refused", "/signin?error=link_expired", "bad_link");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return finish("refused", route.failed, error?.code ?? "verify_failed");

  if (type === "email" || type === "signup" || type === "recovery") {
    await recordSignIn(
      supabase,
      { requestId, ipHash: hashIp(clientIp(request.headers)), userAgent: userAgent(request.headers), origin, headers: request.headers },
      type === "recovery" ? "recovery" : "magic_link",
      data.user.email,
    );
  }
  return finish("ok", route.ok, undefined, data.user.id);
}
