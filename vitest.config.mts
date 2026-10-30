import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

// Unit tests: pure functions, no database or server.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
