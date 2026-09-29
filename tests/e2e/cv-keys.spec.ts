import { expect, test } from "@playwright/test";
import { hasBackend } from "./support";

/**
 * Phase 5 slice 1 (PRD 5.18): the CV signing keys are public, signed-out, at a fixed address,
 * each a raw Ed25519 key (base64url) with its dates. Keys themselves come from pgTAP
 * 37_verified_cv and the cv-sign worker test.
 */
test.describe("CV signing keys", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "runs once, on desktop");
  });

  test("the key file is public JSON", async ({ request }) => {
    const res = await request.get("/.well-known/skilient-cv-keys.json");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(res.headers()["cache-control"]).toContain("max-age=300");
    const body = (await res.json()) as { format: string; keys: { key_id: string; alg: string; public_key: string }[] };
    expect(body.format).toContain("RFC 8785");
    for (const key of body.keys) {
      expect(key.key_id).toMatch(/^cv-\d{8}-[0-9a-f]{8}$/);
      expect(key.alg).toBe("Ed25519");
      expect(key.public_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});
