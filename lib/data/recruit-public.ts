import "server-only";

import { createHash } from "node:crypto";
import { createPublicClient } from "@/lib/supabase/public";

export const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export interface InvitePreview {
  orgName: string;
  email: string;
  role: string;
}

/** What the link in an invite email says (the token is hashed here; only the hash is ever stored). */
export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await createPublicClient().rpc("org_invite_preview", { p_token_hash: sha256Hex(token) });
  const row = data as { org_name: string; email: string; role: string } | null;
  return row ? { orgName: row.org_name, email: row.email, role: row.role } : null;
}
