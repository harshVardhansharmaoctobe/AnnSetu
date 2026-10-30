import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

// Integration tests: real HTTP against `next start` + the isolated foodbridge_test database.
// Requires a production build (`npm run build`) first.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
