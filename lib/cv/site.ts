/** The origin printed in verify links and QR codes (decisions.md 2026-10-01). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
