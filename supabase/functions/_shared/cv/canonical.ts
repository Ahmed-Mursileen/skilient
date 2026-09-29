/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) for CV snapshots (PRD 5.18). Shared by the
 * cv-sign Edge Function, the verify page and the Node tests; no dependencies.
 *
 * - Object keys are sorted by their UTF-16 code units (JavaScript's default string sort).
 * - Numbers use ECMAScript's Number-to-String (what JSON.stringify prints); NaN and
 *   Infinity are refused.
 * - Strings use JSON.stringify's escaping, which is RFC 8785's; lone surrogates are refused
 *   because RFC 8785 input must be I-JSON.
 * - No whitespace.
 */
export class CanonicalError extends Error {}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function str(s: string): string {
  if (hasLoneSurrogate(s)) throw new CanonicalError("lone surrogate in string");
  return JSON.stringify(s);
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalError("non-finite number");
      return JSON.stringify(value);
    case "string":
      return str(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
      return `{${keys.map((k) => `${str(k)}:${canonicalize(obj[k])}`).join(",")}}`;
    }
    default:
      throw new CanonicalError(`cannot canonicalize ${typeof value}`);
  }
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
