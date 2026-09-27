"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { homeFor, safeNext, type GateState } from "@/lib/auth/gate";
import { createClient } from "@/lib/supabase/server";

/** Accept the current agreement version (PRD 5.27 re-accept gate, and first accept after Google). */
export async function acceptAgreement(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("agreement.accept");
  const parsed = z
    .object({ version: z.coerce.number().int().positive(), next: z.string().max(512).optional() })
    .safeParse({ version: formData.get("version"), next: formData.get("next") ?? undefined });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Sign in again to continue.");
  }

  // RLS allows only your own row for the current published version; count confirms the write.
  const { error, count } = await supabase
    .from("agreement_acceptances")
    .insert({ user_id: user.id, version: parsed.data.version, ip_hash: ctx.ipHash }, { count: "exact" });
  if (error && error.code !== "23505") {
    ctx.done("refused", { error_code: error.code ?? "insert_failed", user_id: user.id });
    return fail("stale_version", "A newer version was just published. Refresh the page to read it.");
  }
  if (!error && count !== 1) {
    ctx.done("error", { error_code: "no_row_written", user_id: user.id });
    return fail("unavailable", "Couldn't save your acceptance. Try again.", { requestId: ctx.requestId });
  }

  const { data: state } = await supabase.rpc("my_gate_state");
  const home = state ? homeFor(state as unknown as GateState) : "/feed";
  const next = safeNext(parsed.data.next);
  ctx.done("ok", { user_id: user.id });
  redirect((home === "/feed" && next ? next : home) as Route);
}
