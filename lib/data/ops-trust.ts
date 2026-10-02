import "server-only";

import { cache } from "react";
import { CREDENTIAL_BUCKET, type CredentialStatus } from "@/lib/credentials/constants";
import { ageLabel, dayLabel } from "@/lib/format/time";
import type { StaffRole } from "@/lib/ops/nav";
import { createClient } from "@/lib/supabase/server";

/**
 * /ops trust reads (PRD 5.19, 5.26): credentials and GitHub review flags. Every read goes
 * through a SQL function that refuses anyone but a trust reviewer on a two-factor session.
 */

export type { StaffRole };

/** The staff roles that count right now (two-factor on); super_admin implies every role. */
export const staffRoles = cache(async (): Promise<Set<StaffRole>> => {
  const supabase = await createClient();
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (isStaff !== true) return new Set();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase.from("staff_roles").select("role").eq("user_id", user.id);
  const roles = new Set((data ?? []).map((r) => r.role as StaffRole));
  if (roles.has("super_admin")) return new Set<StaffRole>(["moderator", "trust_reviewer", "accounts", "super_admin"]);
  return roles;
});

export interface CredentialQueueRow {
  id: string;
  student: string;
  username: string | null;
  university: string | null;
  title: string;
  issuer: string;
  suggestedIssuer: string | null;
  fileType: "pdf" | "image";
  status: CredentialStatus;
  claimedBy: string | null;
  claimedByMe: boolean;
  age: string;
  reviewedLabel: string | null;
}

export async function getCredentialQueue(status: "pending" | "reviewed"): Promise<CredentialQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("credential_queue", { p_status: status });
  if (error) throw new Error(`credential_queue: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    student: r.student_name,
    username: r.student_username,
    university: r.university_name,
    title: r.title,
    issuer: r.issuer,
    suggestedIssuer: r.suggested_issuer,
    fileType: r.file_type === "pdf" ? "pdf" : "image",
    status: r.status,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me ?? false,
    age: ageLabel(r.created_at),
    reviewedLabel: r.reviewed_at ? dayLabel(r.reviewed_at) : null,
  }));
}

export interface CredentialCase {
  id: string;
  student: string;
  username: string | null;
  university: string | null;
  title: string;
  issuer: string;
  issuedLabel: string;
  expiresLabel: string | null;
  verifyUrl: string | null;
  fileType: "pdf" | "image";
  fileKb: number;
  /** A 60-second signed URL, made with the reviewer's own session (storage RLS applies). */
  fileUrl: string | null;
  status: CredentialStatus;
  suggestedIssuer: string | null;
  recognisedIssuer: string | null;
  claimedBy: string | null;
  claimedByMe: boolean;
  reviewer: string | null;
  reviewReason: string | null;
  age: string;
  issuers: { id: string; name: string }[];
}

export async function getCredentialCase(id: string): Promise<CredentialCase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("credential_case", { p_id: id });
  if (error) throw new Error(`credential_case: ${error.code}`);
  const c = data?.[0];
  if (!c) return null;
  const [signed, issuers] = await Promise.all([
    c.file_deleted ? Promise.resolve({ data: null }) : supabase.storage.from(CREDENTIAL_BUCKET).createSignedUrl(c.file_path, 60),
    supabase.from("recognised_issuers").select("id, name").is("retired_at", null).order("name"),
  ]);
  return {
    id: c.id,
    student: c.student_name,
    username: c.student_username,
    university: c.university_name,
    title: c.title,
    issuer: c.issuer,
    issuedLabel: dayLabel(c.issued_on),
    expiresLabel: c.expires_on ? dayLabel(c.expires_on) : null,
    verifyUrl: c.verify_url,
    fileType: c.file_type === "pdf" ? "pdf" : "image",
    fileKb: Math.max(1, Math.round(c.file_bytes / 1024)),
    fileUrl: signed.data?.signedUrl ?? null,
    status: c.status,
    suggestedIssuer: c.suggested_issuer,
    recognisedIssuer: c.recognised_issuer_id,
    claimedBy: c.claimed_by_name,
    claimedByMe: c.claimed_by_me ?? false,
    reviewer: c.reviewer_name,
    reviewReason: c.review_reason,
    age: ageLabel(c.created_at),
    issuers: issuers.data ?? [],
  };
}

export interface FlagQueueRow {
  id: number;
  student: string;
  username: string | null;
  kind: string;
  commits: number;
  claimedBy: string | null;
  claimedByMe: boolean;
  age: string;
}

export async function getFlagQueue(): Promise<FlagQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_flag_queue");
  if (error) throw new Error(`review_flag_queue: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    student: r.student_name,
    username: r.student_username,
    kind: r.kind,
    commits: r.commits,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me ?? false,
    age: ageLabel(r.created_at),
  }));
}

export interface FlagCase {
  id: number;
  student: string;
  kind: string;
  key: string;
  status: string;
  claimedBy: string | null;
  claimedByMe: boolean;
  age: string;
  commits: { repo: string; sha: string; lines: number; dateLabel: string; status: string }[];
}

export async function getFlagCase(id: number): Promise<FlagCase | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_flag_case", { p_flag: id });
  if (error) throw new Error(`review_flag_case: ${error.code}`);
  const f = data?.[0];
  if (!f) return null;
  return {
    id: f.id,
    student: f.student_name,
    kind: f.kind,
    key: f.key,
    status: f.status,
    claimedBy: f.claimed_by_name,
    claimedByMe: f.claimed_by_me ?? false,
    age: ageLabel(f.created_at),
    commits: ((f.commits ?? []) as { repo: string; sha: string; lines: number; occurred_at: string; status: string }[]).map((c) => ({
      repo: c.repo,
      sha: c.sha,
      lines: c.lines,
      dateLabel: dayLabel(c.occurred_at),
      status: c.status,
    })),
  };
}

export interface StorageUse {
  bucket: string;
  objects: number;
  bytes: number;
}

/** Storage used per bucket against the Free plan's quota (decisions.md 2026-09-30). */
export async function getStorageUsage(): Promise<{ buckets: StorageUse[]; total: number; quota: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storage_usage");
  if (error || !data) return null;
  const buckets = data.map((b) => ({ bucket: b.bucket, objects: Number(b.objects), bytes: Number(b.bytes) }));
  return { buckets, total: buckets.reduce((s, b) => s + b.bytes, 0), quota: Number(data[0]?.quota_bytes ?? 1_073_741_824) };
}
