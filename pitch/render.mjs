// Usage:
//   node pitch/render.mjs --contact [--times 0.2,2.6,...] [--dpr 1]   contact-sheet frames -> pitch/out/contact/
//   node pitch/render.mjs --full [--dpr 2] [--fps 30] [--workers 4] [--from 0 --to 180]   -> pitch/out/film.mp4
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.join(here, "out");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const types = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x").pathname;
  const file = url.startsWith("/fonts/")
    ? path.join(root, "lib/cv/fonts", path.basename(url))
    : path.join(here, url === "/" ? "index.html" : url);
  if (!file.startsWith(here) && !file.startsWith(path.join(root, "lib/cv/fonts"))) return res.writeHead(403).end();
  fs.readFile(file, (err, buf) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(buf);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const exe = process.env.PW_CHROMIUM_PATH || process.env.CV_CHROMIUM_PATH || undefined;

async function openPage(browser, dpr) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?dpr=${dpr}`);
  await page.waitForFunction(() => window.__ready === true);
  return page;
}
const shot = (page) => page.locator("#c").screenshot({ type: "png" });

const browser = await chromium.launch({ executablePath: exe, args: ["--force-color-profile=srgb"] });
const dpr = Number(opt("dpr", 1));

try {
  if (flag("contact")) {
    let times = opt("times", "");
    let list = times ? times.split(",").map(Number) : null;
    if (!list) {
      // fallback timeline: read from the page
      list = [0.2, 2.7, 5, 7.5, 10.2, 11.8];
    }
    fs.rmSync(path.join(out, "contact"), { recursive: true, force: true });
    fs.mkdirSync(path.join(out, "contact"), { recursive: true });
    const page = await openPage(browser, dpr);
    for (const t of list) {
      await page.evaluate((x) => window.seek(x), t);
      fs.writeFileSync(path.join(out, "contact", `t${String(t.toFixed(2)).padStart(6, "0")}.png`), await shot(page));
    }
    console.log(`contact frames: ${list.length}`);
  } else if (flag("full")) {
    const fps = Number(opt("fps", 30));
    const workers = Number(opt("workers", 4));
    const probe = await openPage(browser, dpr);
    const total = await probe.evaluate(() => window.__total);
    const from = Number(opt("from", 0));
    const to = Number(opt("to", total));
    const frames = Math.round((to - from) * fps);
    const per = Math.ceil(frames / workers);
    fs.mkdirSync(path.join(out, "seg"), { recursive: true });
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const f0 = w * per;
        const f1 = Math.min(frames, f0 + per);
        if (f0 >= f1) return;
        const page = await openPage(browser, dpr);
        const seg = path.join(out, "seg", `seg${w}.mp4`);
        const ff = spawn(
          "ffmpeg",
          ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-an",
           "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", seg],
          { stdio: ["pipe", "inherit", "inherit"] },
        );
        for (let f = f0; f < f1; f++) {
          await page.evaluate((x) => window.seek(x), from + f / fps);
          const ok = ff.stdin.write(await shot(page));
          if (!ok) await new Promise((r) => ff.stdin.once("drain", r));
          if (f % 150 === 0) console.log(`worker ${w}: ${f - f0}/${f1 - f0}`);
        }
        ff.stdin.end();
        await new Promise((r) => ff.on("close", r));
      }),
    );
    const list = path.join(out, "seg", "list.txt");
    fs.writeFileSync(
      list,
      Array.from({ length: workers }, (_, w) => `file 'seg${w}.mp4'`).filter((_, w) => fs.existsSync(path.join(out, "seg", `seg${w}.mp4`))).join("\n"),
    );
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(out, "film.mp4")], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("concat failed");
    console.log("wrote pitch/out/film.mp4");
  } else {
    console.log("pass --contact or --full");
  }
} finally {
  await browser.close();
  server.close();
}
