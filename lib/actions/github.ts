"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { authorizeUrl, githubApp, installUrl } from "@/lib/github/config";
import { startGithubState } from "@/lib/github/state";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Settings → GitHub and onboarding step 3 (PRD 5.5). Linking itself happens in
 * /api/github/callback and the github-link Edge Function; these actions only start it,
 * resync, disconnect and exclude repositories, all under the student's own session.
 */

const connectInput = z.object({ returnTo: z.enum(["onboarding", "settings"]) });

export async function startGithubConnect(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("github.connect");
  const parsed = connectInput.safeParse({ returnTo: formData.get("returnTo") });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "Refresh the page and try again.");
  }
  const app = githubApp();
  if (!app) {
    ctx.done("refused", { error_code: "not_configured" });
    return fail("not_configured", "Connecting GitHub isn't available yet. Skip this step for now.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Your session expired. Sign in again to continue.");
  }
  if (!(await rateLimit(supabase, "github_connect", user.id, 10, 3600))) {
    ctx.done("refused", { error_code: "rate_limited", user_id: user.id });
    return fail("rate_limited", "Too many attempts. Try again in an hour.");
  }

  const state = await startGithubState(user.id, parsed.data.returnTo);
  // Installed before (e.g. reconnecting after a revoke): authorise only, no install page.
  const { count } = await supabase
    .from("github_user_installations")
    .select("installation_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const flow = count ? "authorize" : "install";
  ctx.done("ok", { user_id: user.id, flow });
  redirect((flow === "authorize" ? authorizeUrl(app, state) : installUrl(app, state)) as Route);
}

export async function resyncGithub(): Promise<ActionResult> {
  const ctx = await actionContext("github.resync");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Your session expired. Sign in again to continue.");
  }
  const { data, error } = await supabase.rpc("request_github_resync");
  if (error?.code === "54000") {
    ctx.done("refused", { error_code: "rate_limited", user_id: user.id });
    return fail("rate_limited", "You can resync 5 times an hour. Try again later.");
  }
  if (error) {
    ctx.done("error", { error_code: error.code, user_id: user.id });
    return fail("unavailable", "Couldn't start a resync. Try again.", { requestId: ctx.requestId });
  }
  if (data !== true) {
    ctx.done("refused", { error_code: "not_connected", user_id: user.id });
    return fail("not_connected", "Connect GitHub first.");
  }
  ctx.done("ok", { user_id: user.id });
  revalidatePath("/settings/github");
  return ok(null);
}

export async function disconnectGithub(): Promise<ActionResult> {
  const ctx = await actionContext("github.disconnect");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Your session expired. Sign in again to continue.");
  }
  const { data, error } = await supabase.rpc("disconnect_github");
  if (error) {
    ctx.done("error", { error_code: error.code, user_id: user.id });
    return fail("unavailable", "Couldn't disconnect GitHub. Try again.", { requestId: ctx.requestId });
  }
  ctx.done(data ? "ok" : "refused", { user_id: user.id, error_code: data ? undefined : "not_connected" });
  revalidatePath("/settings/github");
  return ok(null);
}

const excludeInput = z.object({
  repoId: z.coerce.number().int().positive(),
  excluded: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function setRepoExcluded(formData: FormData): Promise<ActionResult> {
  const ctx = await actionContext("github.exclude_repo");
  const parsed = excludeInput.safeParse({ repoId: formData.get("repoId"), excluded: formData.get("excluded") });
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
    return fail("no_session", "Your session expired. Sign in again to continue.");
  }
  // Ownership: the row must be the signed-in student's own (RLS agrees).
  const { error, count } = await supabase
    .from("github_user_repos")
    .update({ excluded: parsed.data.excluded }, { count: "exact" })
    .eq("user_id", user.id)
    .eq("repo_id", parsed.data.repoId);
  if (error || count !== 1) {
    ctx.done("error", { error_code: error?.code ?? "no_row_written", user_id: user.id });
    return fail("unavailable", "Couldn't update that repository. Refresh and try again.", { requestId: ctx.requestId });
  }
  ctx.done("ok", { user_id: user.id, repo_id: parsed.data.repoId, excluded: parsed.data.excluded });
  revalidatePath("/settings/github");
  return ok(null);
}
