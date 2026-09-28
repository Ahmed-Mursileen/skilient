import { describe, expect, it } from "vitest";
import { parsePreview } from "@/supabase/functions/_shared/links/meta";
import { checkUrl, isPrivateAddress, PreviewRefused, safeFetchHtml, type Resolve } from "@/supabase/functions/_shared/links/ssrf";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "127.8.9.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "64:ff9b::a00:1", "2001:db8::1", "not-an-ip",
  ])("refuses %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:93.184.216.34"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("checkUrl", () => {
  it.each([
    ["ftp://example.com/x", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["https://user:pw@example.com/", "credentials"],
    ["https://example.com:8080/", "port"],
    ["http://localhost/", "host"],
    ["http://printer.local/", "host"],
    ["not a url", "bad_url"],
  ])("refuses %s (%s)", (url, reason) => {
    expect(() => checkUrl(url)).toThrow(new PreviewRefused(reason));
  });
});

/** A tiny web: each URL answers with a status, headers and body like a real server. */
function web(pages: Record<string, { status?: number; headers?: Record<string, string>; body?: string; delayMs?: number }>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    const page = pages[url];
    if (!page) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    if (page.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, page.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    return new Response(page.body ?? "", { status: page.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...page.headers } });
  }) as typeof fetch;
  return { impl, calls };
}

const dns: Record<string, string[]> = {
  "good.example": ["93.184.216.34"],
  "evil.example": ["93.184.216.35"],
  "internal.example": ["10.1.2.3"],
  "mixed.example": ["93.184.216.36", "127.0.0.1"],
};
const resolve: Resolve = async (host) => dns[host] ?? [];

describe("safeFetchHtml", () => {
  it("fetches a public page", async () => {
    const w = web({ "https://good.example/a": { body: "<title>Good</title>" } });
    await expect(safeFetchHtml("https://good.example/a", { fetch: w.impl, resolve })).resolves.toMatchObject({ html: "<title>Good</title>" });
  });

  it("refuses a host that resolves to a private address, even partly", async () => {
    const w = web({});
    await expect(safeFetchHtml("https://internal.example/", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("private_address"));
    await expect(safeFetchHtml("https://mixed.example/", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("private_address"));
    await expect(safeFetchHtml("http://169.254.169.254/latest/meta-data/", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("private_address"));
    await expect(safeFetchHtml("http://[::1]/", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("private_address"));
    expect(w.calls).toEqual([]);
  });

  it("refuses a redirect into a private range", async () => {
    const w = web({ "https://evil.example/go": { status: 302, headers: { location: "http://127.0.0.1/admin" } } });
    await expect(safeFetchHtml("https://evil.example/go", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("private_address"));
    expect(w.calls).toEqual(["https://evil.example/go"]);
  });

  it("follows at most 3 redirects", async () => {
    const w = web({
      "https://good.example/1": { status: 301, headers: { location: "/2" } },
      "https://good.example/2": { status: 301, headers: { location: "/3" } },
      "https://good.example/3": { status: 301, headers: { location: "/4" } },
      "https://good.example/4": { status: 301, headers: { location: "/5" } },
      "https://good.example/5": { body: "<title>Too far</title>" },
    });
    await expect(safeFetchHtml("https://good.example/1", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("too_many_redirects"));
    const three = web({
      "https://good.example/1": { status: 301, headers: { location: "/2" } },
      "https://good.example/2": { status: 301, headers: { location: "/3" } },
      "https://good.example/3": { status: 301, headers: { location: "/4" } },
      "https://good.example/4": { body: "<title>Made it</title>" },
    });
    await expect(safeFetchHtml("https://good.example/1", { fetch: three.impl, resolve })).resolves.toMatchObject({ url: "https://good.example/4" });
  });

  it("gives up after the time budget", async () => {
    const w = web({ "https://good.example/slow": { body: "<title>Slow</title>", delayMs: 500 } });
    await expect(safeFetchHtml("https://good.example/slow", { fetch: w.impl, resolve, budgetMs: 50 })).rejects.toEqual(new PreviewRefused("timeout"));
  });

  it("refuses non-HTML", async () => {
    const w = web({ "https://good.example/file.zip": { headers: { "content-type": "application/zip" }, body: "PK" } });
    await expect(safeFetchHtml("https://good.example/file.zip", { fetch: w.impl, resolve })).rejects.toEqual(new PreviewRefused("not_html"));
  });
});

describe("parsePreview", () => {
  it("prefers Open Graph, decodes entities, keeps only https images", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Skilient &amp; friends">
      <meta name="description" content="Proof of   skills">
      <meta property="og:image" content="/img/card.png">
      <meta property="og:site_name" content="Skilient"></head></html>`;
    expect(parsePreview(html, "https://good.example/post")).toEqual({
      title: "Skilient & friends",
      description: "Proof of skills",
      imageUrl: "https://good.example/img/card.png",
      siteName: "Skilient",
    });
  });

  it("falls back to <title> and the host, drops http images", () => {
    const html = `<title>  Plain page </title><meta property="og:image" content="http://cdn.example/x.png">`;
    expect(parsePreview(html, "https://www.good.example/")).toEqual({
      title: "Plain page",
      description: null,
      imageUrl: null,
      siteName: "good.example",
    });
  });
});
