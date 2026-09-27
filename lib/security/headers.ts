/**
 * Security headers (PRD 10, Web application). Static headers ship from next.config.ts;
 * the nonce-based Content-Security-Policy is set per request in proxy.ts.
 */
export const securityHeaders: { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

/** Request header carrying the per-request CSP nonce from proxy.ts to the render. */
export const NONCE_HEADER = "x-nonce";

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const GOOGLE_ACCOUNTS_ORIGIN = "https://accounts.google.com";

export interface CspOptions {
  nonce: string;
  supabaseUrl?: string;
  sentryDsn?: string;
  dev?: boolean;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Nonce-based CSP: scripts only from this origin with the per-request nonce (plus what
 * they load, via 'strict-dynamic'), Turnstile's frame, Supabase (REST, Realtime, Storage
 * images) and Sentry. Styles allow inline attributes, which Radix and motion set.
 */
export function buildCsp({ nonce, supabaseUrl, sentryDsn, dev = false }: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const sentry = originOf(sentryDsn);
  const https = supabase?.startsWith("https://") ?? false;

  const directives: Record<string, (string | null | false)[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE_ORIGIN, dev && "'unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase, supabaseWs, sentry, TURNSTILE_ORIGIN, dev && "ws:"],
    "frame-src": [TURNSTILE_ORIGIN],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Google sign-in without JavaScript posts the form, then redirects through Supabase to Google.
    "form-action": ["'self'", supabase, GOOGLE_ACCOUNTS_ORIGIN],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) =>
    [name, ...values.filter((v): v is string => typeof v === "string" && v.length > 0)].join(" "),
  );
  // Only when the backend is on https: local stacks run on plain http://127.0.0.1.
  if (https && !dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** 128-bit random nonce, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
