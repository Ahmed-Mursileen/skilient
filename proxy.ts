import { NextResponse, type NextRequest } from "next/server";
import { decideRoute, isPublicPath, type GateState } from "@/lib/auth/gate";
import { buildCsp, newNonce, NONCE_HEADER } from "@/lib/security/headers";
import { hasVerifiedFactor, redirectWithCookies, refreshSession } from "@/lib/supabase/proxy";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

export async function proxy(request: NextRequest) {
  // next.config.ts sets skipTrailingSlashRedirect for PostHog's /ingest paths; every other path keeps
  // Next's usual behaviour: "/feed/" redirects to "/feed".
  const { pathname: rawPath } = request.nextUrl;
  if (rawPath.length > 1 && rawPath.endsWith("/")) {
    const url = request.nextUrl.clone();
    url.pathname = rawPath.replace(/\/+$/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  // Always mint our own id and nonce; never trust ones from the client.
  const requestId = newRequestId();
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    dev: process.env.NODE_ENV === "development",
  });

  // Rebuilt on every call so refreshed auth cookies (set on request.cookies) reach the render.
  const makeResponse = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set(NONCE_HEADER, nonce);
    // Next.js reads the nonce for its own scripts from the request's CSP header.
    headers.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set(REQUEST_ID_HEADER, requestId);
    res.headers.set("content-security-policy", csp);
    return res;
  };

  const session = await refreshSession(request, makeResponse);
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || !session.supabase) return session.response;

  // Route decisions use getUser() (verified with the Auth server), never the cookie alone.
  let user = null;
  let state: GateState | null = null;
  if (session.claims) {
    const { data } = await session.supabase.auth.getUser();
    user = data.user;
    if (user) {
      const { data: gate } = await session.supabase.rpc("my_gate_state");
      state = (gate as GateState | null) ?? null;
    }
  }

  const decision = decideRoute({
    pathname,
    path: `${pathname}${search}`,
    signedIn: !!user,
    aal: session.claims?.aal ?? null,
    hasVerifiedFactor: hasVerifiedFactor(user),
    state,
  });

  if (decision.type === "next") return session.response;
  if (decision.type === "sign-out") await session.supabase.auth.signOut({ scope: "local" });
  return redirectWithCookies(request, session.response, decision.to);
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation and the PostHog proxy (/ingest).
    "/((?!_next/static|_next/image|ingest/|brand/|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
