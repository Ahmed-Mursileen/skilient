"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { STAFF_ROLES } from "@/lib/ops/nav";

/**
 * Staff roles (PRD 5.26): super admins grant and revoke roles with a reason. SQL re-checks the
 * caller (super admin on two-factor), refuses an account without two-factor, keeps at least one
 * super admin and writes ops_audit_log with the roles before and after.
 */

const reason = z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.");

export async function grantStaffRole(email: string, role: string, why: string): Promise<ActionResult<string>> {
  const ctx = await actionContext("ops.staff_grant");
  const parsed = z
    .object({ email: z.email("Enter the account's email.").max(320), role: z.enum(STAFF_ROLES, "Choose a role."), why: reason })
    .safeParse({ email: email.trim().toLowerCase(), role, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(
    ctx,
    session.supabase,
    session.userId,
    "grant_staff_role",
    { p_email: parsed.data.email, p_role: parsed.data.role, p_reason: parsed.data.why },
    ["/ops/staff", "/ops/audit"],
  );
}

export async function revokeStaffRole(userId: string, role: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.staff_revoke");
  const parsed = z.object({ userId: z.uuid(), role: z.enum(STAFF_ROLES), why: reason }).safeParse({ userId, role, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "revoke_staff_role",
    { p_user: parsed.data.userId, p_role: parsed.data.role, p_reason: parsed.data.why },
    ["/ops/staff", "/ops/audit"],
  );
}
