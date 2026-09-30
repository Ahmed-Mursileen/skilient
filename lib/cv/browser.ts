import "server-only";

import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Headless Chromium for CV PDFs (PRD 5.18, decisions.md 2026-10-01): the @sparticuz build on
 * Vercel, or a local Chromium (CV_CHROMIUM_PATH / PW_CHROMIUM_PATH) in development and CI.
 */
export async function launchBrowser(): Promise<Browser> {
  const local = process.env.CV_CHROMIUM_PATH ?? process.env.PW_CHROMIUM_PATH;
  if (local && !process.env.VERCEL) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
  }
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, "--font-render-hinting=none"],
  });
}
