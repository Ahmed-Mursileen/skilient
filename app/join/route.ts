import { NextResponse } from "next/server";
import { detectUniversity, normalizeEmail } from "@/lib/auth/email-domain";
import { loadDomainDirectory } from "@/lib/data/universities";
import { originFrom } from "@/lib/actions/context";
import { logger, requestIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * The university email field without JavaScript (PRD 5.1, plan B9): the form GETs here and the
 * server makes the field's decision. Live university: /signup with the email. Known but not
 * live, or unknown: /request-university. Personal or malformed: back to the field with the reason.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("email") ?? "").slice(0, 254);
  const email = normalizeEmail(raw);
  const to = (path: string, params: Record<string, string>, hash = "") => {
    // The origin the browser used (request.url carries the server's own host behind a proxy).
    const target = new URL(path, originFrom(request.headers));
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    target.hash = hash;
    return NextResponse.redirect(target, 303);
  };
  const requestId = requestIdFrom(request.headers);
  try {
    const d = detectUniversity(email, await loadDomainDirectory());
    logger.info("marketing.join", { request_id: requestId, action: "GET /join", outcome: "ok", detection: d.kind });
    if (d.kind === "match") return to("/signup", { email });
    if (d.kind === "not_live" || d.kind === "unknown") return to("/request-university", { email });
    return to("/", { email, state: d.kind === "personal" ? "personal" : "invalid" }, "join");
  } catch (err) {
    logger.error("marketing.join", {
      request_id: requestId,
      action: "GET /join",
      outcome: "error",
      error_code: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    // The signup form checks the domain itself.
    return to("/signup", email ? { email } : {});
  }
}
