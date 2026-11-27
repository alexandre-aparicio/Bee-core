import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4200', browserName: 'chromium', headless: true },
  webServer: {
    command: 'node scripts/serve-production.mjs',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
