import type { Route } from "next";
import { NextResponse, type NextRequest } from "next/server";
import { originFrom } from "@/lib/actions/context";
import { authorizeUrl, githubApp } from "@/lib/github/config";
import { clearGithubState, githubReturnPath, readGithubState } from "@/lib/github/state";
import { logger, requestIdFrom } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OUTCOMES = new Set(["linked", "clash", "other_account", "expired", "failed"]);

/**
 * GitHub App callback (PRD 5.5 P0). Checks `state` against the signed-in student, turns
 * the one-time code into a ticket under the student's own session, and has the
 * github-link Edge Function exchange it with GitHub. The browser never names a GitHub
 * account; this route never sees a token.
 */
export async function GET(request: NextRequest) {
  const started = performance.now();
  const requestId = requestIdFrom(request.headers) ?? newRequestId();
  const origin = originFrom(request.headers);
  const params = request.nextUrl.searchParams;
  const done = (outcome: "ok" | "refused" | "error", to: string, fields: Record<string, string | undefined> = {}) => {
    logger[outcome === "error" ? "error" : outcome === "refused" ? "warn" : "info"]("github.callback", {
      request_id: requestId,
      action: "GET /api/github/callback",
      duration_ms: Math.round(performance.now() - started),
      outcome,
      ...fields,
    });
    return NextResponse.redirect(new URL(to, origin), 303);
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return done("refused", "/signin?next=%2Fsettings%2Fgithub", { error_code: "no_session" });

  const saved = await readGithubState();
  if (!saved || saved.state !== params.get("state") || saved.userId !== user.id) {
    await clearGithubState();
    return done("refused", "/settings/github?github=state", { error_code: "state_mismatch", user_id: user.id });
  }
  const back = githubReturnPath(saved.returnTo);

  if (params.get("error")) {
    await clearGithubState();
    return done("refused", `${back}?github=denied`, { error_code: params.get("error") ?? "denied", user_id: user.id });
  }

  const code = params.get("code");
  const installationId = Number(params.get("installation_id")) || null;
  if (!code) {
    // Installed or reconfigured without authorising: ask GitHub to authorise, same state.
    const app = githubApp();
    if (installationId && app) return done("ok", authorizeUrl(app, saved.state), { step: "authorize", user_id: user.id });
    await clearGithubState();
    return done("refused", `${back}?github=failed`, { error_code: "no_code", user_id: user.id });
  }
  await clearGithubState();

  const { data: ticket, error: ticketError } = await supabase.rpc("start_github_link", {
    p_code: code,
    p_installation_id: installationId ?? undefined,
  });
  if (ticketError || !ticket) {
    const limited = ticketError?.code === "54000";
    return done(limited ? "refused" : "error", `${back}?github=${limited ? "rate_limited" : "failed"}`, {
      error_code: ticketError?.code ?? "no_ticket",
      user_id: user.id,
    });
  }

  const { data, error } = await supabase.functions.invoke<{ status: string }>("github-link", { body: { ticket } });
  const status = data?.status && OUTCOMES.has(data.status) ? data.status : "failed";
  return done(status === "linked" ? "ok" : error ? "error" : "refused", `${back}?github=${status}` as Route, {
    error_code: status === "linked" ? undefined : (error?.name ?? status),
    user_id: user.id,
  });
}
