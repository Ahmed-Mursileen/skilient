import "server-only";

import { randomUUID } from "node:crypto";
import { CONTENT_IMAGE, ImageRejected, reencodeToFit } from "@/lib/images/reencode";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface StoredImage {
  path: string;
  width: number;
  height: number;
}

export type StoreResult =
  | { ok: true; images: StoredImage[] }
  | { ok: false; code: "too_many" | "too_large" | "not_an_image" | "upload_failed"; message: string };

/**
 * Re-encodes up to `max` uploaded images (EXIF and GPS always stripped, decisions.md
 * 2026-09-28) and stores them in the author's own folder of `post-media` with the user's
 * session. Anything stored is removed again if a later image fails.
 */
export async function storeContentImages(supabase: Supabase, userId: string, files: File[], max = 4): Promise<StoreResult> {
  if (files.length > max) return { ok: false, code: "too_many", message: `Add up to ${max} images.` };
  const stored: StoredImage[] = [];
  for (const file of files) {
    if (file.size === 0 || file.size > CONTENT_IMAGE.maxBytes) {
      await removeContentImages(supabase, stored.map((s) => s.path));
      return { ok: false, code: "too_large", message: "Each image must be under 5 MB." };
    }
    let out: Awaited<ReturnType<typeof reencodeToFit>>;
    try {
      out = await reencodeToFit(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      await removeContentImages(supabase, stored.map((s) => s.path));
      const reason = err instanceof ImageRejected ? err.reason : "not_an_image";
      return reason === "too_large"
        ? { ok: false, code: "too_large", message: "That image is too big (max 6,000 × 6,000 pixels)." }
        : { ok: false, code: "not_an_image", message: "One of those files isn't an image we can read. Use JPEG, PNG or WebP." };
    }
    const path = `${userId}/${randomUUID()}.webp`;
    const upload = await supabase.storage
      .from("post-media")
      .upload(path, out.data, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
    if (upload.error) {
      await removeContentImages(supabase, stored.map((s) => s.path));
      return { ok: false, code: "upload_failed", message: "Couldn't upload your images. Try again." };
    }
    stored.push({ path, width: out.width, height: out.height });
  }
  return { ok: true, images: stored };
}

/** Best effort; returns whether anything was left behind (for the log line). */
export async function removeContentImages(supabase: Supabase, paths: string[]): Promise<boolean> {
  if (!paths.length) return false;
  const { error } = await supabase.storage.from("post-media").remove(paths);
  return Boolean(error);
}
