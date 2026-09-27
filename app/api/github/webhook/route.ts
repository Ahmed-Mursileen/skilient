import { NextResponse, type NextRequest } from "next/server";
import { HANDLED_EVENTS, summariseWebhook, verifySignature } from "@/lib/github/webhook";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GitHub App webhooks (PRD 5.5). The signature is checked against the raw body before
 * anything else; the delivery is trimmed, stored once per delivery id (a replay is a
 * no-op) and queued for the github-worker. A webhook acts for no user, so it uses the
 * service role (CLAUDE.md allows it for webhooks).
 */
export async function POST(request: NextRequest) {
  const started = performance.now();
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const event = request.headers.get("x-github-event") ?? "";
  const delivery = request.headers.get("x-github-delivery") ?? "";
  const reply = (status: number, outcome: "ok" | "refused" | "error", fields: Record<string, unknown> = {}) => {
    logger[outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info"]("github.webhook", {
      request_id: requestId,
      action: "POST /api/github/webhook",
      duration_ms: Math.round(performance.now() - started),
      outcome,
      event,
      delivery_id: delivery,
      ...fields,
    });
    return NextResponse.json({ ok: status < 400 }, { status });
  };

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return reply(503, "error", { error_code: "not_configured" });
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-hub-signature-256"), secret)) {
    return reply(401, "refused", { error_code: "bad_signature" });
  }
  if (event === "ping") return reply(200, "ok");
  if (!HANDLED_EVENTS.has(event)) return reply(202, "ok", { ignored: true });
  if (!UUID.test(delivery)) return reply(400, "refused", { error_code: "bad_delivery_id" });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return reply(400, "refused", { error_code: "bad_json" });
  }
  const summary = summariseWebhook(event, payload);
  const action = typeof summary.action === "string" && /^[a-z_]{1,60}$/.test(summary.action) ? summary.action : null;
  const installation = (summary.installation as { id?: unknown } | null)?.id;

  const { data: recorded, error } = await createServiceClient().rpc("record_github_webhook", {
    p_delivery_id: delivery,
    p_event: event,
    p_payload: summary as never,
    p_action: action ?? undefined,
    p_installation_id: typeof installation === "number" ? installation : undefined,
  });
  if (error) return reply(500, "error", { error_code: error.code });
  return reply(202, "ok", { replay: recorded === false });
}
