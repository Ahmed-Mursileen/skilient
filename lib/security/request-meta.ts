/**
 * What we know about the request making a sign-in: IP (for hashing only), user agent,
 * and Vercel's approximate location headers. Pure functions over Headers so they test easily.
 */

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

export function userAgent(headers: Headers): string {
  return (headers.get("user-agent") ?? "").slice(0, 512);
}

/** "Islamabad, PK" from Vercel's geo headers; null when unknown (local, other hosts). */
export function approximateLocation(headers: Headers): string | null {
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const city = decode(headers.get("x-vercel-ip-city"));
  const country = headers.get("x-vercel-ip-country");
  const parts = [city, country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** "Chrome on Android" from a user agent; good enough for an alert email. */
export function describeDevice(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "A browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return os ? `${browser} on ${os}` : browser;
}
