import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

export async function proxy(request: NextRequest) {
  // Always mint our own id; never trust one from the client.
  const requestId = newRequestId();

  // Rebuilt on every call so refreshed auth cookies (set on request.cookies) reach the render.
  const makeResponse = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set(REQUEST_ID_HEADER, requestId);
    return res;
  };

  return refreshSession(request, makeResponse);
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|brand/|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
