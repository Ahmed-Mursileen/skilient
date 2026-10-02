import { defineConfig, devices } from "@playwright/test";

/**
 * Marketing product captures (docs/marketing-design-plan.md B5): `pnpm marketing:captures`
 * after `pnpm build`, against the local Supabase stack. Not part of the E2E suite.
 */
const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/captures",
  testMatch: /\.capture\.ts$/,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: { command: `pnpm start --port ${PORT}`, url: `${baseURL}/api/health`, reuseExistingServer: false, timeout: 120_000 },
});
