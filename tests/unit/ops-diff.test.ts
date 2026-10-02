import { describe, expect, it } from "vitest";
import { diffJson, pktDayRange } from "@/lib/ops/diff";

describe("diffJson", () => {
  it("compares objects key by key, marking changes", () => {
    expect(diffJson({ roles: ["moderator"], a: 1 }, { roles: ["moderator", "accounts"], a: 1 })).toEqual([
      { key: "a", before: "1", after: "1", changed: false },
      { key: "roles", before: '["moderator"]', after: '["moderator","accounts"]', changed: true },
    ]);
  });
  it("handles a missing side", () => {
    expect(diffJson(null, { claimed_by: "x" })).toEqual([{ key: "claimed_by", before: null, after: "x", changed: true }]);
    expect(diffJson(null, null)).toEqual([]);
  });
  it("treats scalars and arrays as one value", () => {
    expect(diffJson(1, 2)).toEqual([{ key: "value", before: "1", after: "2", changed: true }]);
    expect(diffJson([1], [1])).toEqual([{ key: "value", before: "[1]", after: "[1]", changed: false }]);
  });
});

describe("pktDayRange", () => {
  it("turns Karachi days into a half-open UTC range", () => {
    expect(pktDayRange("2026-10-01", "2026-10-02")).toEqual({ from: "2026-09-30T19:00:00.000Z", to: "2026-10-02T19:00:00.000Z" });
  });
  it("ignores bad input", () => {
    expect(pktDayRange("yesterday", "2026-13-40")).toEqual({ from: undefined, to: undefined });
  });
});
