"use server";

import { z } from "zod";
import { rpcAction } from "@/lib/actions/recruit-run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * University onboarding in /ops (PRD 5.26): accounts staff on two-factor assign an owner (a
 * partner that signed with Skilient, without a claim letter) and add email domains. SQL checks the
 * role, the official account, its two-factor and the one-owner rule, and audits before/after.
 */

const uuid = z.uuid();
const reason = z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.");

const ownerSchema = z.object({ university: uuid, email: z.email("Enter the official's email.").max(320), reason });
export async function assignUniOwner(input: Record<string, unknown>): Promise<ActionResult> {
  return rpcAction({
    name: "ops.uni_owner_assign",
    schema: ownerSchema,
    input,
    fn: "ops_assign_uni_owner",
    args: (v) => ({ p_university: v.university, p_email: v.email.trim().toLowerCase(), p_reason: v.reason }),
    revalidate: ["/ops/universities", `/ops/universities/${String(input.university)}`],
  });
}

const domainSchema = z.object({
  university: uuid,
  domain: z.string().trim().toLowerCase().min(4, "Enter the domain.").max(253),
  kind: z.enum(["student", "faculty", "both"], "Choose who the domain is for."),
  reason,
});
export async function addUniDomain(input: Record<string, unknown>): Promise<ActionResult> {
  return rpcAction({
    name: "ops.uni_domain_add",
    schema: domainSchema,
    input,
    fn: "ops_add_uni_domain",
    args: (v) => ({ p_university: v.university, p_domain: v.domain, p_kind: v.kind, p_reason: v.reason }),
    revalidate: [`/ops/universities/${String(input.university)}`],
  });
}
