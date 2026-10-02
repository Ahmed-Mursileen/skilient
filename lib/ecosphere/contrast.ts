/**
 * WCAG 2 contrast for university brand colours (PRD 5.23; decisions.md 2026-10-04). The same formula
 * runs in SQL (private.contrast_ratio), so a direct RPC can't skip it. Client-safe.
 * No single colour reaches 4.5:1 on both page backgrounds, so each brand colour has a light-theme and a
 * dark-theme value, each checked against its own bg/page.
 */
export const PAGE_BG = { light: "#f0efed", dark: "#0a0a09" } as const;
export const MIN_RATIO = 4.5;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type ColourPair = { light: string; dark: string } | null | undefined;

/** Null when every given colour passes; else what to fix (worded like the SQL refusal). */
export function brandColourError(colours: { primary?: ColourPair; accent?: ColourPair }): string | null {
  for (const key of ["primary", "accent"] as const) {
    const pair = colours[key];
    if (!pair) continue;
    for (const theme of ["light", "dark"] as const) {
      const ratio = contrastRatio(pair[theme], PAGE_BG[theme]);
      if (ratio === null) return "Colours are #RRGGBB, one for light and one for dark.";
      if (ratio < MIN_RATIO) {
        return `The ${key} colour for ${theme} mode is only ${ratio.toFixed(2)}:1 against the page; it needs ${MIN_RATIO}:1.`;
      }
    }
  }
  return null;
}
