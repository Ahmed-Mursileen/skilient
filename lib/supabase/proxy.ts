import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { readPublicEnv } from "@/lib/env";

export interface ProxySession {
  response: NextResponse;
  supabase: SupabaseClient<Database> | null;
  /** Verified JWT claims (signature checked), or null when signed out. */
  claims: { sub: string; aal?: string } | null;
}

/**
 * Refreshes the auth session cookies proactively (PRD 10: proxy.ts uses getClaims()).
 * Returns the response carrying any refreshed cookies, plus the client and claims so the
 * caller can make route decisions with getUser().
 */
export async function refreshSession(request: NextRequest, makeResponse: () => NextResponse): Promise<ProxySession> {
  let response = makeResponse();
  const env = readPublicEnv();
  if (!env) return { response, supabase: null, claims: null };

  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = makeResponse();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Don't put code between client creation and getClaims(): it can cause random sign-outs.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ? { sub: data.claims.sub, aal: data.claims.aal as string | undefined } : null;
  return { get response() { return response; }, supabase, claims };
}

/** A redirect that keeps the refreshed auth cookies (and headers) from `from`. */
export function redirectWithCookies(request: NextRequest, from: NextResponse, to: string): NextResponse {
  const res = NextResponse.redirect(new URL(to, request.url), 303);
  for (const cookie of from.cookies.getAll()) res.cookies.set(cookie);
  for (const key of ["cache-control", "expires", "pragma", "x-request-id", "content-security-policy"]) {
    const value = from.headers.get(key);
    if (value) res.headers.set(key, value);
  }
  return res;
}

export function hasVerifiedFactor(user: User | null): boolean {
  return !!user?.factors?.some((f) => f.status === "verified");
}
