"use server";

import { z } from "zod";
import { rpcAction } from "@/lib/actions/recruit-run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * University sales leads in /ops/leads (PRD 5.1): accounts staff claim a lead by acting on it,
 * move its status and leave a note. SQL checks the role and the claim and audits before/after.
 */
const schema = z.object({
  lead: z.uuid(),
  status: z.enum(["new", "contacted", "won", "lost"], "Choose a status."),
  note: z.string().trim().max(2000, "Keep the note under 2,000 characters.").optional(),
});

export async function updateSalesLead(input: Record<string, unknown>): Promise<ActionResult> {
  return rpcAction({
    name: "ops.lead_update",
    schema,
    input,
    fn: "ops_update_sales_lead",
    args: (v) => ({ p_id: v.lead, p_status: v.status, p_note: v.note ?? "" }),
    revalidate: ["/ops/leads"],
  });
}
