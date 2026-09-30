import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pktDate } from "@/lib/format/time";
import { badgeLabel, isActive, PRIMARY_NAV, SECONDARY_NAV } from "@/lib/nav";
import { TIP_IDS, TIPS } from "@/lib/tips";
import { TOURS } from "@/lib/tours";
import { studentTour } from "@/lib/tours/student";

const migration = readFileSync("supabase/migrations/20261010000000_student_portal.sql", "utf8");

describe("navigation", () => {
  it("has the five areas in the PRD order, each with a tooltip line", () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(["Home", "Opportunities", "Ventures", "Chat", "Me"]);
    for (const item of [...PRIMARY_NAV, ...SECONDARY_NAV]) {
      expect(item.description.length, item.key).toBeGreaterThan(10);
      expect(item.description, item.key).not.toMatch(/—/);
    }
  });
  it("marks the right item active, and Feedback separately from Me", () => {
    const at = (path: string) => [...PRIMARY_NAV, ...SECONDARY_NAV].filter((i) => isActive(i, path)).map((i) => i.key);
    expect(at("/feed")).toEqual(["home"]);
    expect(at("/opportunities/jobs")).toEqual(["opportunities"]);
    expect(at("/me/score")).toEqual(["me"]);
    expect(at("/feedback")).toEqual(["feedback"]);
    expect(at("/ventures/abc/team")).toEqual(["ventures"]);
  });
  it("caps badges at 99+", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(140)).toBe("99+");
  });
});

describe("the student tour", () => {
  it("points at nav items that exist, one step each, ending on Feedback", () => {
    const anchors = new Set([...PRIMARY_NAV, ...SECONDARY_NAV].map((i) => `nav-${i.key}`));
    for (const step of studentTour.steps) expect(anchors.has(step.anchor), step.anchor).toBe(true);
    expect(new Set(studentTour.steps.map((s) => s.anchor)).size).toBe(studentTour.steps.length);
    expect(studentTour.steps[0].anchor).toBe("nav-home");
    expect(studentTour.steps.at(-1)?.title).toBe("Feedback");
  });
  it("uses the tour ids the database accepts", () => {
    for (const id of Object.keys(TOURS)) expect(migration, id).toContain(`'${id}'`);
  });
});

describe("first-visit tips", () => {
  it("match the database's list and have two lines plus a longer one", () => {
    for (const id of TIP_IDS) {
      expect(migration, id).toContain(`'${id}'`);
      expect(TIPS[id].body.length).toBeGreaterThan(20);
      expect(TIPS[id].more.length).toBeGreaterThan(TIPS[id].body.length / 2);
    }
    expect(Object.keys(TIPS).sort()).toEqual([...TIP_IDS].sort());
  });
});

describe("pktDate", () => {
  it("is the date in Pakistan time, not UTC", () => {
    expect(pktDate(new Date("2026-10-02T20:30:00Z"))).toBe("2026-10-03");
    expect(pktDate(new Date("2026-10-02T18:30:00Z"))).toBe("2026-10-02");
  });
});
