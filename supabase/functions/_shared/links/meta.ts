/**
 * Reads a preview (title, description, image, site name) from HTML without a DOM:
 * Open Graph first, then <title> and the description meta. Text only; the image must be
 * an absolute https URL.
 */

export interface PreviewMeta {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
      const key = e.toLowerCase();
      if (key in ENTITIES) return ENTITIES[key];
      if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16) || 32);
      if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)) || 32);
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const k = new RegExp(`${attr}\\s*=\\s*["']${key.replace(/[.:]/g, "\\$&")}["']`, "i");
    if (!k.test(tag)) continue;
    const c = /content\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag);
    if (c) return decode(c[2]) || null;
  }
  return null;
}

function clip(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function parsePreview(html: string, pageUrl: string): PreviewMeta {
  const head = html.slice(0, 200_000);
  const title = metaContent(head, "property", "og:title") ?? metaContent(head, "name", "twitter:title") ??
    (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)![1]) : null);
  const description = metaContent(head, "property", "og:description") ?? metaContent(head, "name", "description");
  const siteName = metaContent(head, "property", "og:site_name");
  let imageUrl: string | null = null;
  const rawImage = metaContent(head, "property", "og:image") ?? metaContent(head, "name", "twitter:image");
  if (rawImage) {
    try {
      const u = new URL(rawImage, pageUrl);
      if (u.protocol === "https:") imageUrl = u.toString();
    } catch {
      imageUrl = null;
    }
  }
  return {
    title: clip(title, 300),
    description: clip(description, 500),
    imageUrl: imageUrl && imageUrl.length <= 2000 ? imageUrl : null,
    siteName: clip(siteName, 100) ?? (() => {
      try {
        return new URL(pageUrl).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })(),
  };
}
