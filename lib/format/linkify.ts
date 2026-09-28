/**
 * Splits post text into plain runs and http(s) links, so links render as anchors without
 * ever injecting HTML. Trailing punctuation stays outside the link.
 */
export type TextPart = { kind: "text"; value: string } | { kind: "link"; value: string; href: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0];
    const trailing = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? "";
    if (trailing) url = url.slice(0, -trailing.length);
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", value: text.slice(last, start) });
    parts.push({ kind: "link", value: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}
