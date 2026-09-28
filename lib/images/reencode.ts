import "server-only";

import sharp from "sharp";

export type ImageKind = "avatar" | "cover";

export const IMAGE_SPECS = {
  avatar: { bucket: "avatars", width: 512, height: 512, maxBytes: 5 * 1024 * 1024 },
  cover: { bucket: "covers", width: 1500, height: 500, maxBytes: 8 * 1024 * 1024 },
} as const satisfies Record<ImageKind, { bucket: string; width: number; height: number; maxBytes: number }>;

const MAX_SIDE = 6000;
const ACCEPTED = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export class ImageRejected extends Error {
  constructor(readonly reason: "not_an_image" | "too_large" | "unsupported") {
    super(reason);
  }
}

/**
 * Server-side re-encode (PRD 10): the type comes from the file's bytes, not its name or
 * MIME; anything over 6,000 × 6,000 or that fails to decode is rejected; the output is a
 * fresh WebP at the fixed size with no metadata at all (EXIF and GPS gone).
 */
export async function reencodeImage(input: Buffer, kind: ImageKind): Promise<Buffer> {
  const spec = IMAGE_SPECS[kind];
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE, failOn: "error" }).metadata();
    format = meta.format;
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    throw new ImageRejected("not_an_image");
  }
  if (!format || !ACCEPTED.has(format)) throw new ImageRejected("unsupported");
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new ImageRejected("too_large");

  try {
    return await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE, failOn: "error" })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize(spec.width, spec.height, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer(); // sharp drops all metadata unless asked to keep it
  } catch {
    throw new ImageRejected("not_an_image");
  }
}

/** Post, venture-update and chat images: longest side up to 2,000 px, aspect kept. */
export const CONTENT_IMAGE = { maxSide: 2000, maxBytes: 5 * 1024 * 1024 } as const;

/**
 * Same checks as reencodeImage (type from the bytes, 6,000 px cap, EXIF/GPS dropped), but
 * keeps the aspect ratio and only shrinks to fit within `maxSide`.
 */
export async function reencodeToFit(
  input: Buffer,
  maxSide: number = CONTENT_IMAGE.maxSide,
): Promise<{ data: Buffer; width: number; height: number }> {
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE, failOn: "error" }).metadata();
    format = meta.format;
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    throw new ImageRejected("not_an_image");
  }
  if (!format || !ACCEPTED.has(format)) throw new ImageRejected("unsupported");
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new ImageRejected("too_large");
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE, failOn: "error" })
      .rotate()
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ImageRejected("not_an_image");
  }
}
