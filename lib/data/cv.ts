import "server-only";

import { headers } from "next/headers";
import type { CvTemplate } from "@/lib/cv/document";
import { verifyStatus, type VerifyStatus } from "@/lib/cv/status";
import type { CvSection, CvSnapshotV1, CvTier } from "@/lib/cv/types";
import { dayLabel } from "@/lib/format/time";
import { logger, requestIdFrom } from "@/lib/log";
import { keyedHash, sha256Hex } from "@/lib/security/hash";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp, userAgent } from "@/lib/security/request-meta";
import { createClient } from "@/lib/supabase/server";
import { checkEnvelope, envelopeOf, normaliseCode } from "@/supabase/functions/_shared/cv/sign.ts";

/**
 * Verified CV reads (PRD 5.18): the owner's CV page, a share link, and the public verify
 * lookup. Records are signed by the cv-sign Edge Function; the first one is issued here, with
 * the student's own session, the first time they open /me/cv.
 */

export interface CvVersion {
  id: string;
  code: string;
  version: number;
  issuedAt: string;
  issuedLabel: string;
  revokedLabel: string | null;
  revokedReason: string | null;
  superseded: boolean;
  source: string;
}

export interface CvShareLink {
  id: string;
  label: string | null;
  expiresLabel: string | null;
  expired: boolean;
  revoked: boolean;
  viewCount: number;
  createdLabel: string;
}

export interface CvExport {
  id: string;
  code: string;
  template: CvTemplate;
  paper: "a4" | "letter";
  createdLabel: string;
  fileDeleted: boolean;
}

export type MyCv =
  | { state: "not_eligible" }
  | { state: "unavailable" }
  | {
      state: "ok";
      latest: CvVersion & { snapshot: CvSnapshotV1 | null; revoked: boolean };
      versions: CvVersion[];
      settings: { sections: CvSection[]; showPercentile: boolean; showEmail: boolean; visibility: "private" | "link" | "recruiters" };
      links: CvShareLink[];
      views: { last30: number; total: number };
      exports: CvExport[];
      tier: CvTier | null;
      canShare: boolean;
      rights: { pdfExport: boolean; templates: boolean; refreshOnDemand: boolean };
      nextRefreshLabel: string;
      username: string;
    };

const SPARK_UP: CvTier[] = ["spark", "flare", "shine", "radiant", "luminary"];
const ALL_SECTIONS: CvSection[] = ["summary", "skills", "projects", "open_source", "endorsements", "credentials", "education"];

/** 00:30 PKT on the 1st of next month, as "1 November". */
export function nextRefreshLabel(now = new Date()): string {
  const pkt = new Date(now.getTime() + 5 * 3600_000);
  const next = new Date(Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(next);
}

interface RecordRow {
  id: string;
  code: string;
  version: number;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  superseded_by: string | null;
  source: string;
  snapshot: unknown;
}

function version(r: RecordRow): CvVersion {
  return {
    id: r.id,
    code: r.code,
    version: r.version,
    issuedAt: r.issued_at,
    issuedLabel: dayLabel(r.issued_at),
    revokedLabel: r.revoked_at ? dayLabel(r.revoked_at) : null,
    revokedReason: r.revoked_reason,
    superseded: r.superseded_by !== null,
    source: r.source,
  };
}

export async function getMyCv(): Promise<MyCv> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "not_eligible" };

  const readRecords = () =>
    supabase
      .from("cv_records")
      .select("id, code, version, issued_at, revoked_at, revoked_reason, superseded_by, source, snapshot")
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .limit(24);
  let { data: records, error } = await readRecords();
  if (error) throw new Error(`cv records: ${error.code}`);
  if (!records?.length) {
    // First visit: the Edge Function issues the student's first CV (decisions.md 2026-10-01).
    const { error: invokeError } = await supabase.functions.invoke("cv-sign", { body: { action: "ensure" } });
    if (invokeError) {
      const status = (invokeError as { context?: { status?: number } }).context?.status;
      const h = await headers();
      logger.warn("cv.ensure", { request_id: requestIdFrom(h), action: "cv.ensure", outcome: "refused", error_code: String(status ?? "unknown") });
      return status === 403 ? { state: "not_eligible" } : { state: "unavailable" };
    }
    ({ data: records, error } = await readRecords());
    if (error) throw new Error(`cv records: ${error.code}`);
    if (!records?.length) return { state: "unavailable" };
  }

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [settings, links, total, last30, exports, score, rights, profile] = await Promise.all([
    supabase.from("cv_settings").select("sections, show_percentile, show_email, visibility").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("cv_share_links")
      .select("id, label, expires_at, revoked_at, view_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("cv_views").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("cv_views").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("viewed_at", since),
    supabase
      .from("cv_pdf_exports")
      .select("id, record_id, template, paper, created_at, file_deleted_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("ranking_scores").select("tier").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("cv_export_rights").maybeSingle(),
    supabase.from("profiles").select("username, leaderboard_opt_out").eq("user_id", user.id).single(),
  ]);
  for (const r of [settings, links, total, last30, exports, score, rights, profile]) {
    if (r.error) throw new Error(`cv page: ${r.error.code}`);
  }

  const rows = records as RecordRow[];
  const newest = rows[0];
  const codeOf = new Map(rows.map((r) => [r.id, r.code]));
  const now = Date.now();
  const tier = (score.data?.tier ?? null) as CvTier | null;
  return {
    state: "ok",
    latest: { ...version(newest), snapshot: (newest.snapshot as CvSnapshotV1 | null) ?? null, revoked: newest.revoked_at !== null },
    versions: rows.map(version),
    settings: {
      sections: (settings.data?.sections as CvSection[] | undefined) ?? ALL_SECTIONS,
      showPercentile: settings.data?.show_percentile ?? !profile.data?.leaderboard_opt_out,
      showEmail: settings.data?.show_email ?? false,
      visibility: settings.data?.visibility ?? "link",
    },
    links: (links.data ?? []).map((l) => ({
      id: l.id,
      label: l.label,
      expiresLabel: l.expires_at ? dayLabel(l.expires_at) : null,
      expired: l.expires_at !== null && new Date(l.expires_at).getTime() <= now,
      revoked: l.revoked_at !== null,
      viewCount: l.view_count,
      createdLabel: dayLabel(l.created_at),
    })),
    views: { last30: last30.count ?? 0, total: total.count ?? 0 },
    exports: (exports.data ?? []).map((e) => ({
      id: e.id,
      code: codeOf.get(e.record_id) ?? "",
      template: e.template as CvTemplate,
      paper: e.paper as "a4" | "letter",
      createdLabel: dayLabel(e.created_at),
      fileDeleted: e.file_deleted_at !== null,
    })),
    tier,
    canShare: tier !== null && SPARK_UP.includes(tier),
    rights: {
      pdfExport: rights.data?.pdf_export ?? false,
      templates: rights.data?.templates ?? false,
      refreshOnDemand: rights.data?.refresh_on_demand ?? false,
    },
    nextRefreshLabel: nextRefreshLabel(),
    username: profile.data?.username ?? "",
  };
}

// ---------------------------------------------------------------------------------------
// Share links (anyone with the link)
// ---------------------------------------------------------------------------------------

export type SharedCv =
  | { state: "invalid" }
  | { state: "unavailable" }
  | { state: "ok"; username: string; code: string; issuedAt: string; snapshot: CvSnapshotV1 };

export async function getSharedCv(token: string): Promise<SharedCv> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: "invalid" };
  const h = await headers();
  const supabase = await createClient();
  // One view per viewer per link per day, keyed without storing the IP.
  const viewerKey = keyedHash(`cv-view:${clientIp(h) ?? "unknown"}|${userAgent(h)}`);
  const { data, error } = await supabase.rpc("open_shared_cv", { p_token_hash: sha256Hex(token), p_viewer_key: viewerKey }).maybeSingle();
  if (error) throw new Error(`shared cv: ${error.code}`);
  if (!data || data.state === "invalid") return { state: "invalid" };
  if (data.state !== "ok" || !data.snapshot || !data.code || !data.issued_at) return { state: "unavailable" };
  return { state: "ok", username: data.username ?? "", code: data.code, issuedAt: data.issued_at, snapshot: data.snapshot as unknown as CvSnapshotV1 };
}

// ---------------------------------------------------------------------------------------
// Verify (anyone)
// ---------------------------------------------------------------------------------------

export type VerifyResult =
  | { status: "rate_limited" }
  | { status: "not_found"; code: string | null }
  | { status: "revoked"; code: string; issuedLabel: string; revokedLabel: string }
  | {
      status: Exclude<VerifyStatus, "not_found" | "revoked">;
      code: string;
      issuedAt: string;
      issuedLabel: string;
      expiresLabel: string;
      supersededLabel: string | null;
      keyId: string;
      pdfChecked: boolean;
      pdfMatches: boolean | null;
      signatureValid: boolean;
      snapshot: CvSnapshotV1;
    };

export async function verifyCode(rawCode: string, pdfHash: string | null): Promise<VerifyResult> {
  const code = normaliseCode(rawCode);
  const h = await headers();
  const supabase = await createClient();
  // PRD 5.18: 30 lookups a minute per IP, counted in rate_limit_events.
  if (!(await rateLimit(supabase, "cv_verify", clientIp(h) ?? "unknown", 30, 60))) return { status: "rate_limited" };
  if (!code) return { status: "not_found", code: null };
  const hash = pdfHash && /^[0-9a-f]{64}$/.test(pdfHash) ? pdfHash : null;
  const { data, error } = await supabase.rpc("verify_cv", { p_code: code, p_pdf_hash: hash ?? undefined }).maybeSingle();
  if (error) throw new Error(`verify: ${error.code}`);
  if (!data) return { status: "not_found", code };
  if (data.revoked_at) {
    return { status: "revoked", code: data.code, issuedLabel: dayLabel(data.issued_at), revokedLabel: dayLabel(data.revoked_at) };
  }
  const snapshot = data.snapshot as unknown as CvSnapshotV1;
  const signatureValid =
    !!data.snapshot && !!data.key_id && !!data.public_key && !!data.snapshot_hash && !!data.signature && !!data.expires_at &&
    (await checkEnvelope(
      envelopeOf({ code: data.code, key_id: data.key_id, issued_at: data.issued_at, expires_at: data.expires_at, snapshot: data.snapshot as Record<string, unknown> }),
      data.snapshot_hash,
      data.signature,
      data.public_key,
    )) === "valid";
  if (!signatureValid) {
    logger.error("cv.verify", { request_id: requestIdFrom(h), action: "cv.verify", outcome: "error", error_code: "signature_mismatch" });
  }
  const status = verifyStatus({
    found: true,
    revoked: false,
    signatureValid,
    pdfMismatch: data.pdf_checked === true && data.pdf_matches === false,
    superseded: data.superseded_at !== null,
    expired: !!data.expires_at && new Date(data.expires_at).getTime() < Date.now(),
  }) as Exclude<VerifyStatus, "not_found" | "revoked">;
  return {
    status,
    code: data.code,
    issuedAt: data.issued_at,
    issuedLabel: dayLabel(data.issued_at),
    expiresLabel: data.expires_at ? dayLabel(data.expires_at) : "",
    supersededLabel: data.superseded_at ? dayLabel(data.superseded_at) : null,
    keyId: data.key_id ?? "",
    pdfChecked: data.pdf_checked === true,
    pdfMatches: data.pdf_matches,
    signatureValid,
    snapshot,
  };
}

// ---------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------

export interface OpsCvRow {
  id: string;
  username: string | null;
  fullName: string | null;
  code: string;
  version: number;
  issuedLabel: string;
  revokedLabel: string | null;
  revokedReason: string | null;
  superseded: boolean;
}

export async function getOpsCvRecords(query: string): Promise<OpsCvRow[]> {
  if (query.trim().length < 3) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ops_cv_records", { p_query: query });
  if (error) throw new Error(`ops cv: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    code: r.code,
    version: r.version,
    issuedLabel: dayLabel(r.issued_at),
    revokedLabel: r.revoked_at ? dayLabel(r.revoked_at) : null,
    revokedReason: r.revoked_reason,
    superseded: r.superseded,
  }));
}

/** Views of the signed-in student's CV in the last 30 days (counts only; names are a Pro feature). */
export async function getCvViewsLast30Days(userId: string): Promise<number> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count } = await supabase.from("cv_views").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("viewed_at", since);
  return count ?? 0;
}
