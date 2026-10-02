"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { APPEAL_TYPES } from "@/lib/ops/appeals";

/**
 * Sanctions and appeals for staff (PRD 5.26). SQL checks every role limit (a moderator suspends for
 * at most 7 days; bans are super admin only; nobody decides an appeal on their own decision) and
 * writes ops_audit_log with before and after.
 */

const reason = z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.");
const PAGES = ["/ops", "/ops/sanctions", "/ops/audit"];

export async function sanctionUser(input: { userId: string; kind: string; days: number | null; until: string | null; reason: string; caseId: string | null }): Promise<ActionResult<string>> {
  const ctx = await actionContext("ops.sanction_user");
  const parsed = z
    .object({
      userId: z.uuid(),
      kind: z.enum(["warn", "suspend", "ban"], "Choose a sanction."),
      days: z.number().int().min(1).max(3650).nullable(),
      until: z.string().max(40).nullable(),
      reason,
      caseId: z.uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const { kind, days, until } = parsed.data;
  let end: string | null = null;
  if (kind === "suspend") {
    if (!days) return fail("invalid_input", "Choose how long the suspension lasts.");
    end = new Date(Date.now() + days * 86_400_000 - 60_000).toISOString();
  } else if (kind === "ban" && until) {
    const t = Date.parse(`${until}T23:59:00+05:00`);
    if (Number.isNaN(t)) return fail("invalid_input", "Choose a valid end date, or leave it empty for a permanent ban.");
    end = new Date(t).toISOString();
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(
    ctx,
    session.supabase,
    session.userId,
    "sanction_user",
    { p_user: parsed.data.userId, p_kind: kind, p_until: end, p_reason: parsed.data.reason, p_case: parsed.data.caseId },
    [...PAGES, ...(parsed.data.caseId ? [`/ops/reports/${parsed.data.caseId}`] : [])],
  );
}

export async function sanctionOrg(input: { orgId: string; kind: string; days: number | null; perDay: number | null; reason: string }): Promise<ActionResult<string>> {
  const ctx = await actionContext("ops.sanction_org");
  const parsed = z
    .object({
      orgId: z.uuid(),
      kind: z.enum(["warn", "throttle", "suspend"], "Choose a sanction."),
      days: z.number().int().min(1).max(90).nullable(),
      perDay: z.number().int().min(1).max(50).nullable(),
      reason,
    })
    .safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const { kind, days, perDay } = parsed.data;
  if (kind === "throttle" && (!days || !perDay)) return fail("invalid_input", "Choose a daily limit and how long it lasts.");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<string>(
    ctx,
    session.supabase,
    session.userId,
    "sanction_org",
    {
      p_org: parsed.data.orgId,
      p_kind: kind,
      p_until: kind === "throttle" && days ? new Date(Date.now() + days * 86_400_000 - 60_000).toISOString() : null,
      p_per_day: kind === "throttle" ? perDay : null,
      p_reason: parsed.data.reason,
    },
    [...PAGES, `/ops/orgs/${parsed.data.orgId}`],
  );
}

export async function liftSanction(id: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.sanction_lift");
  const parsed = z.object({ id: z.uuid(), why: reason }).safeParse({ id, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "lift_sanction", { p_id: id, p_reason: parsed.data.why }, PAGES);
}

export async function claimAppeal(id: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.appeal_claim");
  const parsed = z.object({ id: z.uuid(), claim: z.boolean() }).safeParse({ id, claim });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That appeal doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "claim_appeal", { p_id: id, p_claim: claim }, ["/ops", "/ops/appeals", `/ops/appeals/${id}`]);
}

export async function decideAppeal(id: string, outcome: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.appeal_decide");
  const parsed = z.object({ id: z.uuid(), outcome: z.enum(["upheld", "overturned"], "Choose an outcome."), why: reason }).safeParse({ id, outcome, why });
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
    "decide_appeal",
    { p_id: id, p_outcome: parsed.data.outcome, p_reason: parsed.data.why },
    ["/ops", "/ops/appeals", `/ops/appeals/${id}`, "/ops/sanctions", "/appeals"],
  );
}

/** A banned account can't sign in; staff file its emailed appeal. */
export async function fileAppealForUser(input: { type: string; decisionId: string; body: string; reason: string }): Promise<ActionResult<string>> {
  const ctx = await actionContext("ops.appeal_file");
  const parsed = z
    .object({
      type: z.enum(APPEAL_TYPES, "Choose what kind of decision it is."),
      decisionId: z.uuid("Paste the decision's id."),
      body: z.string().trim().min(10, "Copy in what they wrote (at least 10 characters).").max(2000),
      reason,
    })
    .safeParse(input);
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
    "ops_file_appeal",
    { p_type: parsed.data.type, p_id: parsed.data.decisionId, p_body: parsed.data.body, p_reason: parsed.data.reason },
    ["/ops", "/ops/appeals"],
  );
}
