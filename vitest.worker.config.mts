import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Edge Function code against the local database (`pnpm db:start`); CI runs it after pgTAP. The "@" alias and the
// server-only stub let the billing registry test call real server actions with a mocked request.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/worker/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
