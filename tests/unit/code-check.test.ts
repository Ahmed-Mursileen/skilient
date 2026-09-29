import { describe, expect, it } from "vitest";
import { addedRuns, decodeBase64, pickWindow, sliceLines } from "@/supabase/functions/_shared/codecheck/snippet";
import { tokenAal } from "@/supabase/functions/_shared/codecheck/serve";

const hunk = (start: number, lines: string[]) => `@@ -1,0 +${start},${lines.length} @@\n${lines.join("\n")}`;

describe("addedRuns (code-check snippets)", () => {
  it("numbers added lines as in the new file and splits runs at context and removals", () => {
    const patch = [
      "@@ -10,6 +10,9 @@ def main():",
      " context",
      "+a",
      "+b",
      "-gone",
      "+c",
      " context",
      "+d",
      "\\ No newline at end of file",
      "@@ -40,2 +45,3 @@",
      "+e",
      "+f",
    ].join("\n");
    expect(addedRuns(patch)).toEqual([
      { start: 11, end: 12 },
      { start: 13, end: 13 },
      { start: 15, end: 15 },
      { start: 45, end: 46 },
    ]);
  });

  it("returns nothing for a missing patch (binary or huge files)", () => {
    expect(addedRuns(null)).toEqual([]);
    expect(addedRuns("")).toEqual([]);
  });
});

describe("pickWindow", () => {
  const runs = [{ start: 1, end: 5 }, { start: 20, end: 79 }];
  it("picks 20-40 lines inside a long enough run", () => {
    expect(pickWindow(runs, 20, 40, () => 0)).toEqual({ start: 20, end: 59 });
    expect(pickWindow(runs, 20, 40, () => 0.999)).toEqual({ start: 40, end: 79 });
  });
  it("is null when no run reaches the minimum", () => {
    expect(pickWindow([{ start: 1, end: 19 }], 20, 40, Math.random)).toBeNull();
  });
  it("takes a whole run shorter than the maximum", () => {
    expect(pickWindow([{ start: 3, end: 27 }], 20, 40, () => 0.5)).toEqual({ start: 3, end: 27 });
  });
  it("finds the same lines in a patch that added them", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `+line ${i + 1}`);
    const window = pickWindow(addedRuns(hunk(1, lines)), 20, 40, () => 0)!;
    const file = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n");
    expect(sliceLines(file, window.start, window.end)).toHaveLength(25);
  });
});

describe("file text", () => {
  it("decodes GitHub's line-wrapped base64 as UTF-8 and slices by line", () => {
    const text = "one\r\ntwo — ٹو\nthree\n";
    const b64 = Buffer.from(text, "utf8").toString("base64").replace(/(.{8})/g, "$1\n");
    expect(sliceLines(decodeBase64(b64), 2, 3)).toEqual(["two — ٹو", "three"]);
  });

  it("reads the session's two-factor level from the token, defaulting to aal1", () => {
    const token = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
    expect(tokenAal(token({ sub: "u", aal: "aal2" }))).toBe("aal2");
    expect(tokenAal(token({ sub: "u" }))).toBe("aal1");
    expect(tokenAal("not a jwt")).toBe("aal1");
  });
});
