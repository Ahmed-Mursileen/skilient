import "server-only";

import { headers } from "next/headers";
import { logger, requestIdFrom, type LogFields, type Outcome } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { hashIp } from "@/lib/security/hash";
import { clientIp, userAgent } from "@/lib/security/request-meta";

export interface ActionContext {
  action: string;
  requestId: string;
  headers: Headers;
  ip: string | null;
  ipHash: string | null;
  userAgent: string;
  /** Origin the browser used (for email links and OAuth redirects). */
  origin: string;
  /** One JSON log line per action (CLAUDE.md), with request_id and duration. */
  done(outcome: Outcome, fields?: LogFields): void;
}

export function originFrom(h: Headers): string {
  const origin = h.get("origin");
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function actionContext(action: string): Promise<ActionContext> {
  const h = await headers();
  const requestId = requestIdFrom(h) ?? newRequestId();
  const ip = clientIp(h);
  const started = performance.now();
  return {
    action,
    requestId,
    headers: h,
    ip,
    ipHash: hashIp(ip),
    userAgent: userAgent(h),
    origin: originFrom(h),
    done(outcome, fields = {}) {
      const level = outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info";
      logger[level](action, {
        request_id: requestId,
        action,
        duration_ms: Math.round(performance.now() - started),
        outcome,
        ...fields,
      });
    },
  };
}
