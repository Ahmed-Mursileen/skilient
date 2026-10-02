import "server-only";

import type { Supabase } from "@/lib/actions/rpc";
import { createClient } from "@/lib/supabase/server";
import { isPaymentRequiredCode, PaymentRequiredError } from "./errors";
import type { SubjectKind } from "./constants";

/**
 * The entitlement registry from the app (PRD 4b.1, 4b.4). Every check runs in Postgres
 * (`private.require_entitlement`, `private.effective_entitlements`); the app never decides access.
 * Metered keys are spent inside the SQL function that does the paid write (`consume_quota` in the same
 * transaction), so a failed write never spends a credit and there is no separate release call to forget.
 */

export interface Entitlements {
  subject_type: SubjectKind;
  subject_id: string;
  values: Record<string, unknown>;
  quotas: Record<string, { limit: number; used: number; extras: number; remaining: number; period_start: string } | null>;
}

/** The caller's entitlements, for showing or hiding controls only. */
export async function getEntitlements(subject: SubjectKind = "user", supabase?: Supabase): Promise<Entitlements | null> {
  const client = supabase ?? (await createClient());
  const { data, error } = await client.rpc("my_entitlements", { p_subject: subject });
  if (error) return null;
  return data as unknown as Entitlements;
}

/** Throws PaymentRequiredError unless the caller's subject holds the key (or has some of a metered key left). */
export async function requireEntitlement(key: string, supabase?: Supabase): Promise<void> {
  const client = supabase ?? (await createClient());
  const { error } = await client.rpc("require_entitlement", { p_key: key });
  if (!error) return;
  if (isPaymentRequiredCode(error.code)) throw new PaymentRequiredError(key, error.message);
  throw Object.assign(new Error(error.message), { code: error.code });
}
