import { cn } from "@/lib/cn";
import type { CaptureFile } from "@/lib/marketing/captures";

/**
 * A product capture in the current theme. Both themes are in the page, each hidden by the
 * theme class, so the footer toggle (not only the OS setting) picks the image; `loading="lazy"`
 * means the hidden one is never fetched. AVIF with a WebP fallback, explicit size (no layout shift).
 */
export function CaptureImage({
  file,
  alt,
  className,
  imgClassName,
  eager = false,
  priority = false,
}: {
  file: CaptureFile;
  alt: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  /** Fetch first when it loads (the hero's largest image). */
  priority?: boolean;
}) {
  return (
    <>
      {(["light", "dark"] as const).map((theme) => (
        <picture key={theme} className={cn(theme === "light" ? "block dark:hidden" : "hidden dark:block", className)}>
          <source type="image/avif" srcSet={file[theme].avif} />
          <img
            src={file[theme].webp}
            alt={alt}
            width={file.w}
            height={file.h}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            draggable={false}
            className={cn("block h-auto w-full", imgClassName)}
          />
        </picture>
      ))}
    </>
  );
}
