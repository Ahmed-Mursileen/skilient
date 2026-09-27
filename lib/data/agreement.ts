import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

export interface Agreement {
  version: number;
  title: string;
  body: string;
  summary: string;
}

/** The current published agreement (highest published version), or null if none is published. */
export async function getCurrentAgreement(): Promise<Agreement | null> {
  const { data, error } = await createPublicClient()
    .from("agreement_versions")
    .select("version, title, body_md, summary_md")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`agreement_versions: ${error.message}`);
  return data ? { version: data.version, title: data.title, body: data.body_md, summary: data.summary_md } : null;
}
