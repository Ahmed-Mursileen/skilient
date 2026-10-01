import { NextResponse, type NextRequest } from "next/server";
import { gateways } from "@/lib/billing/gateways";
import { recordWithServiceRole } from "@/lib/billing/record";
import { handleBillingWebhook } from "@/lib/billing/webhook";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";

export const dynamic = "force-dynamic";

/**
 * Billing webhooks (PRD 4b.12): /api/billing/webhook/simulated | safepay | paddle. Verify the signature
 * (and a timestamp within 5 minutes) on the raw body, store each event once (gateway + event id unique) and
 * queue it — nothing else. A webhook acts for no user, so storing uses the service role (lib/billing/record.ts).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/billing/webhook/[gateway]">) {
  const started = performance.now();
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const { gateway } = await ctx.params;
  const rawBody = await request.text();
  if (rawBody.length > 256 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  const result = await handleBillingWebhook({ gateway, rawBody, headers: request.headers, gateways: gateways(), record: recordWithServiceRole });
  logger[result.outcome === "error" ? "error" : result.outcome === "refused" ? "warn" : "info"]("billing.webhook", {
    request_id: requestId,
    action: "POST /api/billing/webhook",
    duration_ms: Math.round(performance.now() - started),
    outcome: result.outcome,
    gateway,
    error_code: result.errorCode,
    stored: result.stored,
    duplicates: result.duplicates,
  });
  return NextResponse.json({ ok: result.status === 200 }, { status: result.status });
}
