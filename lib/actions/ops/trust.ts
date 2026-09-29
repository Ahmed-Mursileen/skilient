"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Trust reviewer actions (PRD 5.19, 5.26). Each SQL function re-checks the role and the
 * two-factor session, requires the item to be claimed by the caller, and writes the change
 * and its ops_audit_log row (with the reason) in one transaction.
 */

const uuid = z.uuid();
const reason = z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.");

export async function claimCredential(id: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.credential_claim");
  const parsed = z.object({ id: uuid, claim: z.boolean() }).safeParse({ id, claim });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That credential doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "claim_credential", { p_id: id, p_claim: claim }, [
    `/ops/evidence/credentials/${id}`,
    "/ops/evidence",
  ]);
}

export async function reviewCredential(id: string, approve: boolean, why: string, issuer: string | null): Promise<ActionResult> {
  const ctx = await actionContext("ops.credential_review");
  const parsed = z
    .object({ id: uuid, approve: z.boolean(), why: reason, issuer: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/).nullable() })
    .safeParse({ id, approve, why, issuer: issuer || null });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose a decision and give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "review_credential",
    { p_id: id, p_approve: approve, p_reason: parsed.data.why, p_issuer: approve ? parsed.data.issuer : null },
    [`/ops/evidence/credentials/${id}`, "/ops/evidence"],
  );
}

export async function claimReviewFlag(id: number, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.flag_claim");
  const parsed = z.object({ id: z.number().int().positive(), claim: z.boolean() }).safeParse({ id, claim });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That flag doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "claim_review_flag", { p_flag: id, p_claim: claim }, [
    `/ops/evidence/flags/${id}`,
    "/ops/evidence",
  ]);
}

export async function resolveReviewFlag(id: number, upheld: boolean, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.flag_resolve");
  const parsed = z.object({ id: z.number().int().positive(), upheld: z.boolean(), why: reason }).safeParse({ id, upheld, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose a decision and give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<boolean>(ctx, session.supabase, session.userId, "resolve_review_flag", {
    p_flag: id,
    p_upheld: upheld,
    p_note: parsed.data.why,
  }, [`/ops/evidence/flags/${id}`, "/ops/evidence"]);
  if (!result.ok) return result;
  // Write check: false means it was already resolved.
  return result.data ? { ok: true, data: null } : fail("not_now", "This flag was already resolved.");
}
