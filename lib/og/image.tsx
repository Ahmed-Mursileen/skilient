/* eslint-disable @next/next/no-img-element -- next/og (Satori) renders plain <img>, never next/image. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Open Graph cards for the marketing pages (PRD 5.1, plan B8): the risograph plate on the right,
 * the wordmark and the page's title in Spectral on the left. Prerendered at build, so the files
 * below are read once.
 */
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export async function ogImage(title: string, kicker?: string) {
  const [plate, logo, spectral, barlow] = await Promise.all([
    // Literal paths, so the build traces these four files and nothing else.
    readFile(join(process.cwd(), "public", "marketing", "art", "og-plate.jpg")),
    readFile(join(process.cwd(), "public", "brand", "skilient-logo.svg")),
    readFile(join(process.cwd(), "lib", "og", "fonts", "Spectral-Medium.ttf")),
    readFile(join(process.cwd(), "lib", "og", "fonts", "Barlow-Medium.ttf")),
  ]);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: "#F5EFE2" }}>
        <img src={`data:image/jpeg;base64,${plate.toString("base64")}`} width={1200} height={630} style={{ position: "absolute", inset: 0 }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: 640, height: "100%" }}>
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={264} height={60} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {kicker ? <div style={{ fontFamily: "Barlow", fontSize: 30, color: "#C03910" }}>{kicker}</div> : null}
            <div style={{ fontFamily: "Spectral", fontSize: 62, lineHeight: 1.08, letterSpacing: -1.2, color: "#0E0D0B" }}>{title}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Spectral", data: spectral, weight: 500, style: "normal" },
        { name: "Barlow", data: barlow, weight: 500, style: "normal" },
      ],
    },
  );
}
