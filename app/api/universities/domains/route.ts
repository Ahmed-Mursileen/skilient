import { loadDomainDirectory } from "@/lib/data/universities";
import { logger, requestIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Cached public domain list (PRD 5.27): the signup form detects the university as the
 * student types. Public data only; the server actions and the Auth hook re-check.
 * Cached at the CDN for an hour so it costs one query per region per hour.
 */
export async function GET(request: Request) {
  const started = performance.now();
  try {
    const directory = await loadDomainDirectory();
    logger.info("universities.domains", {
      request_id: requestIdFrom(request.headers),
      action: "GET /api/universities/domains",
      duration_ms: Math.round(performance.now() - started),
      outcome: "ok",
      domains: Object.keys(directory.domains).length,
    });
    return Response.json(directory, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    logger.error("universities.domains", {
      request_id: requestIdFrom(request.headers),
      action: "GET /api/universities/domains",
      duration_ms: Math.round(performance.now() - started),
      outcome: "error",
      error_code: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
