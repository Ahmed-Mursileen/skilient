/** Public URL of a university-media file (public bucket, unguessable WebP paths). Client-safe. */
export function mediaUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/university-media/${path}`;
}
