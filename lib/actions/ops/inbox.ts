"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Claiming from the ops inbox (PRD 5.26): each claimable queue keeps its own claim function
 * (role check, "someone else has it", audit row); this only picks the right one.
 */
const CLAIMS = {
  reports: { fn: "claim_case", id: "p_case", uuid: true, page: (id: string) => `/ops/reports/${id}` },
  credentials: { fn: "claim_credential", id: "p_id", uuid: true, page: (id: string) => `/ops/evidence/credentials/${id}` },
  github_flags: { fn: "claim_review_flag", id: "p_flag", uuid: false, page: (id: string) => `/ops/evidence/flags/${id}` },
  code_checks: { fn: "claim_code_check", id: "p_id", uuid: true, page: (id: string) => `/ops/evidence/code-checks/${id}` },
  ranking_flags: { fn: "claim_ranking_flag", id: "p_id", uuid: true, page: (id: string) => `/ops/evidence/ranking/${id}` },
  feedback: { fn: "claim_feedback", id: "p_id", uuid: true, page: (id: string) => `/ops/feedback/${id}` },
  appeals: { fn: "claim_appeal", id: "p_id", uuid: true, page: (id: string) => `/ops/appeals/${id}` },
} as const;

export type ClaimableQueue = keyof typeof CLAIMS;

export async function claimInboxItem(queue: string, id: string, claim: boolean): Promise<ActionResult> {
  const ctx = await actionContext("ops.inbox_claim");
  const parsed = z
    .object({ queue: z.enum(Object.keys(CLAIMS) as [ClaimableQueue, ...ClaimableQueue[]]), id: z.string().max(64), claim: z.boolean() })
    .safeParse({ queue, id, claim });
  const spec = parsed.success ? CLAIMS[parsed.data.queue] : null;
  const idOk = spec ? (spec.uuid ? z.uuid().safeParse(id).success : /^[1-9][0-9]{0,17}$/.test(id)) : false;
  if (!parsed.success || !spec || !idOk) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That item doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, spec.fn, { [spec.id]: spec.uuid ? id : Number(id), p_claim: claim }, ["/ops", spec.page(id)]);
}
