import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "customer.spec.js",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4193",
    browserName: "chromium",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "python3 ../scripts/customer_e2e.py",
    url: "http://127.0.0.1:4193/api/health",
    env: { ...process.env, XUMING_CUSTOMER_E2E_TEST: "1" },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
