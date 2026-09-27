import { runHealthChecks, supabaseChecks } from "@/lib/health";
import { logger, requestIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Uptime probe (PRD 10): database, Storage and Realtime → 200 or 503. */
export async function GET(request: Request) {
  const started = performance.now();
  const report = await runHealthChecks(supabaseChecks());
  const status = report.ok ? 200 : 503;

  logger[report.ok ? "info" : "error"]("health", {
    request_id: requestIdFrom(request.headers),
    action: "GET /api/health",
    duration_ms: Math.round(performance.now() - started),
    outcome: report.ok ? "ok" : "error",
    error_code: report.ok
      ? undefined
      : Object.entries(report.checks)
          .filter(([, c]) => !c.ok)
          .map(([n]) => n)
          .join(","),
  });

  return Response.json(
    {
      status: report.ok ? "ok" : "degraded",
      // Which build answered: tells an old deployment apart from a new failure.
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      checks: report.checks,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
