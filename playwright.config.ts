import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the real UI against `next start` + the isolated foodbridge_test database.
// Requires a production build (`npm run build`) first.
// PW_CHANNEL=chrome uses the locally installed Google Chrome instead of downloading Playwright's Chromium.
const channel = process.env.PW_CHANNEL || undefined;
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel }, testIgnore: /mobile\.spec/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], channel }, testMatch: /mobile\.spec/ },
  ],
});
