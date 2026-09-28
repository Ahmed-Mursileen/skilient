/**
 * SSRF guard for link previews (PRD 5.28): only http(s) on ports 80/443, only public
 * addresses (every A/AAAA record checked, at every redirect hop), at most 3 redirects,
 * one 3 s budget for the whole fetch, HTML only, first 256 KB only.
 * Web APIs only: shared by the Edge Function (Deno) and its tests (Node).
 */

export type Resolve = (host: string) => Promise<string[]>;

export class PreviewRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

/** True for anything that isn't a plain public unicast address. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || // "this" network
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (v4[2] === 0 || v4[2] === 2)) || // IETF, TEST-NET-1
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      (a === 198 && b === 51 && v4[2] === 100) ||
      (a === 203 && b === 0 && v4[2] === 113) ||
      a >= 224 // multicast, reserved, broadcast
    );
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!v6.includes(":")) return true; // not an address we understand: refuse
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v6)) return true; // mapped, hex form
  const first = parseInt(v6.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && parseInt(v6.split(":")[1] || "0", 16) === 0xdb8 || // documentation
    first === 0x64 || // 64:ff9b::/96 NAT64 could reach private v4
    first === 0
  );
}

/** Parses and checks a URL's shape before any network work. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PreviewRefused("bad_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PreviewRefused("scheme");
  if (url.username || url.password) throw new PreviewRefused("credentials");
  if (url.port && url.port !== "80" && url.port !== "443") throw new PreviewRefused("port");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PreviewRefused("host");
  }
  return url;
}

/** Resolves the host (or takes a literal IP) and refuses unless every address is public. */
export async function checkHost(url: URL, resolve: Resolve): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = ipv4Parts(host) !== null || host.includes(":");
  const addresses = literal ? [host] : await resolve(host).catch(() => [] as string[]);
  if (!addresses.length) throw new PreviewRefused("dns");
  if (addresses.some(isPrivateAddress)) throw new PreviewRefused("private_address");
}

/** DNS over HTTPS (Cloudflare's JSON API), so the Edge runtime needs no DNS API. */
export function dohResolver(fetchImpl: typeof fetch, endpoint = "https://cloudflare-dns.com/dns-query"): Resolve {
  return async (host) => {
    const out: string[] = [];
    for (const type of ["A", "AAAA"]) {
      const res = await fetchImpl(`${endpoint}?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of body.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
    }
    return out;
  };
}

export const MAX_REDIRECTS = 3;
export const BUDGET_MS = 3000;
const MAX_BYTES = 256 * 1024;

/**
 * Fetches a page's HTML safely. Redirects are followed by hand so each hop is checked.
 * Returns the final URL and the (truncated) HTML.
 */
export async function safeFetchHtml(raw: string, deps: { fetch: typeof fetch; resolve: Resolve; budgetMs?: number }): Promise<{ url: string; html: string }> {
  const deadline = AbortSignal.timeout(deps.budgetMs ?? BUDGET_MS);
  let url = checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await checkHost(url, deps.resolve);
    let res: Response;
    try {
      res = await deps.fetch(url.toString(), {
        redirect: "manual",
        signal: deadline,
        headers: { "user-agent": "SkilientLinkPreview/1.0 (+https://skilient.pk)", accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      throw new PreviewRefused(deadline.aborted ? "timeout" : "network");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new PreviewRefused("redirect_without_location");
      if (hop === MAX_REDIRECTS) throw new PreviewRefused("too_many_redirects");
      url = checkUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new PreviewRefused(`http_${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new PreviewRefused("not_html");
    const html = await readCapped(res, MAX_BYTES, deadline);
    return { url: url.toString(), html };
  }
  throw new PreviewRefused("too_many_redirects");
}

async function readCapped(res: Response, max: number, signal: AbortSignal): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      if (signal.aborted) throw new PreviewRefused("timeout");
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, all.length - offset);
    all.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= all.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}
