import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// One-off asset generation for the pitch film (not part of the product test suite).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../", import.meta.url)),
      "server-only": fileURLToPath(new URL("../tests/unit/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { include: ["pitch/scripts/*.gen.ts"], environment: "node", testTimeout: 30000 },
});
