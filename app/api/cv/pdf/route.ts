import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { CV_TEMPLATES } from "@/lib/cv/document";
import { renderCvPdf } from "@/lib/cv/pdf";
import { siteUrl } from "@/lib/cv/site";
import type { CvSnapshotV1 } from "@/lib/cv/types";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * PDF export (PRD 5.18, Student Pro; entitlement stubbed until phase 10): prints one CV
 * version with a template, uploads it to the private cv-exports bucket as the student,
 * records its SHA-256 with a MAC only this route can make (CV_EXPORT_SECRET, also in Vault),
 * and returns a 60-second signed URL. Acts for the signed-in student; no service-role key.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  recordId: z.uuid(),
  template: z.enum(CV_TEMPLATES),
  paper: z.enum(["a4", "letter"]),
});

const REFUSED: Record<string, [number, string]> = {
  "42501": [402, "PDF export is a Student Pro feature."],
  P0002: [404, "That CV version isn't available."],
  "54000": [429, "Up to 20 PDF exports a day. Try again tomorrow."],
};

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const started = performance.now();
  const log = (outcome: "ok" | "refused" | "error", fields: Record<string, unknown> = {}) =>
    logger[outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info"]("cv.export_pdf", {
      request_id: requestId,
      action: "POST /api/cv/pdf",
      duration_ms: Math.round(performance.now() - started),
      outcome,
      ...fields,
    });
  const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    log("refused", { error_code: "invalid_input" });
    return json(400, { error: "invalid_input", message: "Choose a version, a template and a paper size." });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log("refused", { error_code: "no_session" });
    return json(401, { error: "no_session", message: "Your session expired. Sign in again to continue." });
  }
  const secret = process.env.CV_EXPORT_SECRET;
  if (!secret) {
    log("error", { error_code: "not_configured", user_id: user.id });
    return json(503, { error: "not_configured", message: "PDF export isn't set up yet." });
  }

  const { recordId, template, paper } = parsed.data;
  const { data: rights, error: rightsError } = await supabase.rpc("cv_export_rights").maybeSingle();
  if (rightsError) {
    log("error", { error_code: rightsError.code, user_id: user.id });
    return json(502, { error: "unavailable", message: "Something went wrong on our side. Try again.", requestId });
  }
  if (!rights?.pdf_export || (template !== "standard" && !rights.templates)) {
    log("refused", { error_code: "payment_required", user_id: user.id });
    return json(402, { error: "payment_required", message: template === "standard" ? REFUSED["42501"][1] : "That template is a Student Pro feature." });
  }
  if (!(await rateLimit(supabase, "cv_pdf", user.id, 5, 60))) {
    log("refused", { error_code: "rate_limited", user_id: user.id });
    return json(429, { error: "rate_limited", message: "You're exporting too often. Try again in a minute." });
  }
  // Ownership: RLS shows only the student's own records; revoked versions aren't exported.
  const { data: record, error: recordError } = await supabase
    .from("cv_records")
    .select("id, code, issued_at, snapshot, revoked_at")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (recordError || !record || record.revoked_at || !record.snapshot) {
    log("refused", { error_code: "not_found", user_id: user.id });
    return json(404, { error: "not_found", message: REFUSED.P0002[1] });
  }

  let pdf: Uint8Array;
  try {
    pdf = await renderCvPdf({
      snapshot: record.snapshot as unknown as CvSnapshotV1,
      code: record.code,
      issuedAt: record.issued_at,
      template,
      paper,
      siteUrl: siteUrl(),
    });
  } catch (error) {
    log("error", { error_code: "render_failed", user_id: user.id, error: error instanceof Error ? error.message : "unknown" });
    return json(502, { error: "unavailable", message: "We couldn't make the PDF. Try again.", requestId });
  }

  const exportId = randomUUID();
  const path = `${user.id}/${exportId}.pdf`;
  const hash = createHash("sha256").update(pdf).digest("hex");
  const upload = await supabase.storage.from("cv-exports").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upload.error) {
    log("error", { error_code: "upload_failed", user_id: user.id });
    return json(502, { error: "unavailable", message: "We couldn't save the PDF. Try again.", requestId });
  }
  const mac = createHmac("sha256", secret).update(`${exportId}|${recordId}|${template}|${paper}|${hash}|${pdf.byteLength}`).digest("hex");
  const { error: recordExportError } = await supabase.rpc("record_cv_export", {
    p_export: exportId,
    p_record: recordId,
    p_template: template,
    p_paper: paper,
    p_pdf_hash: hash,
    p_bytes: pdf.byteLength,
    p_mac: mac,
  });
  if (recordExportError) {
    const refused = REFUSED[recordExportError.code ?? ""];
    log(refused ? "refused" : "error", { error_code: recordExportError.code ?? "unknown", user_id: user.id });
    return refused
      ? json(refused[0], { error: "refused", message: refused[1] })
      : json(502, { error: "unavailable", message: "Something went wrong on our side. Try again.", requestId });
  }
  const { data: signed, error: signError } = await supabase.storage
    .from("cv-exports")
    .createSignedUrl(path, 60, { download: `skilient-cv-${record.code}.pdf` });
  if (signError || !signed) {
    log("error", { error_code: "sign_failed", user_id: user.id });
    return json(502, { error: "unavailable", message: "The PDF is saved; download it from your exports.", requestId });
  }
  log("ok", { user_id: user.id, bytes: pdf.byteLength, template, paper });
  return json(200, { url: signed.signedUrl, sha256: hash, bytes: pdf.byteLength });
}
