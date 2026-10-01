import { NextResponse, type NextRequest } from "next/server";
import { launchBrowser } from "@/lib/cv/browser";
import { escapeHtml } from "@/lib/email/templates";
import { logger, requestIdFrom } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { dashboardCsv, dashboardRows } from "@/lib/uni/export";
import { DASHBOARD_AREAS } from "@/lib/uni/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/uni/export?area=&format=csv|pdf (PRD 5.23, Growth and Campus): one dashboard area's
 * aggregates. The plan, role and two-factor are checked by uni_dashboard in SQL; aggregates only,
 * never individual records (no bulk export of students).
 */
export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const area = req.nextUrl.searchParams.get("area") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  if (!DASHBOARD_AREAS.some((a) => a.key === area)) return NextResponse.json({ error: "unknown area" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const { data, error } = await supabase.rpc("uni_dashboard" as never, { p_area: area } as never);
  const d = data as Record<string, unknown> | null;
  if (error || !d || d.locked || !d.exports) {
    logger.info("uni.export", { request_id: requestId, user_id: user.id, outcome: "refused", error_code: error?.code ?? "not_entitled" });
    return NextResponse.json({ error: "Exports are part of the Growth and Campus licences." }, { status: 403 });
  }
  logger.info("uni.export", { request_id: requestId, user_id: user.id, outcome: "ok", format, area });
  if (format === "csv") {
    return new NextResponse(dashboardCsv(area, d), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="skilient-${area}.csv"`, "cache-control": "no-store" },
    });
  }
  const rows = dashboardRows(area, d).slice(1);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:11pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left}</style></head><body><h1>Skilient dashboard: ${escapeHtml(area)}</h1><p>Groups under 5 are hidden.</p><table><tr><th>Section</th><th>Label</th><th>Value</th></tr>${rows
    .map((r) => `<tr><td>${escapeHtml(String(r[1]))}</td><td>${escapeHtml(String(r[2]))}</td><td>${escapeHtml(String(r[3]))}</td></tr>`)
    .join("")}</table></body></html>`;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" } });
    return new NextResponse(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="skilient-${area}.pdf"`, "cache-control": "no-store" },
    });
  } finally {
    await browser.close();
  }
}
