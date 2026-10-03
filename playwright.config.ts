import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Lets a machine with a preinstalled Chromium skip `playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  // Against a production build with the dev-only gallery switched on. A second server runs the same
  // build with a PostHog project key for tests/e2e/analytics.spec.ts; PostHog itself is faked there.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: `pnpm start --port ${PORT}`,
          url: `${baseURL}/ui`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { ENABLE_UI_GALLERY: "1" },
        },
        {
          command: `pnpm start --port ${PORT + 1}`,
          url: `http://127.0.0.1:${PORT + 1}/`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_e2e" },
        },
      ],
});
