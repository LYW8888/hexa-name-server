import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "admin.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4192",
    browserName: "chromium",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "python3 ../scripts/backoffice_e2e.py",
    url: "http://127.0.0.1:4192/api/session",
    env: { ...process.env, XUMING_E2E_TEST: "1" },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
