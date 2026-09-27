import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageRejected, reencodeImage } from "@/lib/images/reencode";

async function photoWithGps() {
  return sharp({ create: { width: 900, height: 700, channels: 3, background: "#c03910" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", Model: "Leaky 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 41/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "73/1 3/1 0/1" },
    })
    .toBuffer();
}

describe("server-side image re-encode (PRD 10)", () => {
  it("starts from a photo that really carries EXIF and GPS", async () => {
    const meta = await sharp(await photoWithGps()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif!.toString("latin1")).toContain("TestCam");
  });

  it("outputs a WebP avatar at 512×512 with no metadata at all", async () => {
    const out = await reencodeImage(await photoWithGps(), "avatar");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([512, 512]);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(out.toString("latin1")).not.toContain("TestCam");
  });

  it("outputs a 1500×500 cover", async () => {
    const meta = await sharp(await reencodeImage(await photoWithGps(), "cover")).metadata();
    expect([meta.width, meta.height]).toEqual([1500, 500]);
  });

  it("detects the type from the bytes: a renamed text file is rejected", async () => {
    await expect(reencodeImage(Buffer.from("not really a jpeg"), "avatar")).rejects.toEqual(new ImageRejected("not_an_image"));
  });

  it("rejects anything wider or taller than 6,000 px", async () => {
    const wide = await sharp({ create: { width: 6001, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(reencodeImage(wide, "cover")).rejects.toMatchObject({ reason: "too_large" });
  });
});
