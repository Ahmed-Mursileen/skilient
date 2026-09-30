import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// ATS text test (PRD 5.18): every CV template is printed by headless Chromium and its text
// extracted. Needs a Chromium (PW_CHROMIUM_PATH / CV_CHROMIUM_PATH, or @sparticuz on Linux);
// CI runs it in the E2E job after installing Playwright's.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/ats/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    fileParallelism: false,
  },
});
