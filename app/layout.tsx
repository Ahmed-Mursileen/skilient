import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { NONCE_HEADER } from "@/lib/security/headers";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Skilient — Prove it. Don't claim it.",
    template: "%s · Skilient",
  },
  description:
    "Build with classmates, prove your skills with real work, and get recognised by recruiters.",
  applicationName: "Skilient",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/skilient-app-icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F0EFED" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A09" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request CSP nonce from proxy.ts; reading it renders every page dynamically, as nonces require.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg-page font-sans text-body text-text-primary">
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
        {/* /_vercel/speed-insights only exists on Vercel; elsewhere (local, CI) the script URL falls through to the app. */}
        {process.env.VERCEL ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
