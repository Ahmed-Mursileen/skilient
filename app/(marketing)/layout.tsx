import { headers } from "next/headers";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getViewer } from "@/lib/data/marketing";
import { NONCE_HEADER } from "@/lib/security/headers";
import "./marketing.css";

/**
 * The public site's frame (PRD 5.1): marketing nav, page, footer. Rendered per request for the
 * nonce CSP (decisions 2026-10-02); the only per-visitor part is "Open Skilient" for the signed in.
 */
export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const [viewer, nonce] = await Promise.all([getViewer(), headers().then((h) => h.get(NONCE_HEADER) ?? undefined)]);
  return (
    <>
      {/* Marks the page as scripted before it paints, so CSS can hold the hero's start state;
          without JavaScript every section shows its end state. */}
      <script nonce={nonce}>{"document.documentElement.dataset.js=1"}</script>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-bg-elevated focus:px-4 focus:py-2 focus:shadow-3">
        Skip to content
      </a>
      <MarketingNav home={viewer?.home ?? null} />
      <main id="main">{children}</main>
      <MarketingFooter />
    </>
  );
}
