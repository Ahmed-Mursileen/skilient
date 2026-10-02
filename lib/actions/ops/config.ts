"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Platform config, plan prices and the skill dictionary (PRD 5.26). SQL checks the role (super
 * admin; trust reviewers for skills), validates against the key's JSON schema, refuses saving over
 * a newer version, and writes ops_audit_log with before and after.
 */

const reason = z.string().trim().min(3, "Give a reason.").max(500, "Keep the reason under 500 characters.");

export async function saveConfig(key: string, json: string, why: string, expectedVersion: number | null): Promise<ActionResult<number>> {
  const ctx = await actionContext("ops.config_save");
  const parsed = z
    .object({ key: z.string().regex(/^[a-z][a-z0-9_.]{1,80}$/), json: z.string().max(100_000, "That value is too large."), why: reason, expectedVersion: z.number().int().min(0).nullable() })
    .safeParse({ key, json, why, expectedVersion });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  let value: unknown;
  try {
    value = JSON.parse(parsed.data.json);
  } catch {
    ctx.done("refused", { error_code: "invalid_json" });
    return fail("invalid_input", "That isn't valid JSON.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<number>(
    ctx,
    session.supabase,
    session.userId,
    "ops_set_config",
    { p_key: key, p_value: value, p_reason: parsed.data.why, p_expected: parsed.data.expectedVersion ?? 0 },
    ["/ops/config", `/ops/config/${key}`, "/ops/audit"],
  );
}

export async function setPlanPrice(planId: string, pkr: string, usd: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.plan_price");
  const money = z
    .string()
    .trim()
    .regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Prices are numbers with up to 2 decimals.");
  const parsed = z.object({ planId: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/), pkr: money, usd: money, why: reason }).safeParse({ planId, pkr, usd, why });
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
    "ops_set_plan_price",
    {
      p_plan: planId,
      p_price_pkr: parsed.data.pkr ? Number(parsed.data.pkr) : null,
      p_price_usd: parsed.data.usd ? Number(parsed.data.usd) : null,
      p_reason: parsed.data.why,
    },
    ["/ops/config/plans", "/ops/audit"],
  );
}

export async function editSkill(input: { action: string; id: string; name: string; category: string; parent: string; reason: string }): Promise<ActionResult> {
  const ctx = await actionContext("ops.skill_edit");
  const parsed = z
    .object({
      action: z.enum(["add", "rename", "retire", "restore"]),
      id: z.string().trim().min(1, "Give the skill an id.").max(40),
      name: z.string().trim().max(60),
      category: z.string().max(20),
      parent: z.string().trim().max(40),
      reason,
    })
    .safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const d = parsed.data;
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(
    ctx,
    session.supabase,
    session.userId,
    "ops_edit_skill",
    { p_action: d.action, p_id: d.id, p_name: d.name || null, p_category: d.category || null, p_parent: d.parent || null, p_reason: d.reason },
    ["/ops/config/skills", "/ops/audit"],
  );
}
