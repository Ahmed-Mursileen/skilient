import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { linkify } from "@/lib/format/linkify";
import { shortTime } from "@/lib/format/time";
import { fitWithin, overBudget, UPLOAD_BUDGET_BYTES } from "@/lib/images/downscale";
import { ImageRejected, reencodeToFit } from "@/lib/images/reencode";

describe("post images (decisions.md 2026-09-28)", () => {
  async function bigPhotoWithGps() {
    return sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#0e0d0b" } })
      .jpeg()
      .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 41/1 0/1" } })
      .toBuffer();
  }

  it("shrinks to fit 2,000 px, keeps the aspect ratio and drops EXIF/GPS", async () => {
    const out = await reencodeToFit(await bigPhotoWithGps());
    expect([out.width, out.height]).toEqual([2000, 1500]);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.data.toString("latin1")).not.toContain("TestCam");
  });

  it("never enlarges a small image", async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).png().toBuffer();
    const out = await reencodeToFit(small);
    expect([out.width, out.height]).toEqual([300, 200]);
  });

  it("refuses a file that isn't an image", async () => {
    await expect(reencodeToFit(Buffer.from("GIF89a but not really"))).rejects.toBeInstanceOf(ImageRejected);
  });

  it("browser downscale maths and the request budget", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1200, 5000)).toEqual({ width: 480, height: 2000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    const file = (n: number) => new File([new Uint8Array(n)], "x.jpg", { type: "image/jpeg" });
    expect(overBudget([file(1_000_000), file(1_000_000)])).toBeNull();
    expect(overBudget([file(UPLOAD_BUDGET_BYTES), file(1)])).toMatch(/too large/);
  });
});

describe("post text", () => {
  it("turns http(s) links into link parts and keeps trailing punctuation out", () => {
    expect(linkify("See https://example.com/a?b=1, then http://x.pk.")).toEqual([
      { kind: "text", value: "See " },
      { kind: "link", value: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { kind: "text", value: ", then " },
      { kind: "link", value: "http://x.pk", href: "http://x.pk" },
      { kind: "text", value: "." },
    ]);
  });

  it("never makes links from other schemes", () => {
    expect(linkify("javascript:alert(1) and <b>hi</b>")).toEqual([{ kind: "text", value: "javascript:alert(1) and <b>hi</b>" }]);
  });

  it("short times", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(shortTime("2026-09-29T11:59:30Z", now)).toBe("just now");
    expect(shortTime("2026-09-29T11:15:00Z", now)).toBe("45m");
    expect(shortTime("2026-09-29T02:00:00Z", now)).toBe("10h");
    expect(shortTime("2026-09-20T02:00:00Z", now)).toMatch(/^20 Sept?, 07:00$/);
  });
});
