/**
 * CV signing (PRD 5.18): the signed envelope, Ed25519 over the SHA-256 of its RFC 8785
 * canonical JSON, and the 10-character codes. Web Crypto only, so the same code runs in
 * the cv-sign Edge Function (Deno) and in Node (verify page, tests).
 */
import { canonicalBytes } from "./canonical.ts";

/** Crockford base32: no I, L, O or U, so codes read aloud and typed by hand survive. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export interface CvEnvelope {
  v: 1;
  code: string;
  key_id: string;
  issued_at: string;
  expires_at: string;
  snapshot: Record<string, unknown>;
}

/** The envelope a stored record was signed as, rebuilt from its columns. */
export function envelopeOf(record: {
  code: string;
  key_id: string;
  issued_at: string | Date;
  expires_at: string | Date;
  snapshot: Record<string, unknown>;
}): CvEnvelope {
  return {
    v: 1,
    code: record.code,
    key_id: record.key_id,
    issued_at: isoSeconds(record.issued_at),
    expires_at: isoSeconds(record.expires_at),
    snapshot: record.snapshot,
  };
}

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join("");
}

/** Accepts "abcde-fghjk", lower case, and the usual misreadings (I/L → 1, O → 0). */
export function normaliseCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  return /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/.test(code) ? code : null;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** "2026-10-01T19:30:00Z": timestamps in the envelope have whole seconds and a Z. */
export function isoSeconds(value: string | Date): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (h) => parseInt(h, 16));
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/** SHA-256 (hex) of the envelope's canonical JSON: what the signature covers. */
export async function envelopeHash(envelope: CvEnvelope): Promise<string> {
  return hex(await sha256(canonicalBytes(envelope)));
}

export interface GeneratedKey {
  keyId: string;
  publicKey: string; // raw 32 bytes, base64url
  privateKey: string; // PKCS#8, base64
}

/** A new Ed25519 key; its id carries the day and the start of the public key's hash. */
export async function generateSigningKey(now = new Date()): Promise<GeneratedKey> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return {
    keyId: `cv-${day}-${hex(await sha256(raw)).slice(0, 8)}`,
    publicKey: toBase64Url(raw),
    privateKey: btoa(String.fromCharCode(...pkcs8)),
  };
}

export async function signEnvelope(envelope: CvEnvelope, privateKeyPkcs8: string): Promise<{ hash: string; signature: string }> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(privateKeyPkcs8), (c) => c.charCodeAt(0)) as BufferSource,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const hash = await envelopeHash(envelope);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, fromHex(hash) as BufferSource));
  return { hash, signature: toBase64Url(signature) };
}

export type SignatureCheck = "valid" | "hash_mismatch" | "bad_signature";

/**
 * Re-checks a stored record: the envelope rebuilt from its columns must hash to the stored
 * hash, and the signature must verify with the public key of the record's own key_id.
 */
export async function checkEnvelope(
  envelope: CvEnvelope,
  storedHash: string,
  signature: string,
  publicKey: string,
): Promise<SignatureCheck> {
  const hash = await envelopeHash(envelope);
  if (hash !== storedHash) return "hash_mismatch";
  try {
    const key = await crypto.subtle.importKey("raw", fromBase64Url(publicKey) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, fromBase64Url(signature) as BufferSource, fromHex(hash) as BufferSource);
    return ok ? "valid" : "bad_signature";
  } catch {
    return "bad_signature";
  }
}
