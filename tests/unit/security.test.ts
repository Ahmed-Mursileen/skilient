import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { accountLockedEmail, escapeHtml, newDeviceEmail } from "@/lib/email/templates";
import { passwordStrength } from "@/lib/auth/password";
import { setLogSink } from "@/lib/log";
import { buildCsp, newNonce } from "@/lib/security/headers";
import { isBreachedPassword } from "@/lib/security/hibp";
import { approximateLocation, clientIp, describeDevice } from "@/lib/security/request-meta";

setLogSink(() => {});

describe("CSP", () => {
  const csp = buildCsp({
    nonce: "abc123",
    supabaseUrl: "https://proj.supabase.co",
    sentryDsn: "https://key@o1.ingest.de.sentry.io/2",
  });
  it("uses the nonce with strict-dynamic and no unsafe-inline scripts", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("unsafe-eval");
  });
  it("allows Supabase over https and wss, Sentry and Turnstile, and nothing frames us", () => {
    expect(csp).toContain("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co https://o1.ingest.de.sentry.io");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("doesn't upgrade requests to a plain-http local stack; dev allows eval for React", () => {
    const local = buildCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321", dev: true });
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(local).toContain("'unsafe-eval'");
    expect(local).toContain("ws://127.0.0.1:54321");
  });
  it("makes a fresh 128-bit nonce each time", () => {
    const a = newNonce();
    expect(atob(a)).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });
});

describe("breached-password check (k-anonymity)", () => {
  const password = "correct horse battery staple";
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();

  it("sends only the 5-character prefix and finds a listed suffix", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
      return new Response(`0000000000000000000000000000000000A:0\r\n${sha1.slice(5)}:42\r\n`);
    });
    expect(await isBreachedPassword(password, fetchMock as typeof fetch)).toBe(true);
  });
  it("ignores padding rows with a zero count", async () => {
    const fetchMock = vi.fn(async () => new Response(`${sha1.slice(5)}:0\r\n`));
    expect(await isBreachedPassword(password, fetchMock as typeof fetch)).toBe(false);
  });
  it("fails open when the API is down", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await isBreachedPassword(password, fetchMock as typeof fetch)).toBe(false);
  });
});

describe("password strength hint", () => {
  it("rates by length and variety", () => {
    expect(passwordStrength("short").label).toBe("Too short");
    expect(passwordStrength("aaaaaaaaaaaa").label).toBe("Weak");
    expect(passwordStrength("lowercaseonly").label).toBe("Fair");
    expect(passwordStrength("Longer-Pass-2026").label).toBe("Strong");
  });
});

describe("request metadata", () => {
  it("takes the first forwarded IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBeNull();
  });
  it("describes the device and approximate place", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1")).toBe("Safari on iOS");
    expect(approximateLocation(new Headers({ "x-vercel-ip-city": "Rawalpindi", "x-vercel-ip-country": "PK" }))).toBe("Rawalpindi, PK");
    expect(approximateLocation(new Headers())).toBeNull();
  });
});

describe("security emails", () => {
  it("escape everything that came from a request", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    const email = newDeviceEmail("a@nutech.edu.pk", {
      device: "<b>Chrome</b>",
      location: "Lahore, PK",
      at: new Date("2026-09-27T10:00:00Z"),
      notMeUrl: "https://skilient.pk/auth/not-me?token=abc",
    });
    expect(email.html).toContain("&lt;b&gt;Chrome&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Chrome</b>");
    expect(email.text).toContain("https://skilient.pk/auth/not-me?token=abc");
    expect(email.text).toContain("Lahore, PK");
  });
  it("tell the owner how to recover from a lock", () => {
    const email = accountLockedEmail("a@nutech.edu.pk", "https://skilient.pk/forgot-password");
    expect(email.subject).toContain("locked for 15 minutes");
    expect(email.html).toContain("https://skilient.pk/forgot-password");
  });
});
