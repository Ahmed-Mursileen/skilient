import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GitHub, GitHubError, RateLimited, revokeGrant } from "@/supabase/functions/_shared/github/client";
import { appJwt, pemToPkcs8 } from "@/supabase/functions/_shared/github/jwt";
import { configFromEnv, safeEqual, type GithubConfig } from "@/supabase/functions/_shared/github/types";
import { summariseWebhook, verifySignature } from "@/lib/github/webhook";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const cfg: GithubConfig = {
  appId: "123",
  clientId: "Iv1.abc",
  clientSecret: "shh",
  privateKey,
  apiUrl: "https://api.github.test",
  webUrl: "https://github.test",
};

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("GitHub App JWT", () => {
  it("signs RS256 with a PKCS#1 key, verifiable with the App's public key", async () => {
    const jwt = await appJwt("123", privateKey, 1_700_000_000);
    const [header, payload, signature] = jwt.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(payload)).toEqual({ iat: 1_700_000_000 - 60, exp: 1_700_000_000 + 540, iss: "123" });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("accepts PKCS#8 keys as they are and refuses anything else", () => {
    const pkcs8 = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    expect(pemToPkcs8(pkcs8).length).toBeGreaterThan(1000);
    expect(() => pemToPkcs8("not a key")).toThrow(/not a PEM private key/);
  });

  it("reads secrets with literal \\n from the environment", () => {
    const env: Record<string, string> = {
      GITHUB_APP_ID: "1",
      GITHUB_APP_CLIENT_ID: "c",
      GITHUB_APP_CLIENT_SECRET: "s",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nAAAA\\n-----END RSA PRIVATE KEY-----",
    };
    const read = configFromEnv((k) => env[k]);
    expect(read.privateKey).toContain("\nAAAA\n");
    expect(read.apiUrl).toBe("https://api.github.com");
    expect(() => configFromEnv(() => undefined)).toThrow(/GITHUB_APP_ID is not set/);
  });
});

describe("GitHub client", () => {
  const reset = String(Math.floor(Date.now() / 1000) + 600);

  it("follows Link: rel=next across pages", async () => {
    const pages: Record<string, { items: number[]; next?: string }> = {
      "/things?per_page=2": { items: [1, 2], next: "https://api.github.test/things?per_page=2&page=2" },
      "/things?per_page=2&page=2": { items: [3] },
    };
    const fake = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = pages[`${url.pathname}${url.search}`];
      return new Response(JSON.stringify({ items: page.items }), {
        headers: { link: page.next ? `<${page.next}>; rel="next"` : "", "x-ratelimit-remaining": "4000", "x-ratelimit-reset": reset },
      });
    }) as typeof fetch;
    const gh = new GitHub(cfg, fake);
    expect(await gh.paginate<{ items: number[] }, number>("t", "/things?per_page=2", (p) => p.items)).toEqual([1, 2, 3]);
  });

  it("defers once a token's budget drops below 200, and on secondary limits", async () => {
    let remaining = "150";
    const fake = (async () =>
      new Response("{}", { headers: { "x-ratelimit-remaining": remaining, "x-ratelimit-reset": reset } })) as typeof fetch;
    const gh = new GitHub(cfg, fake);
    gh.ensureBudget("t"); // nothing known yet
    await gh.request("t", "/user");
    expect(() => gh.ensureBudget("t")).toThrow(RateLimited);
    remaining = "4000";
    gh.ensureBudget("other-token");

    const limited = (async () => new Response("{}", { status: 403, headers: { "retry-after": "30" } })) as typeof fetch;
    await expect(new GitHub(cfg, limited).request("t", "/user")).rejects.toMatchObject({ name: "RateLimited", seconds: 30 });
  });

  it("names the failing call without leaking query strings", async () => {
    const fake = (async () => new Response("{}", { status: 502 })) as typeof fetch;
    const error = await new GitHub(cfg, fake).request("t", "/repositories/5?secret=1").catch((e) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error.message).toBe("GET /repositories/5 returned 502");
  });

  it("revokes a grant with the App's client credentials", async () => {
    let seen: { url: string; auth: string | null; body: string } | null = null;
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(input), auth: new Headers(init?.headers).get("authorization"), body: String(init?.body) };
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    expect(await revokeGrant(cfg, fake, "gho_x")).toBe(true);
    expect(seen).toEqual({
      url: "https://api.github.test/applications/Iv1.abc/grant",
      auth: `Basic ${Buffer.from("Iv1.abc:shh").toString("base64")}`,
      body: JSON.stringify({ access_token: "gho_x" }),
    });
    const gone = (async () => new Response(null, { status: 404 })) as typeof fetch;
    expect(await revokeGrant(cfg, gone, "gho_x")).toBe(false);
  });

  it("compares bearer secrets without short-circuiting on length", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("Bearer ab", "Bearer abc")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("GitHub webhooks", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({ action: "created" });
  const sign = (b: string, s = secret) => `sha256=${createHmac("sha256", s).update(b).digest("hex")}`;

  it("accepts only GitHub's signature over the exact body", () => {
    expect(verifySignature(body, sign(body), secret)).toBe(true);
    expect(verifySignature(`${body} `, sign(body), secret)).toBe(false);
    expect(verifySignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha1=abc", secret)).toBe(false);
  });

  it("keeps commit ids but drops messages, authors' emails and diffs from pushes", () => {
    const summary = summariseWebhook("push", {
      ref: "refs/heads/main",
      before: "a",
      after: "b",
      forced: true,
      installation: { id: 9 },
      sender: { id: 7, login: "x", email: "x@example.com" },
      repository: { id: 1, full_name: "o/r", private: true, owner: { id: 7, login: "o" }, description: "secret plans" },
      commits: [{ id: "c1", message: "secret", author: { email: "x@example.com" }, added: ["a.ts"] }],
    });
    expect(summary).toEqual({
      action: null,
      installation: { id: 9 },
      sender: { id: 7 },
      repository: { id: 1, full_name: "o/r", private: true, owner: { id: 7 }, pushed_at: null },
      ref: "refs/heads/main",
      before: "a",
      after: "b",
      forced: true,
      created: false,
      deleted: false,
      commits: ["c1"],
    });
    expect(JSON.stringify(summary)).not.toMatch(/secret|example\.com|a\.ts/);
  });

  it("keeps who merged and reviewed a pull request, by id only", () => {
    const summary = summariseWebhook("pull_request", {
      action: "closed",
      repository: { id: 1, full_name: "o/r", private: false, owner: { id: 2 } },
      pull_request: { id: 5, number: 3, merged: true, merged_at: "2026-09-01T00:00:00Z", merged_by: { id: 8, login: "m" }, user: { id: 7 }, base: { repo: { id: 1 } }, body: "text" },
    });
    expect(summary.pull_request).toEqual({
      id: 5,
      number: 3,
      merged: true,
      merged_at: "2026-09-01T00:00:00Z",
      merged_by: { id: 8 },
      user: { id: 7 },
      base_repo: { id: 1 },
    });
  });
});
