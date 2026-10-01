import "server-only";

import { z } from "zod";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * The recruiter API (PRD 5.20), version 1. A bearer token is hashed by the database (only the hash is
 * stored), checked against the organisation's plan, rate limited to 60 requests a minute per token and
 * scoped to students the organisation has a link with (an application, or an accepted request or a
 * shortlist entry while the student is visible): never a bulk export of the talent pool. The
 * functions run as `anon` carrying the token, so no service-role key is involved.
 */

const uuid = z.uuid();

const STATUS_BY_CODE: Record<string, { status: number; error: string }> = {
  "28000": { status: 401, error: "invalid_token" },
  "42501": { status: 403, error: "not_allowed" },
  "54000": { status: 429, error: "rate_limited" },
  P0002: { status: 404, error: "not_found" },
  "22P02": { status: 404, error: "not_found" },
};

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S{20,200})$/i.exec(header);
  return match?.[1] ?? null;
}

export async function apiCall(request: Request, action: string, fn: string, args: (token: string) => Record<string, unknown>, ids: Record<string, string> = {}): Promise<Response> {
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  const started = performance.now();
  const done = (outcome: "ok" | "refused" | "error", fields: Record<string, string | number> = {}) =>
    logger[outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info"](action, {
      request_id: requestId,
      action,
      duration_ms: Math.round(performance.now() - started),
      outcome,
      ...fields,
    });

  for (const value of Object.values(ids)) {
    if (!uuid.safeParse(value).success) {
      done("refused", { error_code: "invalid_id" });
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }
  }
  const token = bearer(request);
  if (!token) {
    done("refused", { error_code: "no_token" });
    return Response.json({ error: "invalid_token" }, { status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" } });
  }
  const { data, error } = await createPublicClient().rpc(fn as never, args(token) as never);
  if (error) {
    const mapped = STATUS_BY_CODE[error.code ?? ""];
    if (mapped) {
      done("refused", { error_code: mapped.error });
      return Response.json({ error: mapped.error }, { status: mapped.status, headers: mapped.status === 429 ? { ...headers, "Retry-After": "60" } : headers });
    }
    done("error", { error_code: error.code ?? "unknown" });
    return Response.json({ error: "unavailable", request_id: requestId }, { status: 503, headers });
  }
  done("ok");
  return Response.json(data, { headers });
}
