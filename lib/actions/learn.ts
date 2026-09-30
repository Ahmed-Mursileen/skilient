"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";
import { pktDate } from "@/lib/format/time";
import { TIP_IDS } from "@/lib/tips";

/**
 * The learning layer's small writes (PRD 5.27): tour progress, first-visit tips and the
 * progress card's dismissals. Each is one SQL function that only touches the caller's own
 * rows and refuses unknown ids.
 */

const tour = z.enum(["student", "faculty", "recruiter", "uni_admin"]);

export async function saveTourProgress(input: { tour: string; step: number; outcome: "progress" | "completed" | "skipped" }): Promise<ActionResult> {
  const ctx = await actionContext("learn.save_tour");
  const parsed = z
    .object({ tour, step: z.number().int().min(0).max(50), outcome: z.enum(["progress", "completed", "skipped"]) })
    .safeParse(input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That tour step isn't valid.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "save_tour", {
    p_tour: parsed.data.tour,
    p_step: parsed.data.step,
    p_outcome: parsed.data.outcome,
  });
}

/** Settings → "Replay tour": forget the progress and start again on Home. */
export async function replayTour(): Promise<ActionResult> {
  const ctx = await actionContext("learn.replay_tour");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call(ctx, session.supabase, session.userId, "restart_tour", { p_tour: "student" });
  if (!result.ok) return result;
  redirect("/feed?tour=1");
}

export async function dismissTip(tipId: string): Promise<ActionResult> {
  const ctx = await actionContext("learn.dismiss_tip");
  const parsed = z.enum(TIP_IDS).safeParse(tipId);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That tip doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "see_tip", { p_tip: parsed.data });
}

/** Hide the progress card until tomorrow (Pakistan time). */
export async function dismissProgressCard(): Promise<ActionResult> {
  const ctx = await actionContext("learn.dismiss_progress_card");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "set_ui_state", {
    p_key: "progress_card_dismissed_on",
    p_value: pktDate(),
  }, ["/feed"]);
}

/** Hide the getting-started checklist for good. */
export async function dismissChecklist(): Promise<ActionResult> {
  const ctx = await actionContext("learn.dismiss_checklist");
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "set_ui_state", { p_key: "checklist_dismissed", p_value: true }, ["/feed"]);
}
