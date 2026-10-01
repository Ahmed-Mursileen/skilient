"use server";

import { z } from "zod";
import { rpcAction } from "@/lib/actions/recruit-run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * /ops for the recruiter side (PRD 5.20, 5.26): organisation verification, competition brief review
 * and the spam review. Accounts staff on a two-factor session only; every SQL function re-checks that
 * and writes its ops_audit_log row.
 */

const uuid = z.uuid();
const reason = z.string().trim().max(2000, "Keep the reason under 2,000 characters.");

export async function decideOrg(id: string, action: "verify" | "reject" | "suspend" | "reinstate", why: string): Promise<ActionResult> {
  return rpcAction({
    name: "ops.decide_org",
    schema: z.object({
      id: uuid,
      action: z.enum(["verify", "reject", "suspend", "reinstate"]),
      why: reason.refine((r) => !["reject", "suspend"].includes(action) || r.length >= 3, "Give a reason the organisation can read."),
    }),
    input: { id, action, why },
    fn: "decide_org",
    args: (v) => ({ p_org: v.id, p_action: v.action, p_reason: v.why || null }),
    revalidate: ["/ops/orgs", `/ops/orgs/${id}`],
  });
}

export async function reviewCompetition(id: string, approve: boolean, why: string): Promise<ActionResult> {
  return rpcAction({
    name: "ops.review_competition",
    schema: z.object({ id: uuid, approve: z.boolean(), why: reason.refine((r) => approve || r.length >= 3, "Tell the organisation why.") }),
    input: { id, approve, why },
    fn: "ops_review_competition",
    args: (v) => ({ p_id: v.id, p_approve: v.approve, p_reason: v.why || null }),
    revalidate: ["/ops/orgs/competitions"],
  });
}

export async function resolveSpamReview(id: string, action: "clear" | "suspend", why: string): Promise<ActionResult> {
  return rpcAction({
    name: "ops.resolve_spam_review",
    schema: z.object({ id: uuid, action: z.enum(["clear", "suspend"]), why: reason.min(3, "Give a reason.") }),
    input: { id, action, why },
    fn: "ops_resolve_spam_review",
    args: (v) => ({ p_id: v.id, p_action: v.action, p_reason: v.why }),
    revalidate: ["/ops/orgs", "/ops/orgs/spam"],
  });
}
