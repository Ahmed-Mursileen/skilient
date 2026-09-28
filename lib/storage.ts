import { readPublicEnv } from "@/lib/env";

export type ImageBucket = "avatars" | "covers" | "post-media";

/** Public URL of a profile or post image (the buckets are public-read; paths are unguessable uuids). */
export function publicImageUrl(bucket: ImageBucket, path: string | null | undefined): string | null {
  const env = readPublicEnv();
  if (!path || !env) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
