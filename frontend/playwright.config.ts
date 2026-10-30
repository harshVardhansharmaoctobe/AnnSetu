import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against the running local stack:
 *   npm run chain · npm run deploy:local · npm run db · npm run dev   (see README)
 * Uses the system Microsoft Edge (or set PW_CHANNEL=chrome) — no browser download needed.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    channel: process.env.PW_CHANNEL ?? "msedge",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
  },
});
