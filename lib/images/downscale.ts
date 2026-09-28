/**
 * Browser-side downscale before upload (decisions.md 2026-09-28): the longest side goes to
 * about 2,000 px so a post's images stay under Vercel's ~4.5 MB request limit. The server
 * re-encodes again (and strips metadata) whatever arrives.
 */
export const UPLOAD_MAX_SIDE = 2000;
/** Total request budget for a post's images, leaving room for the form fields. */
export const UPLOAD_BUDGET_BYTES = 4 * 1024 * 1024;

export function fitWithin(width: number, height: number, max = UPLOAD_MAX_SIDE): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Returns a JPEG no larger than 2,000 px on its longest side, or throws a message for the user. */
export async function downscaleForUpload(file: File): Promise<File> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Use JPEG, PNG or WebP images.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't an image we can read.");
  });
  const size = fitWithin(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && size.height === bitmap.height && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't prepare that image.");
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Your browser couldn't prepare that image.");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Message when the prepared images are still too big to send in one post. */
export function overBudget(files: File[]): string | null {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return total > UPLOAD_BUDGET_BYTES
    ? "These images are too large to send together, even after shrinking. Remove one or use smaller photos."
    : null;
}

/**
 * Adds files to an image list: at most `max`, each downscaled, and the total within the
 * request budget. Throws an Error whose message is written for the user.
 */
export async function prepareImages(existing: File[], added: File[], max = 4): Promise<File[]> {
  if (existing.length + added.length > max) throw new Error(`Add up to ${max} images.`);
  const prepared: File[] = [];
  for (const f of added) prepared.push(await downscaleForUpload(f));
  const all = [...existing, ...prepared];
  const tooBig = overBudget(all);
  if (tooBig) throw new Error(tooBig);
  return all;
}
