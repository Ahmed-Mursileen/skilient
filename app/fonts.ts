import { Barlow, JetBrains_Mono, Spectral } from "next/font/google";

// PRD 9.2 / 10 budgets: only these weights, Latin subset, self-hosted by next/font.
export const spectral = Spectral({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-spectral",
});

export const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-barlow",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  // Real data only (hashes, repos, codes): rarely above the fold, so it isn't preloaded on every page.
  preload: false,
  variable: "--font-jetbrains-mono",
});

export const fontVariables = [spectral.variable, barlow.variable, jetbrainsMono.variable].join(" ");
