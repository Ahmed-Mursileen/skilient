import { cn } from "@/lib/cn";
import { art, type ArtName } from "@/lib/marketing/art";

/**
 * A risograph print (lib/marketing/art.ts): AVIF with a WebP fallback at its own size, so no
 * layout shift. Prints read the same in both themes (paper is paper); a hairline frame keeps the
 * cream sheet from floating on the dark ground. Decorative breaks pass `alt=""`.
 */
export function ArtImage({
  name,
  className,
  sizes,
  eager = false,
}: {
  name: Exclude<ArtName, "og-plate">;
  className?: string;
  sizes?: string;
  eager?: boolean;
}) {
  const file = art[name];
  // Portrait prints also come at 480 px wide for phones; the wide breaks only at full size.
  const small = file.width < file.height;
  const set = (ext: "avif" | "webp") =>
    small ? `/marketing/art/${name}-480.${ext} 480w, /marketing/art/${name}.${ext} ${file.width}w` : `/marketing/art/${name}.${ext}`;
  return (
    <picture className={cn("block overflow-hidden rounded-lg border border-border-default", className)}>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <img
        src={`/marketing/art/${name}.webp`}
        srcSet={set("webp")}
        alt={file.alt}
        width={file.width}
        height={file.height}
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        draggable={false}
        className="block h-auto w-full"
      />
    </picture>
  );
}
