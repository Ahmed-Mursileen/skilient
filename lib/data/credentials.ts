import "server-only";

import type { CredentialStatus } from "@/lib/credentials/constants";
import { dayLabel } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/server";

/**
 * Credential reads (PRD 5.19). The owner reads their own rows (RLS); everyone else reads a
 * profile's approved, unexpired credentials through credentials_for().
 */

export interface MyCredential {
  id: string;
  title: string;
  issuer: string;
  issuedLabel: string;
  expiresLabel: string | null;
  verifyUrl: string | null;
  fileType: "pdf" | "image";
  status: CredentialStatus;
  recognised: boolean;
  reviewReason: string | null;
  submittedLabel: string;
}

export async function getMyCredentials(userId: string): Promise<MyCredential[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: issuers }] = await Promise.all([
    supabase
      .from("credentials")
      .select("id, title, issuer, issued_on, expires_on, verify_url, file_type, status, recognised_issuer_id, review_reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("recognised_issuers").select("id, name"),
  ]);
  if (error) throw new Error(`credentials: ${error.code}`);
  const names = new Map((issuers ?? []).map((i) => [i.id, i.name]));
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    issuer: (c.recognised_issuer_id && names.get(c.recognised_issuer_id)) || c.issuer,
    issuedLabel: dayLabel(c.issued_on),
    expiresLabel: c.expires_on ? dayLabel(c.expires_on) : null,
    verifyUrl: c.verify_url,
    fileType: c.file_type === "pdf" ? "pdf" : "image",
    status: c.status,
    recognised: Boolean(c.recognised_issuer_id),
    reviewReason: c.review_reason,
    submittedLabel: dayLabel(c.created_at),
  }));
}

export interface ProfileCredential {
  id: string;
  title: string;
  issuer: string;
  issuedLabel: string;
  expiresLabel: string | null;
  recognised: boolean;
  verifyUrl: string | null;
}

export async function getProfileCredentials(userId: string): Promise<ProfileCredential[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("credentials_for", { p_user: userId });
  if (error) throw new Error(`profile credentials: ${error.code}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    issuer: c.issuer,
    issuedLabel: dayLabel(c.issued_on),
    expiresLabel: c.expires_on ? dayLabel(c.expires_on) : null,
    recognised: c.recognised,
    verifyUrl: c.verify_url,
  }));
}
