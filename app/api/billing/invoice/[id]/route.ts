import { NextResponse, type NextRequest } from "next/server";
import { renderInvoicePdf, type InvoiceDocument } from "@/lib/billing/invoices";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An invoice, receipt or credit note as PDF (PRD 4b.10). `invoice_document` decides who may read it (the
 * student, an organisation's admin and billing members, a university's owner, accounts staff; two-factor where
 * the portal needs it). Rendered on demand from the immutable row; nothing is stored.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/billing/invoice/[id]">) {
  const started = performance.now();
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const { id } = await ctx.params;
  const log = (outcome: "ok" | "refused" | "error", fields: Record<string, unknown> = {}) =>
    logger[outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info"]("billing.invoice_pdf", {
      request_id: requestId,
      action: "GET /api/billing/invoice",
      duration_ms: Math.round(performance.now() - started),
      outcome,
      ...fields,
    });
  if (!UUID.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log("refused", { error_code: "no_session" });
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("invoice_document", { p_id: id });
  if (error || !data) {
    log("refused", { error_code: error?.code ?? "not_found", user_id: user.id });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const doc = data as unknown as InvoiceDocument;
  try {
    const pdf = await renderInvoicePdf(doc);
    log("ok", { user_id: user.id, bytes: pdf.byteLength });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${doc.number}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    log("error", { error_code: "render_failed", user_id: user.id, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
