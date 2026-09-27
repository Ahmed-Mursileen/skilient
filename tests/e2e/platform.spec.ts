import { expect, test } from "@playwright/test";

test("pages carry security headers and a request id", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["strict-transport-security"]).toContain("max-age=63072000");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(h["x-powered-by"]).toBeUndefined();
});

test("a client-supplied request id is never trusted", async ({ request }) => {
  const res = await request.get("/", { headers: { "x-request-id": "attacker-chosen" } });
  expect(res.headers()["x-request-id"]).not.toBe("attacker-chosen");
});

test("/api/health reports each dependency", async ({ request }) => {
  const res = await request.get("/api/health");
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(Object.keys(body.checks).sort()).toEqual(["database", "realtime", "storage"]);
  if (process.env.E2E_EXPECT_HEALTHY === "1") expect(res.status()).toBe(200);
});
