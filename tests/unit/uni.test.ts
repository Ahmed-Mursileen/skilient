import { describe, expect, it } from "vitest";
import { brandColourError, contrastRatio, PAGE_BG } from "@/lib/ecosphere/contrast";
import { csvCell, toCsv } from "@/lib/uni/csv";
import { dashboardRows } from "@/lib/uni/export";
import { countLabel, sensitiveTopic } from "@/lib/uni/constants";

describe("brand colour contrast (PRD 5.23)", () => {
  it("uses the WCAG formula", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("not a colour", "#fff")).toBeNull();
  });
  it("refuses a colour below 4.5:1 against the page in either theme", () => {
    expect(brandColourError({ primary: { light: "#f5f5f5", dark: "#ffffff" } })).toMatch(/light mode/);
    expect(brandColourError({ primary: { light: "#1f4e79", dark: "#111111" } })).toMatch(/dark mode/);
    expect(brandColourError({ primary: { light: "#1f4e79", dark: "#9cc7ff" }, accent: { light: "#8a3b12", dark: "#f0a77a" } })).toBeNull();
  });
  it("matches the SQL page colours", () => {
    expect(PAGE_BG).toEqual({ light: "#f0efed", dark: "#0a0a09" });
  });
});

describe("CSV exports", () => {
  it("defuses formula cells", () => {
    for (const bad of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) expect(csvCell(bad).startsWith(`"'`)).toBe(true);
    expect(csvCell("Computer Science")).toBe('"Computer Science"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });
  it("writes a header and suppressed rows as words", () => {
    const rows = dashboardRows("adoption", { students: 12, active_30d: null, by_department: [{ label: "CS", count: 7 }, { label: "EE", count: null }], locked: false });
    expect(rows[0]).toEqual(["area", "section", "label", "value"]);
    expect(rows).toContainEqual(["adoption", "total", "active_30d", "fewer than 5"]);
    expect(rows).toContainEqual(["adoption", "by_department", "EE", "fewer than 5"]);
    expect(toCsv([["=x"]])).toBe(`"'=x"\r\n`);
  });
});

describe("onboarding questions", () => {
  it("refuses sensitive topics and allows ordinary ones", () => {
    expect(sensitiveTopic("Which religion do you follow?")).toBe(true);
    expect(sensitiveTopic("What is your family income?")).toBe(true);
    expect(sensitiveTopic("Which political party do you support?")).toBe(true);
    expect(sensitiveTopic("Which society are you in?")).toBe(false);
    expect(sensitiveTopic("Do you want to learn React?")).toBe(false);
  });
  it("labels hidden counts", () => {
    expect(countLabel(null)).toBe("fewer than 5");
    expect(countLabel(12)).toBe("12");
  });
});
