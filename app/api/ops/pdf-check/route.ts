import { readdirSync, readFileSync } from "node:fs";
import { launchBrowser } from "@/lib/cv/browser";
import { cvPrintHtml } from "@/lib/cv/pdf";
import { FULL_SNAPSHOT } from "@/lib/cv/sample";
import { siteUrl } from "@/lib/cv/site";
import { logger, requestIdFrom } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff-only PDF renderer check (decisions.md 2026-10-01 feasibility spike): prints the
 * made-up sample CV on this deployment and reports file size, memory (Node and Chromium's
 * processes), timings and whether this was a cold start. 404 for everyone else.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let warm = false;

function rssKb(pid: number): number {
  try {
    const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

/** Resident memory of a process and every descendant (Linux /proc). */
function treeRssMb(root: number): number {
  const parent = new Map<number, number>();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      parent.set(Number(entry), Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]));
    } catch {
      // the process ended
    }
  }
  let total = 0;
  const queue = [root];
  while (queue.length) {
    const pid = queue.pop()!;
    total += rssKb(pid);
    for (const [child, p] of parent) if (p === pid) queue.push(child);
  }
  return Math.round(total / 1024);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: isStaff } = user ? await supabase.rpc("is_staff") : { data: false };
  if (!user || !isStaff) return new Response(null, { status: 404 });

  const cold = !warm;
  warm = true;
  const t0 = performance.now();
  const browser = await launchBrowser();
  const tLaunch = performance.now();
  let bytes = 0;
  let chromiumMb = 0;
  try {
    const page = await browser.newPage();
    await page.setContent(await cvPrintHtml({ snapshot: FULL_SNAPSHOT, code: "ABCDE12345", issuedAt: new Date(), template: "standard", siteUrl: siteUrl() }), {
      waitUntil: "load",
    });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" } });
    bytes = pdf.byteLength;
    const pid = browser.process()?.pid;
    chromiumMb = pid ? treeRssMb(pid) : 0;
  } finally {
    await browser.close();
  }
  const tDone = performance.now();
  const body = {
    cold,
    launch_ms: Math.round(tLaunch - t0),
    render_ms: Math.round(tDone - tLaunch),
    total_ms: Math.round(tDone - t0),
    pdf_bytes: bytes,
    node_rss_mb: Math.round(process.memoryUsage().rss / 1048576),
    chromium_rss_mb: chromiumMb,
    function_memory_mb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null,
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
  };
  logger.info("ops.pdf_check", { request_id: requestIdFrom(request.headers), action: "GET /api/ops/pdf-check", outcome: "ok", ...body });
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
