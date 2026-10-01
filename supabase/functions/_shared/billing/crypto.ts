/** HMAC helpers with web crypto only (Deno, Node 22 and the browser-free Next runtime). */

const enc = new TextEncoder();

export function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(algo: "SHA-256" | "SHA-512", secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algo }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Constant-time comparison of two hex strings (lower-cased first). */
export function safeEqualHex(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** Minor units (paisa, cents) from a major amount, avoiding float drift. */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number | string): number {
  return Math.round(Number(minor)) / 100;
}
