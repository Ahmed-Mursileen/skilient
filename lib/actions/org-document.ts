"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

const MAX = 5 * 1024 * 1024;

/**
 * An organisation admin attaches a business registration document for verification (PRD 5.26,
 * decisions 2026-10-02): a PDF up to 5 MB in the private org-documents bucket, readable only by
 * the organisation's admins and accounts staff. The file is checked here; SQL checks the path.
 */
export async function submitOrgDocument(path: string): Promise<ActionResult> {
  const ctx = await actionContext("org.document_submit");
  const parsed = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/).safeParse(path);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Upload the document again.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const { data: blob, error } = await session.supabase.storage.from("org-documents").download(parsed.data);
  const head = blob ? Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString("latin1") : "";
  if (error || !blob || blob.size > MAX || head !== "%PDF-") {
    ctx.done("refused", { error_code: "invalid_file", user_id: session.userId });
    return fail("invalid_file", "That file isn't a PDF we can accept (up to 5 MB).");
  }
  return call(ctx, session.supabase, session.userId, "submit_org_document", { p_path: parsed.data }, ["/org/settings"]);
}
