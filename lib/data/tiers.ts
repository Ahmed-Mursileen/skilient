import "server-only";

import { TIERS, type Tier } from "@/components/ui/tier-badge";
import { createClient } from "@/lib/supabase/server";

/**
 * Tier badges for a page of people (PRD 5.17): one call for every card on the page. Only
 * ranked students have a tier; people blocked with the reader get none. Tiers come from the
 * last nightly run, so they don't move while someone scrolls.
 */
export async function getTiers(userIds: (string | null | undefined)[]): Promise<Map<string, Tier>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))].slice(0, 200);
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tiers_for", { p_users: ids });
  if (error) throw new Error(`tiers_for failed: ${error.code}`);
  const tiers = new Map<string, Tier>();
  for (const row of data ?? []) {
    if (row.tier && (TIERS as readonly string[]).includes(row.tier)) tiers.set(row.user_id, row.tier as Tier);
  }
  return tiers;
}
