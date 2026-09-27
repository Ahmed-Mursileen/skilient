import { defineConfig } from "vitest/config";

// Edge Function code against the local database (`pnpm db:start`); CI runs it after pgTAP.
export default defineConfig({
  test: {
    include: ["tests/worker/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
