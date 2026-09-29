import { describe, expect, it } from "vitest";
import { COMPONENT_INFO, points, REQUIREMENT_LABELS, weeklyChangeLabel } from "@/lib/ranking/labels";

describe("ranking labels (PRD 5.17)", () => {
  it("says which way a rank moved this week, for screens and screen readers", () => {
    expect(weeklyChangeLabel(3)).toEqual({ text: "▲ 3", sr: "up 3 this week" });
    expect(weeklyChangeLabel(-2)).toEqual({ text: "▼ 2", sr: "down 2 this week" });
    expect(weeklyChangeLabel(0)).toEqual({ text: "–", sr: "no change this week" });
    expect(weeklyChangeLabel(null)).toEqual({ text: "New", sr: "new this week" });
  });

  it("words what the next tier needs", () => {
    expect(REQUIREMENT_LABELS.points(310, 500)).toBe("190 more points (310 of 500)");
    expect(REQUIREMENT_LABELS.points(499.5, 500)).toBe("1 more point (499.5 of 500)");
    expect(REQUIREMENT_LABELS.max_level(2, 3)).toBe("A skill at L3 or above");
    expect(REQUIREMENT_LABELS.top_share(14.2, 10)).toBe("Be in the top 10% of ranked students (you're in the top 14.2%)");
  });

  it("caps add up to the 2,500-point maximum", () => {
    expect(Object.values(COMPONENT_INFO).reduce((sum, c) => sum + c.max, 0)).toBe(2500);
  });

  it("formats points without trailing zeros", () => {
    expect(points(310)).toBe("310");
    expect(points(118.125)).toBe("118.13");
    expect(points(null)).toBe("0");
  });
});
