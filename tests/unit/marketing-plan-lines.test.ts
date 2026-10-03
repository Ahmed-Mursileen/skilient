import { describe, expect, it } from "vitest";
import { planLines, pkr } from "@/lib/marketing/plan-lines";

describe("planLines", () => {
  it("words each grant the plan turns on, in registry order", () => {
    expect(planLines({ "org.seats": 5, "talent.full_profile": true, "contact.credits": 100, "hire_fee.waived": true })).toEqual([
      "Full profiles, CVs and evidence",
      "100 contact requests a month",
      "5 seats",
      "No hiring fee",
    ]);
  });
  it("leaves out grants that are off and keys it doesn't know", () => {
    expect(planLines({ "cv.pdf_export": false, "cv.templates": 1, "org.plan": "growth", "student.plan": "pro" })).toEqual([]);
  });
  it("reads singulars, unlimited and enum values", () => {
    expect(planLines({ "org.seats": 1, "jobs.active_posts": 100000, "uni.sponsored_pro": "final_year", "uni.dashboard": "accreditation" })).toEqual([
      "1 seat",
      "Unlimited job posts",
      "Full dashboard with accreditation reports",
      "Student Pro for final-year students",
    ]);
  });
  it("formats rupees with grouping", () => {
    expect(pkr(450000)).toBe("PKR 450,000");
  });
});
