import "server-only";

import { isRefusal, rpcJson } from "@/lib/data/rpc-json";
import { createClient } from "@/lib/supabase/server";

/** University onboarding reads for /ops (PRD 5.26); accounts staff on two-factor, checked in SQL. */

export interface UniListRow {
  id: string;
  name: string;
  city: string | null;
  slug: string | null;
  onboarded: boolean;
  owner_name: string | null;
  plan: string | null;
  admins: number;
  students: number;
}

export const getUniList = (q: string) => rpcJson<UniListRow[]>("ops_uni_list", { p_query: q || null });

export interface UniRecord {
  id: string;
  name: string;
  city: string | null;
  slug: string | null;
  final_year_batch: number | null;
  claimed_at: string | null;
  plan: string | null;
  owner: { user_id: string; name: string } | null;
  domains: { domain: string; kind: string; source: string }[];
  admins: { user_id: string; name: string | null; email: string; role: string; department: string | null; since: string }[];
  invites: number;
  ecosphere: { modules: Record<string, boolean>; branding: Record<string, unknown>; welcome: string | null; updated_at: string } | null;
  exam_periods: { starts_on: string; ends_on: string; reason: string }[];
  invoices: { id: string; number: string; total: number; currency: string; status: string; issued_at: string }[];
  students: number;
  claims: { id: string; status: string; created_at: string }[];
}

export async function getUniRecord(id: string): Promise<UniRecord | null> {
  try {
    return await rpcJson<UniRecord>("ops_uni_record", { p_id: id });
  } catch (err) {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  }
}

/** Whether students and faculty can sign up at a university now (universities.live_at, phase 12). */
export async function getUniSignup(id: string): Promise<{ liveAt: string | null; live: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.from("universities").select("live_at").eq("id", id).maybeSingle();
  const liveAt = data?.live_at ?? null;
  return { liveAt, live: liveAt !== null && Date.parse(liveAt) <= Date.now() };
}
