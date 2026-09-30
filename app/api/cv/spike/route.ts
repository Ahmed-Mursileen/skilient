import { readFileSync } from "node:fs";
import { launchBrowser } from "@/lib/cv/browser";

// Phase 5 feasibility spike (decisions.md 2026-10-01): one CV-like PDF in this function on the
// current Vercel plan, reporting size, memory, duration and cold start. Preview deployments
// only; removed before the PR merges.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let warm = false;
const loadedAt = Date.now();

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function sample(): string {
  const skills = Array.from({ length: 15 }, (_, i) => `<li>Skill ${i + 1} · Level ${(i % 3) + 2} · 12 repositories</li>`).join("");
  const projects = Array.from({ length: 6 }, (_, i) =>
    `<h3>Venture ${i + 1}</h3><p>Developer · 2026-0${(i % 9) + 1} to 2026-09 · team of 4 · 6 peer-verified entries · 3 verified deliverables</p>` +
    `<p>Written by the team: ${"A campus timetable planner that students actually use. ".repeat(6)}</p>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.45; color: #0e0d0b; font-variant-ligatures: none; }
    h1 { font-size: 22pt; margin: 0 } h2 { font-size: 12pt; border-bottom: 1px solid #ccc; margin-top: 14pt } h3 { font-size: 11pt; margin: 8pt 0 2pt }
  </style></head><body>
    <h1>Ayesha Khan</h1><p>Computer Science · NUTECH · Class of 2027 · Spark tier, top 12%</p>
    <h2>Summary</h2><p>Computer Science student at NUTECH, class of 2027, with verified work in React, Python and SQL across 6 ventures (4 completed).</p>
    <h2>Skills</h2><ul>${skills}</ul><h2>Projects</h2>${projects}
    <h2>Education</h2><p>National University of Technology · Computer Science · 2027</p>
  </body></html>`;
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return new Response(null, { status: 404 });
  const cold = !warm;
  warm = true;
  const t0 = performance.now();
  const browser = await launchBrowser();
  const tLaunch = performance.now();
  let bytes = 0;
  try {
    const page = await browser.newPage();
    await page.setContent(sample(), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    bytes = pdf.byteLength;
  } finally {
    await browser.close();
  }
  const tDone = performance.now();
  const mem = process.memoryUsage();
  return Response.json(
    {
      cold,
      ms_since_module_load: Date.now() - loadedAt,
      launch_ms: Math.round(tLaunch - t0),
      render_ms: Math.round(tDone - tLaunch),
      total_ms: Math.round(tDone - t0),
      pdf_bytes: bytes,
      node_rss_mb: Math.round(mem.rss / 1048576),
      cgroup_memory_peak_mb: (() => {
        const v = read("/sys/fs/cgroup/memory.peak");
        return v ? Math.round(Number(v) / 1048576) : null;
      })(),
      cgroup_memory_max: read("/sys/fs/cgroup/memory.max"),
      lambda_memory_mb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null,
      region: process.env.VERCEL_REGION ?? null,
      node: process.version,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
