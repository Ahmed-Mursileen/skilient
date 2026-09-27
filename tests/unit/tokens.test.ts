import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync("app/styles/tokens.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

function block(selectorStart: string): Record<string, string> {
  const start = tokens.indexOf(selectorStart);
  const open = tokens.indexOf("{", start);
  const close = tokens.indexOf("\n}", open);
  const body = tokens.slice(open + 1, close);
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = block(":root,\n.light");
const dark = block(".dark {");

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("design tokens", () => {
  it("defines every themed variable in both light and dark", () => {
    const lightKeys = Object.keys(light).sort();
    const darkKeys = Object.keys(dark).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it("maps only variables that exist in tokens.css into @theme", () => {
    const referenced = [...globals.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    const defined = new Set([...(tokens + globals).matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    const fromNextFont = new Set(["--font-spectral", "--font-barlow", "--font-jetbrains-mono"]);
    const missing = referenced.filter((v) => !defined.has(v) && !fromNextFont.has(v));
    expect(missing).toEqual([]);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps body-safe text ≥ 4.5:1 on page and surface (%s)", (_, t) => {
    for (const fg of ["--text-primary", "--text-secondary", "--text-muted", "--text-error", "--verified"]) {
      for (const bg of ["--bg-page", "--bg-surface", "--bg-elevated"]) {
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t["--text-on-primary"], t["--interactive-primary"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--text-on-accent"], t["--interactive-accent"])).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps tier chip text ≥ 4.5:1 on cards (%s)", (_, t) => {
    for (const tier of ["raw", "spark", "flare", "shine", "radiant", "luminary"]) {
      expect(contrast(t[`--tier-${tier}-text`], t["--bg-surface"]), tier).toBeGreaterThanOrEqual(4.5);
    }
  });
});
