import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { readPublicEnv } from "@/lib/env";

/**
 * Refreshes the auth session cookies proactively (PRD 10: proxy.ts uses getClaims()).
 * Route gating arrives with phase 1; this only keeps tokens fresh.
 */
export async function refreshSession(request: NextRequest, makeResponse: () => NextResponse): Promise<NextResponse> {
  let response = makeResponse();
  const env = readPublicEnv();
  if (!env) return response;

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
  await supabase.auth.getClaims();
  return response;
}
