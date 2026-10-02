import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "./browser";
import { cvCss, cvDocumentHtml, verifyUrl, type CvDocumentInput } from "./document";
import { qrDataUri } from "./qr";

/**
 * CV PDFs (PRD 5.18): the template HTML printed by headless Chromium with Spectral and Barlow
 * embedded, real selectable text, ligatures off, and the code and QR in the footer.
 */
export type Paper = "a4" | "letter";

const FONTS: [family: string, weight: number, file: string][] = [
  ["Spectral", 500, "spectral-latin-500-normal.woff2"],
  ["Spectral", 600, "spectral-latin-600-normal.woff2"],
  ["Barlow", 400, "barlow-latin-400-normal.woff2"],
  ["Barlow", 500, "barlow-latin-500-normal.woff2"],
  ["Barlow", 600, "barlow-latin-600-normal.woff2"],
];

let fontCss: string | null = null;
/** Spectral and Barlow as data URIs: Chromium on Vercel has no system fonts. Also used by invoice PDFs. */
export function embeddedFonts(): string {
  fontCss ??= FONTS.map(([family, weight, file]) => {
    const data = readFileSync(join(process.cwd(), "lib", "cv", "fonts", file)).toString("base64");
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: normal; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join("\n");
  return fontCss;
}

export async function cvPrintHtml(input: Omit<CvDocumentInput, "qrDataUri">): Promise<string> {
  const qr = await qrDataUri(verifyUrl(input.siteUrl, input.code));
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${input.snapshot.person.name.replace(/[<>&"]/g, "")} CV</title>` +
    `<style>${embeddedFonts()}\n${cvCss(input.template)}\nhtml, body { margin: 0; background: #fff; }</style></head>` +
    `<body>${cvDocumentHtml({ ...input, qrDataUri: qr })}</body></html>`
  );
}

export async function renderCvPdf(input: Omit<CvDocumentInput, "qrDataUri"> & { paper: Paper }): Promise<Uint8Array> {
  const html = await cvPrintHtml(input);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const pdf = await page.pdf({
      format: input.paper === "letter" ? "Letter" : "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" },
      tagged: true,
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
