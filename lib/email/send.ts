import "server-only";

import { logger } from "@/lib/log";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transactional email through Resend's HTTP API (PRD 7). Supabase Auth sends its own
 * emails (codes, resets) through Resend SMTP; this is for the app's security notices.
 * Without RESEND_API_KEY / EMAIL_FROM it logs and skips, so local runs don't fail.
 */
export async function sendEmail(email: Email, requestId?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    logger.warn("email.skipped", { request_id: requestId, action: "email.send", outcome: "ok", error_code: "not_configured" });
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    logger.info("email.sent", { request_id: requestId, action: "email.send", outcome: "ok" });
    return true;
  } catch (err) {
    logger.error("email.failed", {
      request_id: requestId,
      action: "email.send",
      outcome: "error",
      error_code: err instanceof Error ? err.message.slice(0, 60) : "unknown",
    });
    return false;
  }
}
