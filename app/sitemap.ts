import type { MetadataRoute } from "next";
import { BUILT_PAGES, NOINDEX_PAGES } from "@/content/marketing";
import { siteUrl } from "@/lib/cv/site";

/** The public marketing pages (PRD 5.1), only those that exist (`BUILT_PAGES`). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return ["/", ...[...BUILT_PAGES].filter((p) => !NOINDEX_PAGES.has(p))].map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
