import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { cvCss, cvDocumentHtml, type CvDocumentInput } from "@/lib/cv/document";
import { FULL_SNAPSHOT } from "@/lib/cv/sample";
import { qrDataUri } from "@/lib/cv/qr";

it("writes the sample CV page used by the pitch film", async () => {
  const siteUrl = "https://skilient.vercel.app";
  const code = "7KQ2M9XR4T";
  const input: CvDocumentInput = {
    snapshot: FULL_SNAPSHOT,
    code,
    issuedAt: "2026-09-30T19:30:00Z",
    template: "standard",
    siteUrl,
    qrDataUri: await qrDataUri(`${siteUrl}/verify/${code}`),
  };
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}${cvCss("standard")}</style>${cvDocumentHtml(input)}`;
  writeFileSync("pitch/assets/cv.html", html);
});
