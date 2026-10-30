import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'flows.spec.js',
  fullyParallel: true,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4191',
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'python3 ../server.py',
    url: 'http://127.0.0.1:4191/api/health',
    env: { ...process.env, HOST: '127.0.0.1', PORT: '4191' },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
